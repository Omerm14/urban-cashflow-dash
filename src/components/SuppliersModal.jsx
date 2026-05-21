const MONO = "'JetBrains Mono', ui-monospace, monospace";

export default function SuppliersModal({ suppliers, addSupplier, updateSupplier, deleteSupplier, editSupplier, setEditSupplier, onClose }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>Suppliers</div>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 2 }}>Manage payment terms · {suppliers.length} suppliers</div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'var(--surface2)', border: '1px solid var(--line)',
              color: 'var(--ink-soft)', cursor: 'pointer',
              fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>

        <div className="modal-body">
          {/* Terms hint */}
          <div style={{
            background: 'var(--surface2)', borderRadius: 8,
            padding: '8px 14px', marginBottom: 18,
            fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.6,
          }}>
            Terms: <code style={{ fontFamily: MONO, color: 'var(--blue)' }}>shotef</code> ·{' '}
            <code style={{ fontFamily: MONO, color: 'var(--blue)' }}>shotef_plus(30)</code> ·{' '}
            <code style={{ fontFamily: MONO, color: 'var(--blue)' }}>immediate</code> ·{' '}
            <code style={{ fontFamily: MONO, color: 'var(--blue)' }}>custom</code>
          </div>

          {/* Header row */}
          <div style={{
            display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto',
            padding: '8px 0',
            fontFamily: MONO, fontSize: 10, fontWeight: 600,
            letterSpacing: '0.1em', color: 'var(--ink-dim)',
            borderBottom: '1px solid var(--line)',
          }}>
            <div>SUPPLIER</div><div>TERMS</div><div>NOTES</div><div></div>
          </div>

          {suppliers.map(sup => (
            <div key={sup.id} style={{
              display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto',
              padding: '12px 0', borderBottom: '1px solid var(--line)',
              alignItems: 'center', gap: 8,
            }}>
              {editSupplier?.id === sup.id ? (
                <>
                  {['name', 'terms', 'notes'].map(k => (
                    <div key={k}>
                      <input
                        className="input"
                        value={editSupplier[k] || ''}
                        style={{ padding: '7px 10px', fontSize: 13 }}
                        onChange={e => setEditSupplier({ ...editSupplier, [k]: e.target.value })}
                      />
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      style={{
                        padding: '5px 10px', borderRadius: 6, border: 'none',
                        background: 'var(--green-soft)', color: 'var(--green)',
                        fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                      }}
                      onClick={() => {
                        updateSupplier(editSupplier.id, { name: editSupplier.name, terms: editSupplier.terms, notes: editSupplier.notes });
                        setEditSupplier(null);
                      }}
                    >✓</button>
                    <button
                      style={{
                        padding: '5px 8px', borderRadius: 6, border: '1px solid var(--line)',
                        background: 'transparent', color: 'var(--ink-soft)',
                        fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                      }}
                      onClick={() => setEditSupplier(null)}
                    >✕</button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{sup.name}</div>
                  <div>
                    <span style={{
                      fontFamily: MONO, fontSize: 11, color: 'var(--blue)',
                      background: '#EEF2FF', padding: '2px 8px', borderRadius: 4,
                    }}>{sup.terms}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-dim)' }}>{sup.notes || '—'}</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      style={{
                        padding: '4px 10px', borderRadius: 6, border: '1px solid var(--line)',
                        background: 'transparent', color: 'var(--ink-soft)',
                        fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                      }}
                      onClick={() => setEditSupplier({ ...sup })}
                    >Edit</button>
                    <button
                      style={{
                        padding: '4px 8px', borderRadius: 6, border: 'none',
                        background: 'var(--red-soft)', color: 'var(--red)',
                        fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
                      }}
                      onClick={() => { if (confirm('Delete supplier?')) deleteSupplier(sup.id); }}
                    >✕</button>
                  </div>
                </>
              )}
            </div>
          ))}

          <button
            className="btn"
            style={{ marginTop: 16 }}
            onClick={() => addSupplier({ name: 'New Supplier', terms: 'shotef', notes: '' }).then(row => setEditSupplier(row))}
          >+ Add Supplier</button>
        </div>
      </div>
    </div>
  );
}
