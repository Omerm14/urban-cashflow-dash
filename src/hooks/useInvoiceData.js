import { useState, useEffect, useMemo, useCallback } from "react";
import { STATUS, PALETTE, MOCK_NAMES } from "../constants";
import { calcDueDate, toYM } from "../utils/dates";
import { findDuplicates, matchSupplier } from "../utils/invoice";

export const useInvoiceData = () => {
  const [suppliers, setSuppliers] = useState([]);
  const [invoices,  setInvoices]  = useState([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    try {
      const s = localStorage.getItem("suppliers");
      if (s) setSuppliers(JSON.parse(s).filter(x => !MOCK_NAMES.includes(x.name)));
    } catch {}
    try {
      const inv = localStorage.getItem("invoices");
      if (inv) setInvoices(JSON.parse(inv).filter(x => !(MOCK_NAMES.includes(x.supplier) && Number(x.id) < 10)));
    } catch {}
    setLoading(false);
  }, []);

  const saveSuppliers = useCallback(d => {
    setSuppliers(d);
    localStorage.setItem("suppliers", JSON.stringify(d));
  }, []);

  const saveInvoices = useCallback(d => {
    setInvoices(d);
    localStorage.setItem("invoices", JSON.stringify(d));
  }, []);

  const getSupplier = useCallback(name => matchSupplier(name, suppliers), [suppliers]);

  const computed = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return invoices.map(inv => {
      const sup = matchSupplier(inv.supplier, suppliers);
      const due = inv.dueDate || (calcDueDate(inv.invoiceDate, sup)?.toISOString().split("T")[0] ?? null);
      let status = inv.status;
      if (status !== STATUS.PAID && due && new Date(due) < today) status = STATUS.OVERDUE;
      return { ...inv, dueDate: due, status };
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

  return { suppliers, invoices, computed, dupeIds, monthlyData, allNames, color, maxTotal, kpis, loading, saveSuppliers, saveInvoices, getSupplier };
};
