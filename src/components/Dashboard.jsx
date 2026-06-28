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

function InfoBox({ label, value, sub }) {
  return (
    <div style={{ background: 'var(--surf2)', borderRadius: 8, padding: '10px 12px', border: '1px solid rgba(255,255,255,.05)' }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t1)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{sub}</div>}
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

                {/* Amount comparison bar */}
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

                  {/* Visual bar */}
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

                  {/* Last few invoices */}
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

      {/* Alert banners row */}
      {(missingSuppliers?.length > 0 || anomalousCount > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: missingSuppliers?.length > 0 && anomalousCount > 0 ? '1fr 1fr' : '1fr', gap: 12, marginBottom: 16 }}>

          {missingSuppliers?.length > 0 && (
            <button
              onClick={() => setShowMissing(true)}
              style={{ padding: '14px 18px', borderRadius: 12, background: 'rgba(249,115,22,.08)', border: '1px solid rgba(249,115,22,.3)', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', textAlign: 'right', fontFamily: 'inherit', transition: 'background .15s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(249,115,22,.14)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(249,115,22,.08)'}>
              <span style={{ fontSize: 26, flexShrink: 0 }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#fb923c', marginBottom: 2 }}>חשבוניות חסרות</div>
                <div style={{ fontSize: 12, color: '#fdba74' }}>
                  {missingSuppliers.length} ספק{missingSuppliers.length !== 1 ? 'ים' : ''} קבוע{missingSuppliers.length !== 1 ? 'ים' : ''} לא שלח{missingSuppliers.length !== 1 ? 'ו' : ''} החודש
                </div>
              </div>
              <span style={{ fontSize: 12, color: '#fb923c', opacity: .7 }}>לפרטים ←</span>
            </button>
          )}

          {anomalousCount > 0 && (
            <button
              onClick={() => setShowAnomalies(true)}
              style={{ padding: '14px 18px', borderRadius: 12, background: 'rgba(234,179,8,.07)', border: '1px solid rgba(234,179,8,.28)', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', textAlign: 'right', fontFamily: 'inherit', transition: 'background .15s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(234,179,8,.13)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(234,179,8,.07)'}>
              <span style={{ fontSize: 26, flexShrink: 0 }}>📊</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#fbbf24', marginBottom: 2 }}>חשבוניות חריגות</div>
                <div style={{ fontSize: 12, color: '#fde68a' }}>
                  {anomalousCount} חשבונית{anomalousCount !== 1 ? 'ות' : ''} עם סכום חריג החודש
                </div>
              </div>
              <span style={{ fontSize: 12, color: '#fbbf24', opacity: .7 }}>לפרטים ←</span>
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
