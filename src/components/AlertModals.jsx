import { currency, fmt, fmtMonthShort } from "../utils/dates";

export function InfoBox({ label, value, sub }) {
  return (
    <div style={{ background: 'var(--surf2)', borderRadius: 8, padding: '10px 12px', border: '1px solid rgba(255,255,255,.05)' }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t1)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function MissingSuppliersModal({ missingSuppliers, invoices, suppliers, onClose }) {
  const normName = s => s?.normalize('NFC').toLowerCase().trim() || '';

  const now = new Date();
  const pastMonths = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    pastMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const enriched = missingSuppliers.map(name => {
    const key = normName(name);
    const sup = suppliers.find(s => normName(s.name) === key);
    const history = invoices.filter(inv => {
      if (normName(inv.supplier) !== key) return false;
      if (inv.status === 'Credit' || Number(inv.amount) < 0) return false;
      return true;
    }).sort((a, b) => (b.invoice_date || '').localeCompare(a.invoice_date || ''));

    const lastInv = history[0] || null;
    const recentAmounts = history
      .filter(inv => pastMonths.some(pm => (inv.invoice_date || '').startsWith(pm)))
      .map(inv => Number(inv.amount))
      .filter(a => a > 0);
    const avg = recentAmounts.length
      ? recentAmounts.reduce((s, a) => s + a, 0) / recentAmounts.length
      : null;

    const monthsPresent = pastMonths.filter(pm =>
      history.some(inv => (inv.invoice_date || '').startsWith(pm))
    );

    return { name, sup, lastInv, avg, monthsPresent };
  });

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 20, color: '#fb923c' }}>⚠ חשבוניות חסרות</div>
            <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 3 }}>
              ספקים קבועים שלא שלחו חשבונית החודש
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: 24, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {enriched.map(({ name, sup, lastInv, avg, monthsPresent }) => (
            <div key={name} style={{ padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(249,115,22,.15)', border: '1px solid rgba(249,115,22,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: '#fb923c', flexShrink: 0 }}>
                  {name.charAt(0)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{name}</div>
                  {sup?.terms && (
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 1 }}>
                      תנאי תשלום: <span style={{ fontFamily: 'monospace' }}>{sup.terms}</span>
                      {sup.recurring && <span style={{ marginRight: 8, color: 'var(--cyan)', fontWeight: 600 }}> · קבוע ידנית</span>}
                      {!sup?.recurring && <span style={{ marginRight: 8, color: 'var(--t3)' }}> · זוהה אוטומטית</span>}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <InfoBox label="חשבונית אחרונה" value={lastInv ? fmt(lastInv.invoice_date) : '—'} sub={lastInv ? currency(lastInv.amount) : null} />
                <InfoBox label="ממוצע חודשי" value={avg ? currency(avg) : '—'} sub="3 חודשים אחרונים" />
                <InfoBox
                  label="נוכחות אחרונה"
                  value={`${monthsPresent.length} / 3 חודשים`}
                  sub={monthsPresent.map(pm => fmtMonthShort(pm)).join(', ') || '—'}
                />
              </div>
            </div>
          ))}
        </div>

        <div style={{ paddingTop: 16, borderTop: '1px solid rgba(255,255,255,.06)', marginTop: 4, fontSize: 12, color: 'var(--t3)' }}>
          ספק מזוהה כקבוע אם הופיע ב-2+ מתוך 3 החודשים האחרונים, או סומן ידנית
        </div>
      </div>
    </div>
  );
}

export function AnomalyModal({ anomalyMap, computed, invoices, onClose, onEditInvoice }) {
  const normName = s => s?.normalize('NFC').toLowerCase().trim() || '';

  const now = new Date();
  const pastMonths = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    pastMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const items = [...anomalyMap.entries()].map(([id, anomaly]) => {
    const inv = computed.find(i => i.id === id);
    if (!inv) return null;
    const key = normName(inv.supplier);
    const history = invoices
      .filter(i => {
        if (i.id === id) return false;
        if (normName(i.supplier) !== key) return false;
        if (i.status === 'Credit' || Number(i.amount) < 0) return false;
        return pastMonths.some(pm => (i.invoice_date || '').startsWith(pm));
      })
      .sort((a, b) => (b.invoice_date || '').localeCompare(a.invoice_date || ''))
      .slice(0, 3);
    return { inv, anomaly, history };
  }).filter(Boolean);

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 600, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 20, color: '#fbbf24' }}>📊 חשבוניות חריגות</div>
            <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 3 }}>
              חשבוניות עם סכום חריג ביחס לממוצע הספק
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: 24, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {items.map(({ inv, anomaly, history }) => {
            const isHigh = anomaly.direction === 'higher';
            return (
              <div key={inv.id} style={{ padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(234,179,8,.12)', border: '1px solid rgba(234,179,8,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: '#fbbf24', flexShrink: 0 }}>
                    {inv.supplier.charAt(0)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{inv.supplier}</div>
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 1 }}>
                      חשבונית {inv.invoiceNo || '—'} · {fmt(inv.invoiceDate)}
                    </div>
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => { onClose(); onEditInvoice({ ...inv }); }}>
                    פתח ✎
                  </button>
                </div>

                <div style={{ background: 'var(--surf2)', borderRadius: 10, padding: '12px 14px', border: '1px solid rgba(255,255,255,.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3 }}>סכום חשבונית</div>
                      <div style={{ fontWeight: 800, fontSize: 18, color: isHigh ? '#fbbf24' : '#60a5fa' }}>
                        {currency(inv.amount)}
                        <span style={{ fontSize: 12, fontWeight: 600, marginRight: 6, color: isHigh ? '#fbbf24' : '#60a5fa' }}>
                          {isHigh ? '↑' : '↓'} {anomaly.deviationPct}%
                        </span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3 }}>ממוצע ספק (3 חודשים)</div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--t2)' }}>{currency(anomaly.average)}</div>
                    </div>
                  </div>

                  {(() => {
                    const maxVal = Math.max(Number(inv.amount), anomaly.average) * 1.1;
                    const avgPct = Math.round((anomaly.average / maxVal) * 100);
                    const curPct = Math.round((Number(inv.amount) / maxVal) * 100);
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 10, color: 'var(--t3)', width: 52, flexShrink: 0 }}>ממוצע</span>
                          <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,.06)', borderRadius: 3 }}>
                            <div style={{ width: `${avgPct}%`, height: '100%', borderRadius: 3, background: 'rgba(100,116,139,.6)' }} />
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 10, color: 'var(--t3)', width: 52, flexShrink: 0 }}>חשבונית</span>
                          <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,.06)', borderRadius: 3 }}>
                            <div style={{ width: `${curPct}%`, height: '100%', borderRadius: 3, background: isHigh ? '#f59e0b' : '#3b82f6' }} />
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {history.length > 0 && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,.05)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, color: 'var(--t3)', alignSelf: 'center' }}>היסטוריה:</span>
                      {history.map(h => (
                        <span key={h.id} style={{ fontSize: 11, color: 'var(--t2)', background: 'rgba(255,255,255,.04)', padding: '2px 8px', borderRadius: 6 }}>
                          {fmt(h.invoice_date)} · {currency(h.amount)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
