import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { todayISO, groupCollectUpdates, DEFAULT_PAYMENT_METHOD } from "../utils/collections";
import { normalizeName, newCustomerNames } from "../utils/collectionsImport";

// Customers + receivables for the Collections tab. Reads/writes go straight to
// Supabase with the user's JWT (RLS-scoped, migration 020); every query also
// filters by user_id explicitly, matching the supplier CRUD in useInvoiceData.
// Kept separate from useInvoiceData so supplier/invoice logic is untouched.
// Customers come back in creation order so avatar colors stay stable; views sort by name.

// Postgres FK violation — deleting a customer that still has receivables (ON DELETE RESTRICT).
const FK_VIOLATION = "23503";

export const useCollections = () => {
  const { user } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [receivables, setReceivables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    setLoading(true);
    setLoadError(null);
    Promise.all([
      supabase.from("customers").select("*").eq("user_id", user.id).order("created_at"),
      supabase.from("receivables").select("*").eq("user_id", user.id).order("expected_date"),
    ]).then(([{ data: cs, error: ce }, { data: rs, error: re }]) => {
      if (!mounted) return;
      if (ce) console.error("customers load error:", ce.message);
      if (re) console.error("receivables load error:", re.message);
      if (ce || re) setLoadError((ce || re).message);
      setCustomers(cs ?? []);
      setReceivables(rs ?? []);
      setLoading(false);
    });
    return () => { mounted = false; };
  }, [user]);

  // Customers
  const addCustomer = useCallback(async data => {
    const { data: row, error } = await supabase.from("customers").insert({ ...data, user_id: user.id }).select().single();
    if (error) { console.error("addCustomer:", error.message); throw error; }
    setCustomers(p => [...p, row]);
    return row;
  }, [user]);

  const updateCustomer = useCallback(async (id, patch) => {
    const { error } = await supabase.from("customers").update(patch).eq("id", id).eq("user_id", user.id);
    if (error) { console.error("updateCustomer:", error.message); throw error; }
    setCustomers(p => p.map(c => c.id === id ? { ...c, ...patch } : c));
  }, [user]);

  // Throws an error with code "has_receivables" when the DB refuses (FK RESTRICT),
  // so the UI can explain instead of showing a raw Postgres message.
  const deleteCustomer = useCallback(async id => {
    const { error } = await supabase.from("customers").delete().eq("id", id).eq("user_id", user.id);
    if (error) {
      console.error("deleteCustomer:", error.message);
      if (error.code === FK_VIOLATION) { const e = new Error("has_receivables"); e.code = "has_receivables"; throw e; }
      throw error;
    }
    setCustomers(p => p.filter(c => c.id !== id));
  }, [user]);

  // Receivables
  const addReceivable = useCallback(async data => {
    const { data: row, error } = await supabase.from("receivables").insert({ ...data, user_id: user.id }).select().single();
    if (error) { console.error("addReceivable:", error.message); throw error; }
    setReceivables(p => [...p, row]);
    return row;
  }, [user]);

  const updateReceivable = useCallback(async (id, patch) => {
    const { error } = await supabase.from("receivables").update(patch).eq("id", id).eq("user_id", user.id);
    if (error) { console.error("updateReceivable:", error.message); throw error; }
    setReceivables(p => p.map(r => r.id === id ? { ...r, ...patch } : r));
  }, [user]);

  const deleteReceivable = useCallback(async id => {
    const { error } = await supabase.from("receivables").delete().eq("id", id).eq("user_id", user.id);
    if (error) { console.error("deleteReceivable:", error.message); throw error; }
    setReceivables(p => p.filter(r => r.id !== id));
  }, [user]);

  // History import: create missing customers in one insert, then all receivables in one
  // insert (atomic per statement — never a partial set of receivables). If the second
  // insert fails, the new customers remain; they're visible and harmless.
  // `rows` are review rows (src/utils/collectionsImport.js) already filtered to include=true.
  const importCollections = useCallback(async rows => {
    const names = newCustomerNames(rows.map(r => ({ ...r, include: true })));
    let created = [];
    if (names.length) {
      const { data, error } = await supabase.from("customers").insert(names.map(name => ({ name, user_id: user.id }))).select();
      if (error) { console.error("importCollections customers:", error.message); throw error; }
      created = data ?? [];
      setCustomers(p => [...p, ...created]);
    }
    const idByName = new Map(created.map(c => [normalizeName(c.name), c.id]));
    const payload = rows.map(r => ({
      user_id: user.id,
      customer_id: r.customerId || idByName.get(normalizeName(r.customer)),
      amount: Math.round(Number(r.amount) * 100) / 100,
      expected_date: r.expected_date,
      collected_date: r.collected_date || null,
      payment_method: r.collected_date ? (r.payment_method || null) : null,
      reference: r.reference?.trim() || null,
      description: r.description?.trim() || null,
    }));
    if (payload.some(p => !p.customer_id)) throw new Error("import: unresolved customer");
    const { data, error } = await supabase.from("receivables").insert(payload).select();
    if (error) { console.error("importCollections receivables:", error.message); throw error; }
    setReceivables(p => [...p, ...(data ?? [])]);
    return { receivables: data?.length ?? 0, customers: created.length };
  }, [user]);

  const markCollected = useCallback((id, { date = todayISO(), method = DEFAULT_PAYMENT_METHOD } = {}) =>
    updateReceivable(id, { collected_date: date, payment_method: method }), [updateReceivable]);
  const markOpen = useCallback(id => updateReceivable(id, { collected_date: null, payment_method: null }), [updateReceivable]);

  // Undo several collections at once (one update, scoped by user_id).
  const bulkMarkOpen = useCallback(async ids => {
    if (!ids.length) return 0;
    const patch = { collected_date: null, payment_method: null };
    const { error } = await supabase.from("receivables").update(patch).in("id", ids).eq("user_id", user.id);
    if (error) { console.error("bulkMarkOpen:", error.message); throw error; }
    const set = new Set(ids);
    setReceivables(p => p.map(r => set.has(r.id) ? { ...r, ...patch } : r));
    return ids.length;
  }, [user]);

  // Collect several receivables, each with its own date and method. Rows sharing a
  // (date, method) go out as one update (usually 1–3 round-trips). Local state only
  // reflects groups that actually saved; a failure is rethrown after partial success
  // has been applied so the screen never shows something the DB doesn't have.
  const bulkMarkCollected = useCallback(async rows => {
    let firstError = null;
    const saved = new Map();
    for (const g of groupCollectUpdates(rows)) {
      const patch = { collected_date: g.date, payment_method: g.method };
      const { error } = await supabase.from("receivables").update(patch).in("id", g.ids).eq("user_id", user.id);
      if (error) { console.error("bulkMarkCollected:", error.message); firstError = firstError || error; continue; }
      g.ids.forEach(id => saved.set(id, patch));
    }
    if (saved.size) setReceivables(p => p.map(r => saved.has(r.id) ? { ...r, ...saved.get(r.id) } : r));
    if (firstError) { firstError.savedCount = saved.size; throw firstError; }
    return saved.size;
  }, [user]);

  return {
    customers, receivables, loading, loadError,
    addCustomer, updateCustomer, deleteCustomer,
    addReceivable, updateReceivable, deleteReceivable, markCollected, markOpen, bulkMarkCollected, bulkMarkOpen,
    importCollections,
  };
};
