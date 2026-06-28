import { useState, useEffect } from "react";
import { currency, fmtMonth, fmtMonthShort, fmt } from "../utils/dates";

function CountUp({ to, duration = 1200 }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const steps = 55;
    const ms = duration / steps;
    let i = 0;
    const id = setInterval(() => {
      i++;
      const p = i / steps;
      const e = 1 - Math.pow(1 - p, 3);
      setV(to * e);
      if (i >= steps) { setV(to); clearInterval(id); }
    }, ms);
    return () => clearInterval(id);
  }, [to, duration]);
  return <>{currency(v)}</>;
}

// ── Missing Suppliers Modal ──────────────────────────────────────────────────

function MissingSuppliersModal({ missingSuppliers, invoices, suppliers, onClose }) {
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
      <div className="modal" style={{ width: 580, maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>

        {/* Gradient header */}
        <div style={{ padding: '22px 24px 20px', background: 'linear-gradient(135deg, rgba(249,115,22,.18) 0%, rgba(249,115,22,.04) 100%)', borderBottom: '1px solid rgba(249,115,22,.2)', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(249,115,22,.2)', border: '1px solid rgba(249,115,22,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>⚠️</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 18, color: '#fb923c', direction: 'rtl' }}>חשבוניות חסרות</div>
            <div style={{ fontSize: 12, color: '#fdba74', marginTop: 2, direction: 'rtl' }}>
              ספקים קבועים שלא שלחו חשבונית החודש
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, color: 'var(--t3)', cursor: 'pointer', fontSize: 18, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>×</button>
        </div>

        {/* Supplier cards */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {enriched.map(({ name, sup, lastInv, avg, monthsPresent }) => (
            <div key={name} style={{ borderRadius: 12, background: 'var(--surf2)', border: '1px solid rgba(255,255,255,.07)', borderLeft: '3px solid #fb923c', padding: '14px 16px' }}>

              {/* Top row: avatar + name + badge + expected amount */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(249,115,22,.15)', border: '1px solid rgba(249,115,22,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 900, color: '#fb923c', flexShrink: 0 }}>
                  {name.charAt(0)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    {sup?.terms && (
                      <span style={{ fontSize: 10, fontWeight: 600, fontFamily: 'monospace', padding: '1px 7px', borderRadius: 5, background: 'rgba(255,255,255,.06)', color: 'var(--t3)', border: '1px solid rgba(255,255,255,.08)' }}>{sup.terms}</span>
                    )}
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 5,
                      background: sup?.recurring ? 'rgba(6,182,212,.1)' : 'rgba(100,116,139,.1)',
                      color: sup?.recurring ? 'var(--cyan)' : '#64748b',
                      border: `1px solid ${sup?.recurring ? 'rgba(6,182,212,.25)' : 'rgba(100,116,139,.2)'}` }}>
                      {sup?.recurring ? '✓ קבוע ידנית' : 'זוהה אוטומטית'}
                    </span>
                  </div>
                </div>
                {avg && (
                  <div style={{ textAlign: 'center', flexShrink: 0 }}>
                    <div style={{ fontSize: 9, color: 'var(--t3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 2 }}>צפי</div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: '#fb923c' }}>{currency(avg)}</div>
                  </div>
                )}
              </div>

              {/* Month presence dots */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                {pastMonths.map((pm, i) => {
                  const present = monthsPresent.includes(pm);
                  return (
                    <div key={pm} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%',
                        background: present ? 'rgba(249,115,22,.25)' : 'rgba(255,255,255,.04)',
                        border: `2px solid ${present ? '#fb923c' : 'rgba(255,255,255,.1)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {present && <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#fb923c' }} />}
                      </div>
                      <span style={{ fontSize: 9, color: present ? '#fdba74' : 'var(--t3)', fontWeight: 600 }}>
                        {fmtMonthShort(pm)}
                      </span>
                    </div>
                  );
                })}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(239,68,68,.08)', border: '2px dashed rgba(239,68,68,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 12, color: '#ef4444' }}>?</span>
                  </div>
                  <span style={{ fontSize: 9, color: '#ef4444', fontWeight: 700 }}>החודש</span>
                </div>
              </div>

              {/* Last invoice row */}
              {lastInv && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.05)' }}>
                  <span style={{ fontSize: 11, color: 'var(--t3)' }}>חשבונית אחרונה:</span>
                  <span style={{ fontSize: 11, color: 'var(--t2)', fontWeight: 600 }}>{fmt(lastInv.invoice_date)}</span>
                  <span style={{ fontSize: 11, color: 'var(--t1)', fontWeight: 700, marginRight: 'auto' }}>{currency(lastInv.amount)}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,.06)', background: 'rgba(249,115,22,.04)' }}>
          <span style={{ fontSize: 11, color: 'rgba(253,186,116,.6)' }}>
            ספק מזוהה כקבוע אם הופיע ב-2 מתוך 3 החודשים האחרונים, או סומן ידנית
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Anomaly Modal ────────────────────────────────────────────────────────────

function AnomalyModal({ anomalyMap, computed, invoices, onClose, onEditInvoice }) {
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
      <div className="modal" style={{ width: 620, maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>

        {/* Gradient header */}
        <div style={{ padding: '22px 24px 20px', background: 'linear-gradient(135deg, rgba(234,179,8,.15) 0%, rgba(234,179,8,.04) 100%)', borderBottom: '1px solid rgba(234,179,8,.2)', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(234,179,8,.18)', border: '1px solid rgba(234,179,8,.38)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>📊</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 18, color: '#fbbf24', direction: 'rtl' }}>חשבוניות חריגות</div>
            <div style={{ fontSize: 12, color: '#fde68a', marginTop: 2, direction: 'rtl' }}>
              סכום חריג מהממוצע החודשי של הספק
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, color: 'var(--t3)', cursor: 'pointer', fontSize: 18, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>×</button>
        </div>

        {/* Invoice cards */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map(({ inv, anomaly, history }) => {
            const isHigh = anomaly.direction === 'higher';
            const accentColor = isHigh ? '#f59e0b' : '#60a5fa';
            const accentBg    = isHigh ? 'rgba(245,158,11,.1)' : 'rgba(96,165,250,.1)';
            const accentBdr   = isHigh ? 'rgba(245,158,11,.28)' : 'rgba(96,165,250,.28)';
            const maxVal = Math.max(Number(inv.amount), anomaly.average) * 1.08;
            const avgPct = Math.round((anomaly.average / maxVal) * 100);
            const curPct = Math.round((Number(inv.amount) / maxVal) * 100);

            return (
              <div key={inv.id} style={{ borderRadius: 12, background: 'var(--surf2)', border: `1px solid ${accentBdr}`, borderLeft: `3px solid ${accentColor}`, overflow: 'hidden' }}>

                {/* Card header */}
                <div style={{ padding: '14px 16px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: accentBg, border: `1px solid ${accentBdr}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 900, color: accentColor, flexShrink: 0 }}>
                    {inv.supplier.charAt(0)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.supplier}</div>
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                      {inv.invoiceNo && <span>{inv.invoiceNo} · </span>}{fmt(inv.invoiceDate)}
                    </div>
                  </div>
                  {/* Deviation badge */}
                  <div style={{ padding: '5px 12px', borderRadius: 20, background: accentBg, border: `1px solid ${accentBdr}`, fontWeight: 900, fontSize: 15, color: accentColor, flexShrink: 0, letterSpacing: '-.3px' }}>
                    {isHigh ? '↑' : '↓'} {anomaly.deviationPct}%
                  </div>
                </div>

                {/* Amount comparison */}
                <div style={{ padding: '12px 16px', background: 'rgba(0,0,0,.15)', borderTop: '1px solid rgba(255,255,255,.05)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>

                    {/* Average row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '72px 90px 1fr', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600 }}>ממוצע</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)', textAlign: 'right' }}>{currency(anomaly.average)}</span>
                      <div style={{ height: 10, background: 'rgba(255,255,255,.06)', borderRadius: 5 }}>
                        <div style={{ width: `${avgPct}%`, height: '100%', borderRadius: 5, background: 'rgba(100,116,139,.55)' }} />
                      </div>
                    </div>

                    {/* Current invoice row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '72px 90px 1fr', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 11, color: accentColor, fontWeight: 700 }}>חשבונית</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: accentColor, textAlign: 'right' }}>{currency(inv.amount)}</span>
                      <div style={{ height: 10, background: 'rgba(255,255,255,.06)', borderRadius: 5 }}>
                        <div style={{ width: `${curPct}%`, height: '100%', borderRadius: 5, background: accentColor }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* History timeline + CTA */}
                {history.length > 0 && (
                  <div style={{ padding: '10px 16px 14px', borderTop: '1px solid rgba(255,255,255,.04)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 600, flexShrink: 0 }}>היסטוריה:</span>
                    <div style={{ display: 'flex', alignItems: 'center', flex: 1, gap: 0 }}>
                      {history.map((h, i) => (
                        <div key={h.id} style={{ display: 'flex', alignItems: 'center' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(100,116,139,.5)', border: '1.5px solid rgba(100,116,139,.5)' }} />
                            <span style={{ fontSize: 9, color: 'var(--t3)', whiteSpace: 'nowrap' }}>{fmtMonthShort(h.invoice_date?.slice(0,7) || '')}</span>
                            <span style={{ fontSize: 9, color: 'var(--t2)', fontWeight: 700, whiteSpace: 'nowrap' }}>{currency(h.amount)}</span>
                          </div>
                          {i < history.length - 1 && (
                            <div style={{ width: 20, height: 1.5, background: 'rgba(100,116,139,.25)', margin: '0 2px', marginBottom: 14 }} />
                          )}
                        </div>
                      ))}
                    </div>
                    <button
                      style={{ padding: '7px 14px', borderRadius: 8, background: accentBg, border: `1px solid ${accentBdr}`, color: accentColor, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, transition: 'all .15s' }}
                      onClick={() => { onClose(); onEditInvoice({ ...inv }); }}>
                      פתח ✎
                    </button>
                  </div>
                )}
                {history.length === 0 && (
                  <div style={{ padding: '10px 16px 14px', borderTop: '1px solid rgba(255,255,255,.04)', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      style={{ padding: '7px 14px', borderRadius: 8, background: accentBg, border: `1px solid ${accentBdr}`, color: accentColor, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
                      onClick={() => { onClose(); onEditInvoice({ ...inv }); }}>
                      פתח ✎
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,.06)', background: 'rgba(234,179,8,.04)' }}>
          <span style={{ fontSize: 11, color: 'rgba(253,230,138,.55)' }}>
            חשבונית מסומנת כחריגה כאשר הסכום סוטה ביותר מ-30% מהממוצע של הספק
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard({ kpis, monthlyData, allNames, color, maxTotal, onPayMonth, missingSuppliers, anomalyMap, invoices, suppliers, computed, setEditInvoice }) {
  const [tooltip,       setTooltip]       = useState(null);
  const [showMissing,   setShowMissing]   = useState(false);
  const [showAnomalies, setShowAnomalies] = useState(false);

  const stats = [
    { label:"Outstanding", key:"outstanding", cls:"stat-outstanding", ico:"💳" },
    { label:"Overdue",     key:"overdue",     cls:"stat-overdue",     ico:"⚠️", pulse:true },
    { label:"Next Month",  key:"nextMonth",   cls:"stat-nextmonth",   ico:"📅" },
    { label:"Total Paid",  key:"paid",        cls:"stat-paid",        ico:"✅" },
  ];

  const ctaMonth = monthlyData[0] || null;
  const anomalousCount = anomalyMap ? anomalyMap.size : 0;

  return (
    <div style={{ animation:"slideUp .4s cubic-bezier(.16,1,.3,1)" }}>

      {/* Alert cards row */}
      {(missingSuppliers?.length > 0 || anomalousCount > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: missingSuppliers?.length > 0 && anomalousCount > 0 ? '1fr 1fr' : '1fr', gap: 14, marginBottom: 20 }}>

          {missingSuppliers?.length > 0 && (
            <button
              onClick={() => setShowMissing(true)}
              style={{ padding: '20px 22px', borderRadius: 14, background: 'linear-gradient(135deg, rgba(249,115,22,.13) 0%, rgba(249,115,22,.05) 100%)', border: '1px solid rgba(249,115,22,.35)', display: 'flex', alignItems: 'center', gap: 18, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .18s', textAlign: 'left' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(249,115,22,.2) 0%, rgba(249,115,22,.09) 100%)'; e.currentTarget.style.borderColor = 'rgba(249,115,22,.55)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(249,115,22,.13) 0%, rgba(249,115,22,.05) 100%)'; e.currentTarget.style.borderColor = 'rgba(249,115,22,.35)'; }}>
              {/* Big count badge */}
              <div style={{ width: 54, height: 54, borderRadius: 14, background: 'rgba(249,115,22,.18)', border: '1px solid rgba(249,115,22,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontWeight: 900, fontSize: 26, color: '#fb923c', lineHeight: 1 }}>{missingSuppliers.length}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: '#fb923c', marginBottom: 3, direction: 'rtl' }}>חשבוניות חסרות</div>
                <div style={{ fontSize: 12, color: '#fdba74', direction: 'rtl' }}>
                  ספקים קבועים לא שלחו החודש
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                <span style={{ fontSize: 18 }}>⚠️</span>
                <span style={{ fontSize: 10, color: 'rgba(251,146,60,.6)', fontWeight: 600, whiteSpace: 'nowrap' }}>לפרטים ←</span>
              </div>
            </button>
          )}

          {anomalousCount > 0 && (
            <button
              onClick={() => setShowAnomalies(true)}
              style={{ padding: '20px 22px', borderRadius: 14, background: 'linear-gradient(135deg, rgba(234,179,8,.11) 0%, rgba(234,179,8,.04) 100%)', border: '1px solid rgba(234,179,8,.32)', display: 'flex', alignItems: 'center', gap: 18, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .18s', textAlign: 'left' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(234,179,8,.18) 0%, rgba(234,179,8,.08) 100%)'; e.currentTarget.style.borderColor = 'rgba(234,179,8,.52)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(234,179,8,.11) 0%, rgba(234,179,8,.04) 100%)'; e.currentTarget.style.borderColor = 'rgba(234,179,8,.32)'; }}>
              <div style={{ width: 54, height: 54, borderRadius: 14, background: 'rgba(234,179,8,.15)', border: '1px solid rgba(234,179,8,.38)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontWeight: 900, fontSize: 26, color: '#fbbf24', lineHeight: 1 }}>{anomalousCount}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: '#fbbf24', marginBottom: 3, direction: 'rtl' }}>חשבוניות חריגות</div>
                <div style={{ fontSize: 12, color: '#fde68a', direction: 'rtl' }}>
                  סכום חריג מהממוצע החודשי
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                <span style={{ fontSize: 18 }}>📊</span>
                <span style={{ fontSize: 10, color: 'rgba(251,191,36,.6)', fontWeight: 600, whiteSpace: 'nowrap' }}>לפרטים ←</span>
              </div>
            </button>
          )}
        </div>
      )}

      {/* KPI Cards */}
      <div className="stat-grid" style={{ marginBottom:20 }}>
        {stats.map(s => (
          <div key={s.key}
            className={`card stat-card ${s.cls}`}
            style={s.pulse ? { animationName:"redPulse", animationDuration:"2.2s", animationIterationCount:"infinite" } : {}}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <span className="stat-lbl">{s.label}</span>
              <span style={{ fontSize:18, opacity:.45 }}>{s.ico}</span>
            </div>
            <div className="stat-val"><CountUp to={kpis[s.key]}/></div>
          </div>
        ))}
      </div>

      {/* Pay-month CTA banner */}
      {ctaMonth && onPayMonth && (
        <div className="pay-banner" onClick={() => onPayMonth(ctaMonth.ym)}>
          <div style={{ display:"flex", alignItems:"center", gap:16 }}>
            <div style={{ width:46, height:46, borderRadius:12, background:"var(--grad)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>⚡</div>
            <div>
              <div style={{ fontWeight:800, fontSize:16, marginBottom:3 }}>
                Pay {fmtMonth(ctaMonth.ym)} — ready to go
              </div>
              <div style={{ color:"var(--t2)", fontSize:13 }}>
                {Object.keys(ctaMonth.sups).length} suppliers · <strong style={{ color:"var(--t1)" }}>{currency(ctaMonth.total)}</strong> total
              </div>
            </div>
          </div>
          <button className="btn btn-primary" style={{ padding:"11px 22px", fontSize:14, flexShrink:0 }}
            onClick={e => { e.stopPropagation(); onPayMonth(ctaMonth.ym); }}>
            Pay All Now →
          </button>
        </div>
      )}

      {/* Chart Card */}
      <div className="card" style={{ padding:28, marginBottom:20 }}>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:22 }}>
          <div>
            <div style={{ fontWeight:800, fontSize:18, marginBottom:3 }}>Monthly Payment Schedule</div>
            <div style={{ fontSize:13, color:"var(--t2)" }}>Unpaid invoices grouped by due month</div>
          </div>
        </div>

        {monthlyData.length === 0 ? (
          <div style={{ textAlign:"center", padding:"60px 0", color:"var(--t3)" }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📭</div>
            <div style={{ fontSize:14 }}>No upcoming payments</div>
          </div>
        ) : (
          <div style={{ position:"relative", minWidth:0, overflow:"hidden" }}>
            <ChartBars data={monthlyData} color={color} maxTotal={maxTotal} tooltip={tooltip} setTooltip={setTooltip}/>
            <div style={{ display:"flex", flexWrap:"wrap", gap:"7px 14px", marginTop:18, paddingTop:18, borderTop:"1px solid rgba(255,255,255,.05)" }}>
              {allNames.map(n => (
                <div key={n} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:"var(--t2)" }}>
                  <div style={{ width:7, height:7, borderRadius:"50%", background:color(n), flexShrink:0 }}/>
                  <span style={{ maxWidth:120, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{n}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Monthly breakdown cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:14 }}>
        {monthlyData.map(({ ym, sups, total }) => (
          <div key={ym} className="card" style={{ cursor:"pointer" }} onClick={() => onPayMonth && onPayMonth(ym)}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <span style={{ fontWeight:700, fontSize:14 }}>{fmtMonth(ym)}</span>
              <span style={{ fontWeight:800, fontSize:14, color:"var(--t2)" }}>{currency(total)}</span>
            </div>
            {Object.entries(sups).sort((a,b) => b[1]-a[1]).map(([sup, amt]) => (
              <div key={sup} style={{ display:"flex", alignItems:"center", gap:7, padding:"5px 0", borderTop:"1px solid rgba(255,255,255,.04)", fontSize:12 }}>
                <div style={{ width:6, height:6, borderRadius:"50%", background:color(sup), flexShrink:0 }}/>
                <span style={{ flex:1, color:"var(--t2)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{sup}</span>
                <span style={{ fontWeight:600, whiteSpace:"nowrap" }}>{currency(amt)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Floating tooltip */}
      {tooltip && (
        <div className="chart-tip" style={{ left:tooltip.x+14, top:tooltip.y-64 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:color(tooltip.supplier), flexShrink:0 }}/>
            <span style={{ fontWeight:700, color:color(tooltip.supplier), maxWidth:180, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{tooltip.supplier}</span>
          </div>
          <div style={{ color:"var(--t1)", fontWeight:800, fontSize:14 }}>{currency(tooltip.amount)}</div>
          <div style={{ color:"var(--t3)", marginTop:2, fontSize:11 }}>{fmtMonth(tooltip.ym)} · {Math.round((tooltip.amount/tooltip.total)*100)}%</div>
        </div>
      )}

      {/* Modals */}
      {showMissing && (
        <MissingSuppliersModal
          missingSuppliers={missingSuppliers}
          invoices={invoices}
          suppliers={suppliers}
          onClose={() => setShowMissing(false)}
        />
      )}
      {showAnomalies && (
        <AnomalyModal
          anomalyMap={anomalyMap}
          computed={computed}
          invoices={invoices}
          onClose={() => setShowAnomalies(false)}
          onEditInvoice={setEditInvoice}
        />
      )}
    </div>
  );
}

function ChartBars({ data, color, maxTotal, tooltip, setTooltip }) {
  if (!data.length) return null;
  const H = 200, W = 80, GAP = 90, PX = 30;
  const maxV = maxTotal * 1.18;
  const totalW = data.length * (W + GAP) + PX * 2 - GAP;

  return (
    <div style={{ position:"relative", overflowX:"auto" }}>
      <svg width="100%" viewBox={`0 0 ${totalW} ${H + 50}`} style={{ display:"block", minWidth:280, overflow:"visible" }}>
        {data.map(({ ym, sups, total }, mi) => {
          const bx = PX + mi * (W + GAP);
          const bh = (total / maxV) * H;
          const by = H - bh;
          let yoff = H;
          const segs = Object.entries(sups).map(([sup, amt]) => {
            const h = Math.max(1, (amt / maxV) * H);
            yoff -= h;
            return { sup, amt, y: yoff, h };
          });
          return (
            <g key={ym}>
              <defs><clipPath id={`cp${mi}`}><rect x={bx} y={by} width={W} height={bh} rx="6"/></clipPath></defs>
              <text x={bx+W/2} y={by-8} textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight="700" fontFamily="Plus Jakarta Sans,sans-serif">{currency(total)}</text>
              <g clipPath={`url(#cp${mi})`}>
                {segs.map(({ sup, amt, y, h }, si) => (
                  <rect key={si} x={bx} y={y} width={W} height={h+.5} fill={color(sup)}
                    style={{ cursor:"crosshair" }}
                    onMouseEnter={e => setTooltip({ x:e.clientX, y:e.clientY, supplier:sup, amount:amt, total, ym })}
                    onMouseMove={e  => setTooltip(t => t ? { ...t, x:e.clientX, y:e.clientY } : t)}
                    onMouseLeave={() => setTooltip(null)}
                  />
                ))}
              </g>
              <text x={bx+W/2} y={H+26} textAnchor="middle" fill="#64748b" fontSize="12" fontFamily="Plus Jakarta Sans,sans-serif" fontWeight="500">{fmtMonthShort(ym)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
