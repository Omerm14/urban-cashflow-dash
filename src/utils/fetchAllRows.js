// Fetches every row matching `filters`, paginating past PostgREST's 1000-row
// default cap. An account with more than 1000 invoices (a realistic outcome of
// a year+ of Drive/Gmail backfill) would otherwise have its oldest invoices
// silently missing wherever this is used — KPIs, payment schedule, monthly
// projections, and the Invoices list all read from the same fetched data.
const PAGE_SIZE = 1000;

export const fetchAllRows = async (supabaseClient, table, filters) => {
  const rows = [];
  let from = 0;
  while (true) {
    let query = supabaseClient.from(table).select('*');
    for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
    const { data, error } = await query.order('created_at').range(from, from + PAGE_SIZE - 1);
    if (error) return { data: null, error };
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return { data: rows, error: null };
};
