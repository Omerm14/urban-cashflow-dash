import { useState, useCallback } from "react";
import { toYM } from "../utils/dates";
import InvoicesTable from "./InvoicesTable";
import InvoicesGroupedView from "./InvoicesGroupedView";

export default function InvoicesView({ computed, dupeIds, updateInvoice, deleteInvoice, bulkMarkPaid, bulkMarkUnpaid, bulkDelete, setEditInvoice, color, onViewAttachment }) {
  const [selectedIds,   setSelectedIds]   = useState(new Set());
  const [viewMode,      setViewMode]      = useState("grouped");
  const [selectedMonth, setSelectedMonth] = useState(() => toYM(new Date()));
  const [sortField,     setSortField]     = useState("invoiceDate");

  const toggleSelect = useCallback(id => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(ids => {
    setSelectedIds(prev => {
      const allSelected = ids.every(id => prev.has(id));
      if (allSelected) {
        const next = new Set(prev);
        ids.forEach(id => next.delete(id));
        return next;
      }
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleBulkPaid = useCallback(async () => {
    const ids = [...selectedIds];
    await bulkMarkPaid(ids);
    clearSelection();
  }, [selectedIds, bulkMarkPaid, clearSelection]);

  const handleBulkUnpaid = useCallback(async () => {
    const ids = [...selectedIds];
    await bulkMarkUnpaid(ids);
    clearSelection();
  }, [selectedIds, bulkMarkUnpaid, clearSelection]);

  const handleBulkDelete = useCallback(async () => {
    const ids = [...selectedIds];
    if (!confirm(`Delete ${ids.length} invoice${ids.length > 1 ? "s" : ""}? This cannot be undone.`)) return;
    await bulkDelete(ids);
    clearSelection();
  }, [selectedIds, bulkDelete, clearSelection]);

  const count = selectedIds.size;

  return (
    <div>
      {/* Header row */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14, flexWrap:"wrap" }}>
        <div style={{ display:"flex", background:"#0d1626", borderRadius:8, border:"1px solid #1e2d45", overflow:"hidden" }}>
          <button
            onClick={() => setViewMode("table")}
            style={{ padding:"7px 16px", fontSize:12, fontWeight:600, cursor:"pointer", border:"none", transition:"background .15s",
              background: viewMode === "table" ? "#1e2d45" : "transparent",
              color: viewMode === "table" ? "#e2e8f0" : "#475569" }}>
            Table
          </button>
          <button
            onClick={() => setViewMode("grouped")}
            style={{ padding:"7px 16px", fontSize:12, fontWeight:600, cursor:"pointer", border:"none", transition:"background .15s",
              background: viewMode === "grouped" ? "#1e2d45" : "transparent",
              color: viewMode === "grouped" ? "#e2e8f0" : "#475569" }}>
            Grouped
          </button>
        </div>

        {viewMode === "grouped" && (
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:11, color:"#475569", fontWeight:600, textTransform:"uppercase", letterSpacing:"1px" }}>Sort by</span>
            <select
              value={sortField}
              onChange={e => setSortField(e.target.value)}
              style={{ background:"#0d1626", border:"1px solid #1e2d45", borderRadius:6, color:"#94a3b8", fontSize:12, padding:"5px 10px", cursor:"pointer" }}>
              <option value="invoiceDate">Invoice Date</option>
              <option value="amount">Amount</option>
              <option value="dueDate">Due Date</option>
            </select>
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {count > 0 && (
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12, padding:"10px 16px", borderRadius:8,
          background:"#0d1a2e", border:"1px solid #1e2d45", animation:"fadeIn .2s" }}>
          <span style={{ fontSize:13, color:"#94a3b8", fontWeight:500 }}>{count} selected</span>
          <div style={{ width:1, height:16, background:"#1e2d45" }} />
          <button
            className="action-btn"
            style={{ background:"#052e16", color:"#4ade80", padding:"6px 14px", fontSize:12 }}
            onClick={handleBulkPaid}>
            ✓ Mark as Paid
          </button>
          <button
            className="action-btn"
            style={{ background:"#1e1b40", color:"#a78bfa", padding:"6px 14px", fontSize:12 }}
            onClick={handleBulkUnpaid}>
            ↻ Mark as Unpaid
          </button>
          <button
            className="action-btn"
            style={{ background:"#2d0a0a", color:"#f87171", padding:"6px 14px", fontSize:12 }}
            onClick={handleBulkDelete}>
            ✕ Delete
          </button>
          <button
            onClick={clearSelection}
            style={{ marginLeft:"auto", background:"none", border:"none", color:"#475569", fontSize:12, cursor:"pointer", textDecoration:"underline" }}>
            Clear selection
          </button>
        </div>
      )}

      {viewMode === "table"
        ? <InvoicesTable
            computed={computed} dupeIds={dupeIds}
            updateInvoice={updateInvoice} deleteInvoice={deleteInvoice}
            setEditInvoice={setEditInvoice} color={color}
            selectedIds={selectedIds} onToggleSelect={toggleSelect} onToggleAll={toggleAll}
            onViewAttachment={onViewAttachment}
          />
        : <InvoicesGroupedView
            computed={computed} dupeIds={dupeIds}
            updateInvoice={updateInvoice} deleteInvoice={deleteInvoice}
            setEditInvoice={setEditInvoice} color={color}
            selectedIds={selectedIds} onToggleSelect={toggleSelect} onToggleAll={toggleAll}
            selectedMonth={selectedMonth} onMonthChange={setSelectedMonth}
            sortField={sortField}
            onViewAttachment={onViewAttachment}
          />
      }
    </div>
  );
}
