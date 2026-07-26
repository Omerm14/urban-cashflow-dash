import { describe, it, expect } from 'vitest';
import { fetchAllRows } from '../src/utils/fetchAllRows.js';

// CASH-48: useInvoiceData's initial load and refreshInvoices() both fetched
// `select('*')` with no .range()/.limit(), so PostgREST silently capped
// results at 1000 rows — an account past that had its oldest invoices vanish
// from the entire dashboard (KPIs, payment schedule, projections, Invoices
// list). fetchAllRows() paginates via .range() so every row is returned
// regardless of table size. Pages beyond the first are fetched concurrently
// (using the first page's exact count) rather than one at a time, so large
// accounts don't pay N serial round-trips of latency.

const mockClient = (allRows, { onRange } = {}) => ({
  from: () => {
    const state = { filters: {} };
    const builder = {
      select: () => builder,
      eq: (col, val) => { state.filters[col] = val; return builder; },
      order: () => builder,
      range: (from, to) => {
        onRange?.(from, to);
        const matched = allRows.filter(r =>
          Object.entries(state.filters).every(([k, v]) => r[k] === v)
        );
        return Promise.resolve({ data: matched.slice(from, to + 1), error: null, count: matched.length });
      },
    };
    return builder;
  },
});

describe('fetchAllRows (CASH-48: paginate past the 1000-row PostgREST cap)', () => {
  it('collects rows across multiple pages instead of stopping at 1000', async () => {
    const allRows = Array.from({ length: 1500 }, (_, i) => ({ id: i, user_id: 'u1' }));
    const client = mockClient(allRows);

    const { data, error } = await fetchAllRows(client, 'invoices', { user_id: 'u1' });

    expect(error).toBeNull();
    expect(data).toHaveLength(1500);
    expect(data.map(r => r.id)).toContain(1499); // past the old 1000-row cap
  });

  it('applies every filter (not just the first) and returns a single page unchanged for small accounts', async () => {
    const allRows = [
      { id: 1, user_id: 'u1' },
      { id: 2, user_id: 'u2' },
      { id: 3, user_id: 'u1' },
    ];
    const client = mockClient(allRows);

    const { data } = await fetchAllRows(client, 'invoices', { user_id: 'u1' });

    expect(data.map(r => r.id)).toEqual([1, 3]);
  });

  it('propagates a query error instead of returning a partial result set', async () => {
    const client = {
      from: () => {
        const builder = {
          select: () => builder,
          eq: () => builder,
          order: () => builder,
          range: () => Promise.resolve({ data: null, error: { message: 'connection reset' } }),
        };
        return builder;
      },
    };

    const { data, error } = await fetchAllRows(client, 'invoices', { user_id: 'u1' });

    expect(data).toBeNull();
    expect(error.message).toBe('connection reset');
  });

  it('fetches pages beyond the first concurrently instead of one at a time', async () => {
    const totalRows = 2500; // 3 pages: [0,999] [1000,1999] [2000,2499]
    const events = [];
    const client = {
      from: () => {
        const builder = {
          select: () => builder,
          eq: () => builder,
          order: () => builder,
          range: (from, to) => {
            events.push(`issue:${from}`);
            return new Promise(resolve => {
              setTimeout(() => {
                events.push(`resolve:${from}`);
                const end = Math.min(to, totalRows - 1);
                const data = Array.from({ length: Math.max(0, end - from + 1) }, (_, i) => ({ id: from + i }));
                resolve({ data, error: null, count: totalRows });
              }, 5);
            });
          },
        };
        return builder;
      },
    };

    const { data, error } = await fetchAllRows(client, 'invoices', {});

    expect(error).toBeNull();
    expect(data).toHaveLength(totalRows);
    // Pages 2 (from=1000) and 3 (from=2000) must both be in flight before
    // either resolves — proves they were fired together (Promise.all), not
    // awaited one after another.
    expect(events.indexOf('issue:2000')).toBeLessThan(events.indexOf('resolve:1000'));
    expect(events.indexOf('issue:1000')).toBeLessThan(events.indexOf('resolve:2000'));
  });
});

// CASH-113: ordering by created_at alone gives Postgres/PostgREST no stable
// order across rows sharing the same created_at — common after a Drive/Gmail
// sync batch or a Green Invoice bulk import. A row on a page boundary could
// be skipped entirely or returned twice across sequential .range() fetches.
// This mock models that real non-determinism: without an 'id' tiebreaker in
// the recorded .order() chain, a tied group's relative order is free to
// differ between the two separate page requests (simulated by reversing it
// on every other call) — exactly reproducing the skip/duplicate bug. With
// the 'id' tiebreaker, the sort is fully deterministic and pagination is
// always exact.
const mockClientWithOrdering = (allRows) => {
  let callCount = 0;
  return {
    from: () => {
      const state = { filters: {}, orderCols: [] };
      const builder = {
        select: () => builder,
        eq: (col, val) => { state.filters[col] = val; return builder; },
        order: (col) => { state.orderCols.push(col); return builder; },
        range: (from, to) => {
          callCount += 1;
          const matched = allRows.filter(r =>
            Object.entries(state.filters).every(([k, v]) => r[k] === v)
          );
          const hasIdTiebreaker = state.orderCols.includes('id');
          const sorted = [...matched].sort((a, b) => {
            for (const col of state.orderCols) {
              if (a[col] !== b[col]) return a[col] < b[col] ? -1 : 1;
            }
            return 0;
          });

          let result = sorted;
          if (!hasIdTiebreaker) {
            result = [];
            let i = 0;
            while (i < sorted.length) {
              let j = i + 1;
              while (j < sorted.length && state.orderCols.every(col => sorted[j][col] === sorted[i][col])) j += 1;
              const group = sorted.slice(i, j);
              result.push(...(callCount % 2 === 0 ? [...group].reverse() : group));
              i = j;
            }
          }

          return Promise.resolve({ data: result.slice(from, to + 1), error: null, count: matched.length });
        },
      };
      return builder;
    },
  };
};

describe('fetchAllRows stable ordering (CASH-113: .order("id") tiebreaker)', () => {
  it('returns every row exactly once, gap-free, when many rows share the created_at that lands on a page boundary', async () => {
    // 1010 rows so pagination spans two .range() calls (PAGE_SIZE=1000); rows
    // 995-1004 all share the same created_at, straddling the page-1/page-2
    // boundary at index 999/1000 — exactly the scenario the tiebreaker fixes.
    const TIE_START = 995, TIE_END = 1004;
    const allRows = Array.from({ length: 1010 }, (_, i) => ({
      id: i,
      created_at: (i >= TIE_START && i <= TIE_END) ? TIE_START : i,
    }));
    const client = mockClientWithOrdering(allRows);

    const { data, error } = await fetchAllRows(client, 'invoices', {});

    expect(error).toBeNull();
    expect(data).toHaveLength(1010);
    const ids = data.map(r => r.id);
    expect(new Set(ids).size).toBe(1010); // no duplicates
    expect(new Set(ids)).toEqual(new Set(Array.from({ length: 1010 }, (_, i) => i))); // no gaps
  });

  it('demonstrates the bug this fixes: created_at-only ordering skips and duplicates rows across the same boundary', async () => {
    // Same fixture, but querying with only .order('created_at') (no 'id'
    // tiebreaker) — this is what the code looked like before CASH-113 and
    // must still show the failure mode via this mock, proving the mock
    // faithfully represents the bug the real fix addresses.
    const TIE_START = 995, TIE_END = 1004;
    const allRows = Array.from({ length: 1010 }, (_, i) => ({
      id: i,
      created_at: (i >= TIE_START && i <= TIE_END) ? TIE_START : i,
    }));
    const client = mockClientWithOrdering(allRows);

    const first = await client.from('invoices').select('*', { count: 'exact' }).order('created_at').range(0, 999);
    const second = await client.from('invoices').select('*', { count: 'exact' }).order('created_at').range(1000, 1999);
    const ids = [...first.data, ...second.data].map(r => r.id);

    expect(new Set(ids).size).toBeLessThan(1010); // some id appears more than once
    const missing = Array.from({ length: 1010 }, (_, i) => i).filter(i => !ids.includes(i));
    expect(missing.length).toBeGreaterThan(0); // and some id is missing entirely
  });
});
