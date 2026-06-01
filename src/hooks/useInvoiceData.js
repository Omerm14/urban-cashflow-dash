import { useState, useEffect, useMemo, useCallback } from "react";
import { STATUS, PALETTE } from "../constants";
import { calcDueDate, toYM } from "../utils/dates";
import { findDuplicates, matchSupplier } from "../utils/invoice";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";

export const useInvoiceData = () => {
  const { user } = useAuth();
  const [suppliers, setSuppliers] = useState([]);
  const [invoices,  setInvoices]  = useState([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('invoices').select('*').eq('user_id', user.id).order('created_at'),
      supabase.from('suppliers').select('*').eq('user_id', user.id),
    ]).then(([{ data: invs, error: ie }, { data: sups, error: se }]) => {
      if (ie) console.error('invoices load error:', ie.message);
      if (se) console.error('suppliers load error:', se.message);
      setInvoices(invs  ?? []);
      setSuppliers(sups ?? []);
      setLoading(false);
    });
  }, [user]);

  // Invoice CRUD
  const addInvoice = useCallback(async data => {
    const { data: row, error } = await supabase.from('invoices').insert({ ...data, user_id: user.id }).select().single();
    if (error) { console.error('addInvoice:', error.message); throw error; }
    setInvoices(p => [...p, row]);
    return row;
  }, [user]);

  const updateInvoice = useCallback(async (id, patch) => {
    const { error } = await supabase.from('invoices').update(patch).eq('id', id);
    if (error) { console.error('updateInvoice:', error.message); throw error; }
    setInvoices(p => p.map(i => i.id === id ? { ...i, ...patch } : i));
  }, []);

  const deleteInvoice = useCallback(async id => {
    const { error } = await supabase.from('invoices').delete().eq('id', id);
    if (error) { console.error('deleteInvoice:', error.message); throw error; }
    setInvoices(p => p.filter(i => i.id !== id));
  }, []);

  const bulkMarkPaid = useCallback(async ids => {
    const { error } = await supabase.from('invoices').update({ status: STATUS.PAID }).in('id', ids);
    if (error) { console.error('bulkMarkPaid:', error.message); throw error; }
    setInvoices(p => p.map(i => ids.includes(i.id) ? { ...i, status: STATUS.PAID } : i));
  }, []);

  const bulkDelete = useCallback(async ids => {
    const { error } = await supabase.from('invoices').delete().in('id', ids);
    if (error) { console.error('bulkDelete:', error.message); throw error; }
    setInvoices(p => p.filter(i => !ids.includes(i.id)));
  }, []);

  // Supplier CRUD
  const addSupplier = useCallback(async data => {
    const { data: row, error } = await supabase.from('suppliers').insert({ ...data, user_id: user.id }).select().single();
    if (error) { console.error('addSupplier:', error.message); throw error; }
    setSuppliers(p => [...p, row]);
    return row;
  }, [user]);

  const updateSupplier = useCallback(async (id, patch) => {
    const { error } = await supabase.from('suppliers').update(patch).eq('id', id);
    if (error) { console.error('updateSupplier:', error.message); throw error; }
    setSuppliers(p => p.map(s => s.id === id ? { ...s, ...patch } : s));
  }, []);

  const deleteSupplier = useCallback(async id => {
    const { error } = await supabase.from('suppliers').delete().eq('id', id);
    if (error) { console.error('deleteSupplier:', error.message); throw error; }
    setSuppliers(p => p.filter(s => s.id !== id));
  }, []);

  const refreshInvoices = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase.from('invoices').select('*').eq('user_id', user.id).order('created_at');
    if (!error) setInvoices(data ?? []);
  }, [user]);

  // Append new invoices from a sync batch without re-fetching everything
  const appendInvoices = useCallback(newInvoices => {
    setInvoices(prev => {
      const existingIds = new Set(prev.map(i => i.id));
      const fresh = newInvoices.filter(i => !existingIds.has(i.id));
      return fresh.length ? [...prev, ...fresh] : prev;
    });
  }, []);

  const getSupplier = useCallback(name => matchSupplier(name, suppliers), [suppliers]);

  const computed = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return invoices.map(inv => {
      const sup = matchSupplier(inv.supplier, suppliers);
      const due = inv.due_date || inv.dueDate || (calcDueDate(inv.invoice_date || inv.invoiceDate, sup)?.toISOString().split("T")[0] ?? null);
      let status = inv.status;
      if (status !== STATUS.PAID && status !== STATUS.CREDIT && due && new Date(due) < today) status = STATUS.OVERDUE;
      return {
        ...inv,
        // normalise snake_case DB fields → camelCase for UI
        invoiceNo:   inv.invoice_no   ?? inv.invoiceNo   ?? '',
        invoiceDate: inv.invoice_date ?? inv.invoiceDate ?? '',
        dueDate:     due,
        status,
      };
    });
  }, [invoices, suppliers]);

  const dupeIds = useMemo(() => findDuplicates(computed), [computed]);

  const monthlyData = useMemo(() => {
    const map = {};
    computed.filter(i => i.status !== STATUS.PAID && i.dueDate).forEach(inv => {
      const ym = toYM(inv.dueDate);
      if (!map[ym]) map[ym] = {};
      map[ym][inv.supplier] = (map[ym][inv.supplier] || 0) + Number(inv.amount);
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, sups]) => ({ ym, sups, total: Object.values(sups).reduce((s, v) => s + v, 0) }));
  }, [computed]);

  const allNames = useMemo(() => [...new Set(computed.map(i => i.supplier))], [computed]);

  const color = useCallback(
    name => PALETTE[allNames.indexOf(name) % PALETTE.length],
    [allNames],
  );

  const maxTotal = useMemo(() => Math.max(...monthlyData.map(m => m.total), 1), [monthlyData]);

  const kpis = useMemo(() => {
    const nm = toYM(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1));
    return {
      outstanding: computed.filter(i => i.status !== STATUS.PAID).reduce((s, i) => s + Number(i.amount), 0),
      overdue:     computed.filter(i => i.status === STATUS.OVERDUE).reduce((s, i) => s + Number(i.amount), 0),
      paid:        computed.filter(i => i.status === STATUS.PAID).reduce((s, i) => s + Number(i.amount), 0),
      nextMonth:   monthlyData.find(m => m.ym === nm)?.total || 0,
    };
  }, [computed, monthlyData]);

  return {
    suppliers, invoices, computed, dupeIds, monthlyData, allNames, color, maxTotal, kpis, loading,
    addInvoice, updateInvoice, deleteInvoice, bulkMarkPaid, bulkDelete,
    addSupplier, updateSupplier, deleteSupplier,
    getSupplier, refreshInvoices, appendInvoices,
  };
};
