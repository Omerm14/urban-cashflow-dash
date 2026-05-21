import { calcDueDate } from '../utils/dates';
import { STATUS } from '../constants';

export default function EditInvoiceModal({ editInvoice, setEditInvoice, suppliers, addInvoice, updateInvoice, getSupplier }) {
  const close = () => setEditInvoice(null);

  const save = async () => {
    const { id, ...fields } = editInvoice;
    const patch = {
      supplier:     fields.supplier,
      invoice_no:   fields.invoiceNo   ?? fields.invoice_no   ?? '',
      invoice_date: fields.invoiceDate ?? fields.invoice_date ?? '',
      amount:       Number(fields.amount) || 0,
      due_date:     fields.dueDate     ?? fields.due_date     ?? '',
      status:       fields.status,
      notes:        fields.notes       ?? '',
    };
    if (id) await updateInvoice(id, patch);
    else    await addInvoice(patch);
    close();
  };

  const onFieldChange = (key, value) => {
    const u = { ...editInvoice, [key]: value };
    if ((key === 'invoiceDate' || key === 'supplier') && u.invoiceDate && u.supplier) {
      const sup = getSupplier(u.supplier);
      if (sup && sup.terms !== 'custom') {
        const d = calcDueDate(u.invoiceDate, sup);
        if (d) u.dueDate = d.toISOString().split('T')[0];
      }
    }
    setEditInvoice(u);
  };

  const labelStyle = {
    fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)',
    letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6,
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && close()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>
              {editInvoice.id ? 'Edit Invoice' : 'New Invoice'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 2 }}>Invoice details & payment info</div>
          </div>
          <button
            onClick={close}
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'var(--surface2)', border: '1px solid var(--line)',
              color: 'var(--ink-soft)', cursor: 'pointer',
              fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {[
              ['Invoice #',          'invoiceNo',   'text'],
              ['Invoice Date',       'invoiceDate', 'date'],
              ['Amount (₪)',         'amount',      'number'],
              ['Due Date (override)', 'dueDate',    'date'],
            ].map(([label, key, type]) => (
              <div key={key}>
                <div style={labelStyle}>{label}</div>
                <input
                  type={type}
                  className="input"
                  value={editInvoice[key] ?? editInvoice[key.replace(/([A-Z])/g, '_$1').toLowerCase()] ?? ''}
                  onChange={e => onFieldChange(key, e.target.value)}
                />
              </div>
            ))}
          </div>

          <div>
            <div style={labelStyle}>Supplier</div>
            <select
              className="input"
              value={editInvoice.supplier || ''}
              onChange={e => {
                const sup = getSupplier(e.target.value);
                const due = editInvoice.invoiceDate && sup ? calcDueDate(editInvoice.invoiceDate, sup) : null;
                setEditInvoice({
                  ...editInvoice,
                  supplier: e.target.value,
                  dueDate: due ? due.toISOString().split('T')[0] : (editInvoice.dueDate || editInvoice.due_date || ''),
                });
              }}
            >
              <option value="">— select supplier —</option>
              {suppliers.map(s => <option key={s.id} value={s.name}>{s.name} · {s.terms}</option>)}
            </select>
          </div>

          <div>
            <div style={labelStyle}>Status</div>
            <select
              className="input"
              value={editInvoice.status || STATUS.UNPAID}
              onChange={e => setEditInvoice({ ...editInvoice, status: e.target.value })}
            >
              {Object.values(STATUS).map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button
              className="btn"
              onClick={close}
            >Cancel</button>
            <button
              className="btn btn-primary"
              onClick={save}
            >Save Invoice</button>
          </div>
        </div>
      </div>
    </div>
  );
}
