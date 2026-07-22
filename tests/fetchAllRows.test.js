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
