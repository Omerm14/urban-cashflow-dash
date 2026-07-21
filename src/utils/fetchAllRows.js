// Fetches every row matching `filters`, paginating past PostgREST's 1000-row
// default cap. An account with more than 1000 invoices (a realistic outcome of
// a year+ of Drive/Gmail backfill) would otherwise have its oldest invoices
// silently missing wherever this is used — KPIs, payment schedule, monthly
// projections, and the Invoices list all read from the same fetched data.
//
// The first page also requests an exact count, so any further pages are known
// up front and fetched concurrently instead of one round-trip at a time —
// serial pagination was adding real wall-clock latency for larger accounts.
const PAGE_SIZE = 1000;

const buildQuery = (supabaseClient, table, filters) => {
  let query = supabaseClient.from(table).select('*', { count: 'exact' });
  for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
  return query.order('created_at');
};

export const fetchAllRows = async (supabaseClient, table, filters) => {
  const first = await buildQuery(supabaseClient, table, filters).range(0, PAGE_SIZE - 1);
  if (first.error) return { data: null, error: first.error };

  const rows = [...(first.data || [])];
  const total = first.count ?? rows.length;
  const remainingPages = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  if (remainingPages > 0) {
    const pages = await Promise.all(
      Array.from({ length: remainingPages }, (_, i) => {
        const from = (i + 1) * PAGE_SIZE;
        return buildQuery(supabaseClient, table, filters).range(from, from + PAGE_SIZE - 1);
      })
    );
    for (const page of pages) {
      if (page.error) return { data: null, error: page.error };
      rows.push(...(page.data || []));
    }
  }

  return { data: rows, error: null };
};
