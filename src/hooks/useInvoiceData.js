import { useState, useEffect, useMemo, useCallback } from "react";
import { STATUS, PALETTE, DIRECTION, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "../constants";
import { calcDueDate, toYM } from "../utils/dates";
import { findDuplicates, matchSupplier, getMissingSuppliers, getSupplierMonthlyAnomalies } from "../utils/invoice";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";

export const useInvoiceData = () => {
  const { user } = useAuth();
  const [suppliers, setSuppliers] = useState([]);
  const [invoices,  setInvoices]  = useState([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    Promise.all([
      supabase.from('invoices').select('*').eq('user_id', user.id).order('created_at'),
      supabase.from('suppliers').select('*').eq('user_id', user.id),
    ]).then(([{ data: invs, error: ie }, { data: sups, error: se }]) => {
      if (!mounted) return;
      if (ie) console.error('invoices load error:', ie.message);
      if (se) console.error('suppliers load error:', se.message);
      setInvoices(invs  ?? []);
      setSuppliers(sups ?? []);
      setLoading(false);
    });
    return () => { mounted = false; };
  }, [user]);

  // Invoice CRUD
  const addInvoice = useCallback(async data => {
    const { data: row, error } = await supabase.from('invoices').insert({ ...data, user_id: user.id }).select().single();
    if (error) { console.error('addInvoice:', error.message); throw error; }
    setInvoices(p => [...p, row]);
    return row;
  }, [user]);

  const updateInvoice = useCallback(async (id, patch) => {
    const { error } = await supabase.from('invoices').update(patch).eq('id', id).eq('user_id', user.id);
    if (error) { console.error('updateInvoice:', error.message); throw error; }
    setInvoices(p => p.map(i => i.id === id ? { ...i, ...patch } : i));
  }, [user]);

  // Deletes go through the API so the original file in object storage is removed
  // alongside the row (the browser has no delete credentials for R2).
  const deleteInvoice = useCallback(async id => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`/api/invoices/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session?.access_token}` },
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({}));
      console.error('deleteInvoice:', error); throw new Error(error || 'Delete failed');
    }
    setInvoices(p => p.filter(i => i.id !== id));
  }, []);

  const bulkMarkPaid = useCallback(async ids => {
    const { error } = await supabase.from('invoices').update({ status: STATUS.PAID }).in('id', ids).eq('user_id', user.id);
    if (error) { console.error('bulkMarkPaid:', error.message); throw error; }
    setInvoices(p => p.map(i => ids.includes(i.id) ? { ...i, status: STATUS.PAID } : i));
  }, [user]);

  const bulkMarkUnpaid = useCallback(async ids => {
    const { error } = await supabase.from('invoices').update({ status: STATUS.UNPAID }).in('id', ids).eq('user_id', user.id);
    if (error) { console.error('bulkMarkUnpaid:', error.message); throw error; }
    setInvoices(p => p.map(i => ids.includes(i.id) ? { ...i, status: STATUS.UNPAID } : i));
  }, [user]);

  const bulkDelete = useCallback(async ids => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/invoices/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({}));
      console.error('bulkDelete:', error); throw new Error(error || 'Bulk delete failed');
    }
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
    const { error } = await supabase.from('suppliers').update(patch).eq('id', id).eq('user_id', user.id);
    if (error) { console.error('updateSupplier:', error.message); throw error; }
    setSuppliers(p => p.map(s => s.id === id ? { ...s, ...patch } : s));
  }, [user]);

  const deleteSupplier = useCallback(async id => {
    const { error } = await supabase.from('suppliers').delete().eq('id', id).eq('user_id', user.id);
    if (error) { console.error('deleteSupplier:', error.message); throw error; }
    setSuppliers(p => p.filter(s => s.id !== id));
  }, [user]);

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

  const addIncomeEntry = useCallback(async data => {
    return addInvoice({ ...data, direction: DIRECTION.INCOME });
  }, [addInvoice]);

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
        direction:   inv.direction ?? DIRECTION.EXPENSE,
        category:    inv.category  ?? null,
      };
    });
  }, [invoices, suppliers]);

  const dupeIds = useMemo(() => findDuplicates(computed), [computed]);

  const currentYM = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const missingSuppliers = useMemo(
    () => getMissingSuppliers(invoices, suppliers, currentYM),
    [invoices, suppliers, currentYM]
  );

  const anomalyMap = useMemo(() => getSupplierMonthlyAnomalies(invoices), [invoices]);

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
      outstanding: computed.filter(i => i.status !== STATUS.PAID && i.direction !== DIRECTION.INCOME).reduce((s, i) => s + Number(i.amount), 0),
      overdue:     computed.filter(i => i.status === STATUS.OVERDUE).reduce((s, i) => s + Number(i.amount), 0),
      paid:        computed.filter(i => i.status === STATUS.PAID && i.direction !== DIRECTION.INCOME).reduce((s, i) => s + Number(i.amount), 0),
      nextMonth:   monthlyData.find(m => m.ym === nm)?.total || 0,
    };
  }, [computed, monthlyData]);

  // P&L computation: group by month × direction × category
  const plData = useMemo(() => {
    const now = new Date();
    // Build last 6 months + current month list
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(toYM(d));
    }

    const income  = {};  // { ym: { category: amount } }
    const expense = {};  // { ym: { category: amount } }

    months.forEach(ym => { income[ym] = {}; expense[ym] = {}; });

    computed.forEach(inv => {
      const ym = toYM(inv.invoiceDate || inv.invoice_date || inv.dueDate);
      if (!ym || !months.includes(ym)) return;
      const amt = Number(inv.amount) || 0;
      if (amt <= 0 && inv.status !== STATUS.CREDIT) return;

      const cat = inv.category || (inv.direction === DIRECTION.INCOME ? 'other_income' : 'other_expense');

      if (inv.direction === DIRECTION.INCOME) {
        income[ym][cat] = (income[ym][cat] || 0) + Math.abs(amt);
      } else {
        expense[ym][cat] = (expense[ym][cat] || 0) + Math.abs(amt);
      }
    });

    const net = {};
    months.forEach(ym => {
      const totalIn  = Object.values(income[ym]).reduce((s, v) => s + v, 0);
      const totalOut = Object.values(expense[ym]).reduce((s, v) => s + v, 0);
      net[ym] = totalIn - totalOut;
    });

    return { months, income, expense, net };
  }, [computed]);

  // Income-aware KPIs for the CFO dashboard
  const cfokpis = useMemo(() => {
    const ym = currentYM;
    const totalIncome   = Object.values(plData.income[ym]  || {}).reduce((s, v) => s + v, 0);
    const totalExpenses = Object.values(plData.expense[ym] || {}).reduce((s, v) => s + v, 0);
    const netProfit     = totalIncome - totalExpenses;
    const foodBev       = (plData.expense[ym] || {})['food_bev'] || 0;
    const foodCostPct   = totalIncome > 0 ? Math.round((foodBev / totalIncome) * 100) : 0;
    return { totalIncome, totalExpenses, netProfit, foodCostPct };
  }, [plData, currentYM]);

  return {
    suppliers, invoices, computed, dupeIds, monthlyData, allNames, color, maxTotal, kpis, cfokpis, plData, loading,
    missingSuppliers, anomalyMap,
    addInvoice, updateInvoice, deleteInvoice, bulkMarkPaid, bulkMarkUnpaid, bulkDelete,
    addSupplier, updateSupplier, deleteSupplier,
    addIncomeEntry,
    getSupplier, refreshInvoices, appendInvoices,
  };
};
