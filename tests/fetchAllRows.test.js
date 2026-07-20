import { describe, it, expect } from 'vitest';
import { fetchAllRows } from '../src/utils/fetchAllRows.js';

// CASH-48: useInvoiceData's initial load and refreshInvoices() both fetched
// `select('*')` with no .range()/.limit(), so PostgREST silently capped
// results at 1000 rows — an account past that had its oldest invoices vanish
// from the entire dashboard (KPIs, payment schedule, projections, Invoices
// list). fetchAllRows() paginates via .range() so every row is returned
// regardless of table size.

const mockClient = allRows => ({
  from: () => {
    const state = { filters: {} };
    const builder = {
      select: () => builder,
      eq: (col, val) => { state.filters[col] = val; return builder; },
      order: () => builder,
      range: (from, to) => {
        const matched = allRows.filter(r =>
          Object.entries(state.filters).every(([k, v]) => r[k] === v)
        );
        return Promise.resolve({ data: matched.slice(from, to + 1), error: null });
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
});
