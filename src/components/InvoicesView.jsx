import { useState, useCallback, useRef, useEffect } from 'react';
import { fmt, currency } from '../utils/dates';
import { statusStyle } from '../utils/invoice';
import { STATUS } from '../constants';

const MONO = "'JetBrains Mono', ui-monospace, monospace";
const TNUM = { fontFeatureSettings: '"tnum" 1' };

function StatusPill({ status }) {
  const map = {
    [STATUS.PAID]:    { bg: 'var(--green-soft)', color: 'var(--green)' },
    [STATUS.UNPAID]:  { bg: 'var(--amber-soft)', color: 'var(--amber)' },
    overdue:          { bg: 'var(--red-soft)',   color: 'var(--red)'   },
  };
  const s = map[status] || { bg: 'var(--surface2)', color: 'var(--ink-soft)' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 4,
      fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: '0.08em',
      background: s.bg, color: s.color,
    }}>
      ● {status.toUpperCase()}
    </span>
  );
}

export default function InvoicesView({
  computed, dupeIds, updateInvoice, deleteInvoice,
  bulkMarkPaid, bulkDelete, setEditInvoice, color,
}) {
  const [filter, setFilter]       = useState('all');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const selectAllRef = useRef();

  const filtered = computed.filter(inv => {
    if (filter === 'all')    return true;
    if (filter === 'unpaid') return inv.status === STATUS.UNPAID;
    if (filter === 'paid')   return inv.status === STATUS.PAID;
    return true;
  });

  const allIds = filtered.map(i => i.id);
  const allSelected  = allIds.length > 0 && allIds.every(id => selectedIds.has(id));
  const someSelected = !allSelected && allIds.some(id => selectedIds.has(id));

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  const toggleSelect = useCallback(id => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds(prev => {
      if (allIds.every(id => prev.has(id))) {
        const next = new Set(prev);
        allIds.forEach(id => next.delete(id));
        return next;
      }
      const next = new Set(prev);
      allIds.forEach(id => next.add(id));
      return next;
    });
  }, [allIds]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleBulkPaid = useCallback(async () => {
    await bulkMarkPaid([...selectedIds]);
    clearSelection();
  }, [selectedIds, bulkMarkPaid, clearSelection]);

  const handleBulkDelete = useCallback(async () => {
    const ids = [...selectedIds];
    if (!confirm(`Delete ${ids.length} invoice${ids.length > 1 ? 's' : ''}? This cannot be undone.`)) return;
    await bulkDelete(ids);
    clearSelection();
  }, [selectedIds, bulkDelete, clearSelection]);

  const unpaidCount = computed.filter(i => i.status === STATUS.UNPAID).length;
  const paidCount   = computed.filter(i => i.status === STATUS.PAID).length;
  const selCount    = selectedIds.size;

  return (
    <div style={{ flex: 1, padding: '36px 64px 40px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-0.02em' }}>Invoices</div>
          <div style={{ fontSize: 14, color: 'var(--ink-soft)', marginTop: 4 }}>
            {computed.length} on file · {unpaidCount} outstanding
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, paddingBottom: 4 }}>
          <button
            className="btn"
            onClick={() => setEditInvoice({ id: null, supplier: '', invoiceNo: '', invoiceDate: '', amount: '', dueDate: '', status: STATUS.UNPAID, notes: '' })}
          >+ Add manually</button>
          <button className="btn btn-primary">+ Upload</button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="filter-tabs">
        {[
          { id: 'all',    label: 'All',    count: computed.length },
          { id: 'unpaid', label: 'Unpaid', count: unpaidCount },
          { id: 'paid',   label: 'Paid',   count: paidCount },
        ].map(f => (
          <button
            key={f.id}
            className={`filter-tab${filter === f.id ? ' active' : ''}`}
            onClick={() => { setFilter(f.id); clearSelection(); }}
          >
            {f.label}{' '}
            <span style={{
              fontFamily: MONO, fontSize: 11, marginLeft: 4,
              color: filter === f.id ? 'rgba(255,255,255,0.5)' : 'var(--ink-dim)',
            }}>{f.count}</span>
          </button>
        ))}
      </div>

      {/* Bulk action bar */}
      {selCount > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 16px', borderRadius: 10,
          background: 'var(--surface2)', border: '1px solid var(--line)',
          animation: 'fadeIn 0.15s',
        }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{selCount} selected</span>
          <div style={{ width: 1, height: 16, background: 'var(--line)' }} />
          <button
            onClick={handleBulkPaid}
            style={{
              padding: '5px 14px', borderRadius: 8, border: 'none',
              background: 'var(--green-soft)', color: 'var(--green)',
              fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >✓ Mark as Paid</button>
          <button
            onClick={handleBulkDelete}
            style={{
              padding: '5px 14px', borderRadius: 8, border: 'none',
              background: 'var(--red-soft)', color: 'var(--red)',
              fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >✕ Delete</button>
          <button
            onClick={clearSelection}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 12, color: 'var(--ink-dim)', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}
          >Clear</button>
        </div>
      )}

      {/* Table */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius-xl)',
        overflow: 'hidden',
      }}>
        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '36px 110px 80px 80px 1fr 80px 120px 100px 120px',
          padding: '12px 20px',
          background: 'var(--surface2)',
          fontFamily: MONO, fontSize: 10, color: 'var(--ink-dim)',
          letterSpacing: '0.1em', fontWeight: 600,
          borderBottom: '1px solid var(--line)',
        }}>
          <div>
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              style={{ cursor: 'pointer', accentColor: 'var(--ink)' }}
            />
          </div>
          <div>INVOICE</div>
          <div>DATE</div>
          <div>DUE</div>
          <div>SUPPLIER</div>
          <div>CAT</div>
          <div style={{ textAlign: 'right' }}>AMOUNT</div>
          <div>STATUS</div>
          <div></div>
        </div>

        {filtered.length === 0 && (
          <div style={{ padding: '52px 0', textAlign: 'center', color: 'var(--ink-dim)' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🧾</div>
            <div style={{ fontSize: 14 }}>No invoices yet — upload some to get started</div>
          </div>
        )}

        {filtered.map((inv, i) => {
          const isSelected = selectedIds.has(inv.id);
          const isDupe = dupeIds?.has(inv.id);

          return (
            <div
              key={inv.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '36px 110px 80px 80px 1fr 80px 120px 100px 120px',
                padding: '13px 20px',
                alignItems: 'center',
                fontSize: 13,
                borderBottom: i < filtered.length - 1 ? '1px solid var(--line)' : 'none',
                background: isSelected ? 'var(--surface2)' : 'var(--surface)',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#FAFAF7'; }}
              onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'var(--surface)'; }}
            >
              {/* Checkbox */}
              <div>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(inv.id)}
                  style={{ cursor: 'pointer', accentColor: 'var(--ink)' }}
                />
              </div>

              {/* Invoice # */}
              <div style={{ fontFamily: MONO, color: 'var(--ink-dim)', fontSize: 12 }}>{inv.invoiceNo || '—'}</div>

              {/* Date */}
              <div style={{ fontFamily: MONO, color: 'var(--ink-dim)', fontSize: 12 }}>{fmt(inv.invoiceDate)}</div>

              {/* Due */}
              <div style={{ fontFamily: MONO, fontSize: 12, color: inv.dueDate ? 'var(--ink-dim)' : 'var(--amber)' }}>
                {inv.dueDate
                  ? fmt(inv.dueDate)
                  : <span
                      style={{ cursor: 'pointer', fontWeight: 600 }}
                      onClick={() => setEditInvoice({ ...inv })}
                    >Fix terms</span>
                }
              </div>

              {/* Supplier */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: 1, background: color(inv.supplier), flexShrink: 0 }} />
                <span style={{ fontWeight: 500 }}>{inv.supplier}</span>
                {isDupe && (
                  <span style={{
                    fontFamily: MONO, fontSize: 9, fontWeight: 600,
                    color: 'var(--amber)', background: 'var(--amber-soft)',
                    padding: '2px 5px', borderRadius: 3,
                  }}>DUPE?</span>
                )}
              </div>

              {/* Category — blank, future use */}
              <div style={{ fontSize: 11, color: 'var(--ink-dim)' }}>—</div>

              {/* Amount */}
              <div style={{ fontFamily: MONO, ...TNUM, textAlign: 'right', fontWeight: 600, fontSize: 14 }}>
                {currency(inv.amount)}
              </div>

              {/* Status */}
              <div><StatusPill status={inv.status} /></div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                {inv.status !== STATUS.PAID && (
                  <button
                    onClick={() => updateInvoice(inv.id, { status: STATUS.PAID })}
                    style={{
                      padding: '4px 10px', borderRadius: 6, border: 'none',
                      background: 'var(--green-soft)', color: 'var(--green)',
                      fontWeight: 600, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >✓ Paid</button>
                )}
                <button
                  onClick={() => setEditInvoice({ ...inv })}
                  style={{
                    padding: '4px 10px', borderRadius: 6, border: '1px solid var(--line)',
                    background: 'transparent', color: 'var(--ink-soft)',
                    fontWeight: 500, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >Edit</button>
                <button
                  onClick={() => { if (confirm('Delete this invoice?')) deleteInvoice(inv.id); }}
                  style={{
                    padding: '4px 8px', borderRadius: 6, border: 'none',
                    background: 'var(--red-soft)', color: 'var(--red)',
                    fontWeight: 600, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >✕</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
