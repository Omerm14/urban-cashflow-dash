import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { todayISO } from "../utils/collections";

// Customers + receivables for the Collections tab. Reads/writes go straight to
// Supabase with the user's JWT (RLS-scoped, migration 020); every query also
// filters by user_id explicitly, matching the supplier CRUD in useInvoiceData.
// Kept separate from useInvoiceData so supplier/invoice logic is untouched.

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
      supabase.from("customers").select("*").eq("user_id", user.id).order("name"),
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

  const markCollected = useCallback((id, date = todayISO()) => updateReceivable(id, { collected_date: date }), [updateReceivable]);
  const markOpen = useCallback(id => updateReceivable(id, { collected_date: null }), [updateReceivable]);

  return {
    customers, receivables, loading, loadError,
    addCustomer, updateCustomer, deleteCustomer,
    addReceivable, updateReceivable, deleteReceivable, markCollected, markOpen,
  };
};
