import { currency, fmt, fmtMonthShort } from "../utils/dates";

const STRINGS = {
  en: {
    missing_title: "Missing Suppliers",
    missing_sub: "Recurring suppliers with no invoice this month",
    missing_footer: "A supplier is flagged if they appeared in 2+ of the last 3 months, or marked manually",
    anomaly_title: "Supplier Anomalies",
    anomaly_sub: "Suppliers whose monthly total deviates from their baseline average",
    payment_terms: "Payment terms",
    recurring_manual: "manually marked",
    recurring_auto: "auto-detected",
    last_invoice: "Last invoice",
    monthly_avg: "Monthly average",
    last_3_months: "last 3 months",
    presence: "Presence",
    months: "months",
    invoice_amount: "Invoice amount",
    supplier_avg: "Supplier avg (3 months)",
    history: "History",
    open: "Open ✎",
    invoice_label: "Invoice",
    average_label: "Average",
    current_month: "This month",
    baseline_avg: "Baseline avg",
    monthly_total: "Monthly total",
    deviation: "Deviation",
  },
  he: {
    missing_title: "ספקים חסרים",
    missing_sub: "ספקים קבועים שלא שלחו חשבונית החודש",
    missing_footer: "ספק מזוהה כקבוע אם הופיע ב-2+ מתוך 3 החודשים האחרונים, או סומן ידנית",
    anomaly_title: "חריגות ספקים",
    anomaly_sub: "ספקים שהסה\"כ החודשי שלהם חורג מהבסיס הרגיל",
    payment_terms: "תנאי תשלום",
    recurring_manual: "קבוע ידנית",
    recurring_auto: "זוהה אוטומטית",
    last_invoice: "חשבונית אחרונה",
    monthly_avg: "ממוצע חודשי",
    last_3_months: "3 חודשים אחרונים",
    presence: "נוכחות אחרונה",
    months: "חודשים",
    invoice_amount: "סכום חשבונית",
    supplier_avg: "ממוצע ספק (3 חודשים)",
    history: "היסטוריה",
    open: "פתח ✎",
    invoice_label: "חשבונית",
    average_label: "ממוצע",
    current_month: "החודש",
    baseline_avg: "ממוצע בסיס",
    monthly_total: "סה\"כ חודשי",
    deviation: "חריגה",
  },
};

export function InfoBox({ label, value, sub }) {
  return (
    <div style={{ background: 'var(--surf2)', borderRadius: 8, padding: '10px 12px', border: '1px solid rgba(255,255,255,.05)' }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t1)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function MissingSuppliersModal({ missingSuppliers, invoices, suppliers, onClose, lang = "en" }) {
  const s = STRINGS[lang] || STRINGS.en;
  const normName = n => n?.normalize('NFC').toLowerCase().trim() || '';

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
      ? recentAmounts.reduce((sum, a) => sum + a, 0) / recentAmounts.length
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 800, fontSize: 20, color: '#fb923c' }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(249,115,22,.12)', border: '1px solid rgba(249,115,22,.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fb923c" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </div>
              {s.missing_title}
            </div>
            <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 3 }}>{s.missing_sub}</div>
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
                      {s.payment_terms}: <span style={{ fontFamily: 'monospace' }}>{sup.terms}</span>
                      {sup.recurring
                        ? <span style={{ marginLeft: 8, color: 'var(--accent)', fontWeight: 600 }}> · {s.recurring_manual}</span>
                        : <span style={{ marginLeft: 8, color: 'var(--t3)' }}> · {s.recurring_auto}</span>
                      }
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <InfoBox label={s.last_invoice} value={lastInv ? fmt(lastInv.invoice_date) : '—'} sub={lastInv ? currency(lastInv.amount) : null} />
                <InfoBox label={s.monthly_avg} value={avg ? currency(avg) : '—'} sub={s.last_3_months} />
                <InfoBox
                  label={s.presence}
                  value={`${monthsPresent.length} / 3 ${s.months}`}
                  sub={monthsPresent.map(pm => fmtMonthShort(pm)).join(', ') || '—'}
                />
              </div>
            </div>
          ))}
        </div>

        <div style={{ paddingTop: 16, borderTop: '1px solid rgba(255,255,255,.06)', marginTop: 4, fontSize: 12, color: 'var(--t3)' }}>
          {s.missing_footer}
        </div>
      </div>
    </div>
  );
}

export function AnomalyModal({ anomalyMap, onClose, lang = "en" }) {
  const s = STRINGS[lang] || STRINGS.en;

  const items = [...anomalyMap.entries()].map(([supplierName, anomaly]) => ({ supplierName, anomaly }));

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 800, fontSize: 20, color: '#fbbf24' }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(234,179,8,.10)', border: '1px solid rgba(234,179,8,.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              </div>
              {s.anomaly_title}
            </div>
            <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 3 }}>{s.anomaly_sub}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: 24, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {items.map(({ supplierName, anomaly }) => {
            const isHigh = anomaly.direction === 'higher';
            const maxVal = Math.max(anomaly.currentTotal, anomaly.baseline) * 1.1;
            const basePct = Math.round((anomaly.baseline / maxVal) * 100);
            const curPct = Math.round((anomaly.currentTotal / maxVal) * 100);
            return (
              <div key={supplierName} style={{ padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(234,179,8,.12)', border: '1px solid rgba(234,179,8,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: '#fbbf24', flexShrink: 0 }}>
                    {supplierName.charAt(0)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{supplierName}</div>
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 1 }}>
                      <span style={{ color: isHigh ? '#fbbf24' : '#60a5fa', fontWeight: 700 }}>{isHigh ? '↑' : '↓'} {anomaly.deviationPct}% {isHigh ? 'above' : 'below'}</span> {s.baseline_avg}
                    </div>
                  </div>
                </div>

                <div style={{ background: 'var(--surf2)', borderRadius: 10, padding: '12px 14px', border: '1px solid rgba(255,255,255,.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3 }}>{s.current_month}</div>
                      <div style={{ fontWeight: 800, fontSize: 18, color: isHigh ? '#fbbf24' : '#60a5fa' }}>{currency(anomaly.currentTotal)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3 }}>{s.baseline_avg}</div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--t2)' }}>{currency(anomaly.baseline)}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, color: 'var(--t3)', width: 52, flexShrink: 0 }}>{s.average_label}</span>
                      <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,.06)', borderRadius: 3 }}>
                        <div style={{ width: `${basePct}%`, height: '100%', borderRadius: 3, background: 'rgba(100,116,139,.6)' }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, color: 'var(--t3)', width: 52, flexShrink: 0 }}>{s.current_month}</span>
                      <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,.06)', borderRadius: 3 }}>
                        <div style={{ width: `${curPct}%`, height: '100%', borderRadius: 3, background: isHigh ? '#f59e0b' : '#3b82f6' }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
