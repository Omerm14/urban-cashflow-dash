import { useState, useEffect, useMemo, useRef } from "react";
import { useT, useLayout, useLang } from "../contexts/AppContexts";
import { FONT_UI as SANS, FONT_DISPLAY as DISPLAY, FONT_MONO as MONO } from "../theme";
import { fmt, MONTHS_SHORT } from "../utils/format";
import { projectMonth } from "../utils/projection";
import { ChevronRight } from "lucide-react";
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const isUnpaid = (i) => i.status !== "Paid" && i.status !== "paid";
const isPaid = (i) => i.status === "Paid" || i.status === "paid";
const isOverdue = (i) => i.status === "Overdue" || i.status === "overdue";

// Eased count-up for KPI values. Animates from the previously displayed value
// (not zero) so small data edits nudge rather than replay; snaps immediately
// under prefers-reduced-motion.
function useCountUp(target, duration = 900) {
  const [value, setValue] = useState(target);
  const displayedRef = useRef(target);
  useEffect(() => { displayedRef.current = value; });
  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    const from = displayedRef.current;
    if (from === target) return;
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setValue(from + (target - from) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]); // eslint-disable-line react-hooks/exhaustive-deps
  return value;
}

function Sparkline({ points, color, height = 26 }) {
  if (!points || points.length < 2) return null;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const W = 100;
  const coords = points.map((v, i) => [
    (i / (points.length - 1)) * W,
    height - 3 - ((v - min) / range) * (height - 6),
  ]);
  const path = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [ex, ey] = coords[coords.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height }} aria-hidden="true">
      <polyline points={path} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <circle cx={ex} cy={ey} r="2.4" fill={color} />
    </svg>
  );
}

function ChartTooltip({ active, payload, label }) {
  const T = useT();
  const { t } = useLang();
  if (!active || !payload?.length) return null;
  const barEntries = payload.filter(p => p.value > 0);
  if (!barEntries.length) return null;
  const total = barEntries.reduce((s, p) => s + p.value, 0);
  const momPct = payload[0]?.payload?.momPct;
  return (
    <div style={{ background: T.surf3, border: `1px solid ${T.bdr2}`, borderRadius: 10, padding: "12px 16px", boxShadow: "var(--shadow-pop)", minWidth: 160 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, marginBottom: 8 }}>
        <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 600, color: T.t2 }}>{label}</span>
        <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: T.t1, fontVariantNumeric: "tabular-nums" }}>{fmt(total)}</span>
      </div>
      {barEntries.slice(0, 6).map(p => (
        <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: 2, background: p.fill, flexShrink: 0 }} />
          <span style={{ fontFamily: SANS, fontSize: 12, color: T.t2, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 130 }}>{p.name}</span>
          <span style={{ fontFamily: MONO, fontSize: 12, color: T.t1, fontVariantNumeric: "tabular-nums" }}>{fmt(p.value)}</span>
        </div>
      ))}
      {barEntries.length > 6 && (
        <div style={{ fontFamily: SANS, fontSize: 11, color: T.t3, marginTop: 2 }}>+{barEntries.length - 6} more</div>
      )}
      {momPct != null && momPct !== 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${T.bdr}`, marginTop: 6, paddingTop: 6 }}>
          <span style={{ fontFamily: SANS, fontSize: 11, color: T.t3 }}>{t("dash_vs_prev")}</span>
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: momPct >= 0 ? T.red : T.green }}>
            {momPct >= 0 ? "+" : ""}{momPct}%
          </span>
        </div>
      )}
    </div>
  );
}

function KPITile({ label, value, valueColor, delta, deltaGoodWhenDown, meta, spark, sparkColor, delay, onClick }) {
  const animated = useCountUp(value);
  const deltaUp = delta != null && delta >= 0;
  // For money owed, going down is good news — color accordingly.
  const good = delta == null ? null : (deltaGoodWhenDown ? !deltaUp : deltaUp);
  return (
    <div className={`kpi${onClick ? " clickable" : ""}`} style={{ animationDelay: `${delay}s` }}
      onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") onClick(); } : undefined}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value" style={valueColor ? { color: valueColor } : undefined}>{fmt(animated)}</span>
      <div className="kpi-meta">
        {delta != null && (
          <span className={`kpi-delta ${good ? "up" : "down"}`}>
            {deltaUp ? "▴" : "▾"} {Math.abs(delta)}%
          </span>
        )}
        <span>{meta}</span>
      </div>
      {spark && spark.length > 1 && <Sparkline points={spark} color={sparkColor} />}
    </div>
  );
}

function DashboardSkeleton({ isMobile }) {
  return (
    <div aria-busy="true" aria-label="Loading dashboard">
      <div className="shimmer" style={{ height: 28, width: 260, marginBottom: 20 }} />
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
        {[0, 1, 2, 3].map(i => <div key={i} className="shimmer" style={{ height: 118 }} />)}
      </div>
      <div className="shimmer" style={{ height: 72, marginBottom: 16 }} />
      <div className="shimmer" style={{ height: 300 }} />
    </div>
  );
}

export default function DashboardView({ invoices, suppliers, loading, onPayAll, chartData, supplierNames, supplierColor, user, onMissingAlert, onAnomalyAlert, missingSuppliers, anomalyMap, onViewMonth, onNavigateFiltered }) {
  const T = useT();
  const { t, lang } = useLang();
  const { isMobile, isTablet } = useLayout();
  const locale = lang === "he" ? "he-IL" : "en-US";
  const now = new Date();

  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const currentMonthLabel = `${MONTHS_SHORT[now.getMonth()]} '${String(now.getFullYear()).slice(2)}`;
  const hour = now.getHours();
  const greeting = hour < 12 ? t("greeting_morning") : hour < 17 ? t("greeting_afternoon") : hour < 21 ? t("greeting_evening") : t("greeting_night");
  const firstName = user?.user_metadata?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "";

  const stats = useMemo(() => {
    const in30 = new Date(now); in30.setDate(in30.getDate() + 30);
    const in30Str = in30.toISOString().slice(0, 10);
    const todayStr = now.toISOString().slice(0, 10);

    const outstanding = invoices.filter(isUnpaid).reduce((s, i) => s + Number(i.amount), 0);
    const overdueInvs = invoices.filter(isOverdue);
    const due30Invs = invoices.filter(i => isUnpaid(i) && i.dueDate && i.dueDate >= todayStr && i.dueDate <= in30Str);
    const paidThisMonth = invoices.filter(i => isPaid(i) && (i.invoice_date || i.invoiceDate || "").startsWith(currentYM)).reduce((s, i) => s + Number(i.amount), 0);

    // Deltas vs previous month
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevYM = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
    const prevOutstanding = invoices.filter(i => isUnpaid(i) && (i.dueDate || "").startsWith(prevYM)).reduce((s, i) => s + Number(i.amount), 0);
    const currOutstanding = invoices.filter(i => isUnpaid(i) && (i.dueDate || "").startsWith(currentYM)).reduce((s, i) => s + Number(i.amount), 0);
    const prevPaid = invoices.filter(i => isPaid(i) && (i.invoice_date || i.invoiceDate || "").startsWith(prevYM)).reduce((s, i) => s + Number(i.amount), 0);
    const outstandingDelta = prevOutstanding > 0 ? Math.round((currOutstanding - prevOutstanding) / prevOutstanding * 100) : null;
    const paidDelta = prevPaid > 0 ? Math.round((paidThisMonth - prevPaid) / prevPaid * 100) : null;

    // Sparklines — last 8 months of unpaid-due and paid totals
    const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const last8 = Array.from({ length: 8 }, (_, i) => monthKey(new Date(now.getFullYear(), now.getMonth() - 7 + i, 1)));
    const dueSeries = last8.map(ym => invoices.filter(i => (i.dueDate || "").startsWith(ym)).reduce((s, i) => s + Number(i.amount), 0));
    const paidSeries = last8.map(ym => invoices.filter(i => isPaid(i) && (i.invoice_date || i.invoiceDate || "").startsWith(ym)).reduce((s, i) => s + Number(i.amount), 0));

    // Due this week
    const in7 = new Date(now); in7.setDate(in7.getDate() + 7);
    const in7Str = in7.toISOString().slice(0, 10);
    const dueThisWeek = invoices
      .filter(i => i.dueDate && ((isUnpaid(i) && i.dueDate <= in7Str) || (isPaid(i) && i.dueDate >= todayStr && i.dueDate <= in7Str)))
      .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""))
      .slice(0, 5);
    const dueThisWeekTotal = dueThisWeek.filter(isUnpaid).reduce((s, i) => s + Number(i.amount), 0);

    const attention = overdueInvs.length;
    const oldestOverdueDays = overdueInvs.reduce((max, i) => {
      if (!i.dueDate) return max;
      const days = Math.floor((now - new Date(i.dueDate + "T12:00:00")) / 86_400_000);
      return Math.max(max, days);
    }, 0);

    const currentMonthInvoices = invoices.filter(i => (i.invoice_date || i.invoiceDate || i.dueDate || "").startsWith(currentYM) && isUnpaid(i));

    return {
      outstanding, outstandingDelta,
      overdue: overdueInvs.reduce((s, i) => s + Number(i.amount), 0),
      overdueCount: overdueInvs.length,
      due30: due30Invs.reduce((s, i) => s + Number(i.amount), 0),
      due30Count: due30Invs.length,
      due30Suppliers: new Set(due30Invs.map(i => i.supplier)).size,
      paidThisMonth, paidDelta,
      dueSeries, paidSeries, dueThisWeek, dueThisWeekTotal, attention, oldestOverdueDays,
      currentMonthTotal: currentMonthInvoices.reduce((s, i) => s + Number(i.amount || 0), 0),
      currentMonthSuppliers: new Set(currentMonthInvoices.map(i => i.supplier)).size,
    };
  }, [invoices, currentYM]); // eslint-disable-line react-hooks/exhaustive-deps

  const { currentMonthTotal, currentMonthSuppliers } = stats;

  const [chartRange, setChartRange] = useState("monthly");
  const [focusedMonth, setFocusedMonth] = useState(null);
  const baseColor = supplierColor || (() => T.accentDeep);

  // The chart palette has 8 fixed slots; beyond that, hues would repeat and the
  // legend becomes noise. Keep the 7 biggest suppliers as series and fold the
  // rest into a neutral "Other" stack segment.
  const OTHER = t("dash_other");
  const FORECAST = t("dash_forecast");
  // Next month = committed invoices + recurring-supplier forecast, drawn as a
  // visually distinct (tinted, outlined) segment so it never reads as actuals.
  const projection = useMemo(() => {
    const d = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextYM = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const nextLabel = `${MONTHS_SHORT[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
    return { ...projectMonth(invoices, nextYM), nextLabel };
  }, [invoices]); // eslint-disable-line react-hooks/exhaustive-deps

  const { chartSuppliers, resolvedChartData } = useMemo(() => {
    let data = chartData && chartData.length > 0 ? [...chartData] : [];
    const names = supplierNames || [];
    let suppliers = names, rows = data;
    if (names.length > 8) {
      const totals = {};
      data.forEach(m => names.forEach(n => { if (m[n]) totals[n] = (totals[n] || 0) + m[n]; }));
      const top = [...names].sort((a, b) => (totals[b] || 0) - (totals[a] || 0)).slice(0, 7);
      const topSet = new Set(top);
      rows = data.map(m => {
        const row = { month: m.month, total: m.total };
        let other = 0;
        names.forEach(n => { if (!m[n]) return; if (topSet.has(n)) row[n] = m[n]; else other += m[n]; });
        if (other > 0) row[OTHER] = other;
        return row;
      });
      suppliers = [...top, OTHER];
    } else {
      rows = data.map(m => ({ ...m }));
    }
    // Attach the forecast to next month's row (creating it if no invoice is
    // committed there yet).
    if (projection.forecast > 0) {
      let row = rows.find(r => r.month === projection.nextLabel);
      if (!row) { row = { month: projection.nextLabel, total: 0 }; rows.push(row); }
      row[FORECAST] = projection.forecast;
      row.total = (row.total || 0) + projection.forecast;
    }
    return { chartSuppliers: suppliers, resolvedChartData: rows };
  }, [chartData, supplierNames, OTHER, FORECAST, projection]);
  const getColor = (name) => (name === OTHER ? T.t3 : name === FORECAST ? T.accentDeep : baseColor(name));
  const focusedIdx = focusedMonth ? resolvedChartData.findIndex(m => m.month === focusedMonth) : -1;

  if (loading) return <DashboardSkeleton isMobile={isMobile} />;

  const kpiCols = isMobile || isTablet ? "1fr 1fr" : "repeat(4,1fr)";

  return (
    <div style={{ animation: "slideUp 0.35s cubic-bezier(.16,1,.3,1)" }}>
      {/* Greeting */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: isMobile ? 14 : 20 }}>
        <div>
          <h1 style={{ fontFamily: DISPLAY, fontSize: isMobile ? 18 : 22, fontWeight: 700, letterSpacing: "-0.02em", color: T.t1, margin: "0 0 3px", lineHeight: 1.1 }}>
            {greeting}{firstName ? `, ${firstName}` : ""}
          </h1>
          {!isMobile && (
            <p style={{ fontFamily: SANS, fontSize: 13, color: T.t2, margin: 0 }}>
              {now.toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              {stats.attention > 0 && <> · <span style={{ color: T.amber, fontWeight: 500 }}>{t("dash_attention", { n: stats.attention })}</span></>}
            </p>
          )}
        </div>
        <div style={{ flex: 1 }} />
      </div>

      {/* Alert cards */}
      {((missingSuppliers?.length > 0) || (anomalyMap?.size > 0)) && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10, marginBottom: 14 }}>
          {missingSuppliers?.length > 0 && (
            <button onClick={onMissingAlert} style={{ background: T.amberTint, border: `1px solid ${T.amberBdr}`, borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", gap: 13, cursor: "pointer", textAlign: "start" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={T.amber} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true"><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 13.5, color: T.t1, letterSpacing: "-0.01em" }}>{t("dash_missing_title", { n: missingSuppliers.length })}</div>
                <div style={{ fontFamily: SANS, fontSize: 12, color: T.t2, marginTop: 1 }}>{t("dash_missing_sub")}</div>
              </div>
              <span style={{ fontFamily: SANS, fontSize: 12, color: T.amber, fontWeight: 600, flexShrink: 0 }}>{t("dash_details")}</span>
            </button>
          )}
          {anomalyMap?.size > 0 && (
            <button onClick={onAnomalyAlert} style={{ background: T.accentTint, border: `1px solid ${T.accentBdr}`, borderRadius: 12, padding: "13px 16px", display: "flex", alignItems: "center", gap: 13, cursor: "pointer", textAlign: "start" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 13.5, color: T.t1, letterSpacing: "-0.01em" }}>{t("dash_anomaly_title", { n: anomalyMap.size })}</div>
                <div style={{ fontFamily: SANS, fontSize: 12, color: T.t2, marginTop: 1 }}>{t("dash_anomaly_sub")}</div>
              </div>
              <span style={{ fontFamily: SANS, fontSize: 12, color: T.accent, fontWeight: 600, flexShrink: 0 }}>{t("dash_details")}</span>
            </button>
          )}
        </div>
      )}

      {/* KPI tiles */}
      <div style={{ display: "grid", gridTemplateColumns: kpiCols, gap: 12, marginBottom: 14 }}>
        <KPITile label={t("kpi_outstanding")} value={stats.outstanding} delay={0}
          delta={stats.outstandingDelta} deltaGoodWhenDown meta={t("dash_vs_last")}
          spark={stats.dueSeries} sparkColor={T.accentDeep}
          onClick={() => onNavigateFiltered?.("Unpaid")} />
        <KPITile label={t("kpi_overdue")} value={stats.overdue} valueColor={T.red} delay={0.06}
          meta={stats.overdueCount > 0
            ? (stats.oldestOverdueDays > 0
              ? t("kpi_overdue_oldest", { n: stats.overdueCount, d: stats.oldestOverdueDays })
              : `${stats.overdueCount} ${t("kpi_invoices")} · ${t("kpi_need_action")}`)
            : t("notif_all_clear")}
          onClick={() => onNavigateFiltered?.("Overdue")} />
        <KPITile label={t("kpi_due_30")} value={stats.due30} delay={0.12}
          meta={t("kpi_due_30_meta", { n: stats.due30Count, s: stats.due30Suppliers })} />
        <KPITile label={t("kpi_paid_month")} value={stats.paidThisMonth} delay={0.18}
          delta={stats.paidDelta} meta={t("dash_vs_last")}
          spark={stats.paidSeries} sparkColor={T.green}
          onClick={() => onNavigateFiltered?.("Paid")} />
      </div>

      {/* Pay-ready banner */}
      <div className="card" style={{ borderColor: currentMonthTotal > 0 ? T.accentBdr : T.bdr, padding: isMobile ? "14px 16px" : "18px 22px", display: "flex", alignItems: isMobile ? "flex-start" : "center", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
          <div style={{ width: 42, height: 42, borderRadius: 11, background: T.accentTint, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.75" strokeLinecap="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          </div>
          <div>
            <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 15, color: T.t1, letterSpacing: "-0.015em", marginBottom: 3 }}>
              {currentMonthTotal > 0 ? t("dash_pay_ready", { month: currentMonthLabel }) : t("dash_nothing_due", { month: currentMonthLabel })}
            </div>
            <div style={{ fontFamily: SANS, fontSize: 13, color: T.t2 }}>
              {currentMonthSuppliers !== 1 ? t("dash_suppliers_plural", { n: currentMonthSuppliers }) : t("dash_suppliers", { n: currentMonthSuppliers })}
              {" · "}
              <span className="num" style={{ color: T.accent, fontWeight: 500 }}>{fmt(currentMonthTotal)}</span> {t("dash_total_due")}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0, alignSelf: isMobile ? "stretch" : "auto" }}>
          <button className="btn btn-ghost" onClick={() => onViewMonth?.()}>{t("dash_view_invoices")}</button>
          <button className="btn btn-accent" style={{ flex: isMobile ? 1 : "none" }} onClick={onPayAll}>
            {t("dash_pay_all")} <ChevronRight size={12} strokeWidth={2.5} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Main grid: chart + due-this-week */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile || isTablet ? "1fr" : "1.6fr 1fr", gap: 12, marginBottom: 14, alignItems: "start" }}>
        <div className="card" style={{ padding: isMobile ? "16px" : "20px 22px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 14.5, color: T.t1, letterSpacing: "-0.015em" }}>{t("dash_payment_schedule")}</div>
              <div style={{ fontFamily: SANS, fontSize: 12, color: T.t3, marginTop: 3 }}>
                {t("dash_upcoming")}
                {projection.forecast > 0 && <> · {t("dash_projected_note", { month: projection.nextLabel })}</>}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              {chartRange === "monthly" && resolvedChartData.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 2, background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 8, padding: "2px 4px" }}>
                  <button aria-label="Previous month" onClick={() => { if (focusedMonth && focusedIdx > 0) setFocusedMonth(resolvedChartData[focusedIdx - 1].month); else if (!focusedMonth) setFocusedMonth(resolvedChartData[0].month); }} style={{ padding: "3px 7px", borderRadius: 5, border: "none", background: "transparent", fontFamily: SANS, fontSize: 13, fontWeight: 600, color: T.t2, cursor: "pointer" }}>‹</button>
                  <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 600, color: T.t1, padding: "0 4px", minWidth: 60, textAlign: "center" }}>{focusedMonth || t("dash_all_months")}</span>
                  <button aria-label="Next month" onClick={() => { if (focusedMonth && focusedIdx < resolvedChartData.length - 1) setFocusedMonth(resolvedChartData[focusedIdx + 1].month); else if (!focusedMonth) setFocusedMonth(resolvedChartData[resolvedChartData.length - 1].month); }} style={{ padding: "3px 7px", borderRadius: 5, border: "none", background: "transparent", fontFamily: SANS, fontSize: 13, fontWeight: 600, color: T.t2, cursor: "pointer" }}>›</button>
                  {focusedMonth && <button onClick={() => setFocusedMonth(null)} style={{ padding: "3px 8px", borderRadius: 5, border: "none", background: "transparent", fontFamily: SANS, fontSize: 10, fontWeight: 600, color: T.t3, cursor: "pointer" }}>{t("dash_all_months")}</button>}
                </div>
              )}
              <div style={{ display: "flex", gap: 4, background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 8, padding: 3 }}>
                {[{ key: "monthly", label: t("dash_range_monthly") }, { key: "quarterly", label: t("dash_range_quarterly") }, { key: "yearly", label: t("dash_range_yearly") }].map(opt => (
                  <button key={opt.key} onClick={() => { setChartRange(opt.key); setFocusedMonth(null); }} style={{ padding: "4px 12px", borderRadius: 6, border: "none", background: chartRange === opt.key ? T.accentTint : "transparent", fontFamily: SANS, fontSize: 11, fontWeight: 600, color: chartRange === opt.key ? T.accent : T.t2, cursor: "pointer" }}>{opt.label}</button>
                ))}
              </div>
            </div>
          </div>
          {(() => {
            let displayData, barSize;
            const withMom = (arr) => arr.map((m, i) => {
              const prev = arr[i - 1];
              const momPct = prev && prev.total > 0 ? Math.round((m.total - prev.total) / prev.total * 100) : 0;
              return { ...m, momPct };
            });
            if (chartRange === "monthly") {
              const base = focusedMonth ? resolvedChartData.filter(m => m.month === focusedMonth) : resolvedChartData.slice(-12);
              displayData = withMom(base);
              barSize = focusedMonth ? (isMobile ? 44 : 70) : (isMobile ? 20 : 28);
            } else if (chartRange === "quarterly") {
              const qMap = {};
              resolvedChartData.forEach(m => {
                const [mon, yr] = m.month.split(" '");
                const q = Math.floor(MONTHS_SHORT.indexOf(mon) / 3) + 1;
                const key = `Q${q} '${yr}`;
                if (!qMap[key]) qMap[key] = { month: key, total: 0 };
                chartSuppliers.forEach(s => {
                  qMap[key][s] = (qMap[key][s] || 0) + (m[s] || 0);
                  qMap[key].total += (m[s] || 0);
                });
              });
              displayData = withMom(Object.values(qMap).slice(-4));
              barSize = isMobile ? 34 : 50;
            } else {
              const yMap = {};
              resolvedChartData.forEach(m => {
                const yr = m.month.split(" '")[1];
                const key = `20${yr}`;
                if (!yMap[key]) yMap[key] = { month: key, total: 0 };
                chartSuppliers.forEach(s => {
                  yMap[key][s] = (yMap[key][s] || 0) + (m[s] || 0);
                  yMap[key].total += (m[s] || 0);
                });
              });
              displayData = withMom(Object.values(yMap));
              barSize = isMobile ? 44 : 60;
            }
            return (
              <ResponsiveContainer width="100%" height={isMobile ? 190 : 260}>
                <ComposedChart data={displayData} barSize={barSize} barCategoryGap="28%" onClick={(data) => { if (data?.activeLabel && chartRange === "monthly") setFocusedMonth(data.activeLabel); }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.bdr} vertical={false} />
                  <XAxis dataKey="month" tick={{ fontFamily: SANS, fontSize: isMobile ? 10 : 11, fill: T.t3 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontFamily: MONO, fontSize: 10, fill: T.t3 }} axisLine={false} tickLine={false} tickFormatter={v => `₪${(v / 1000).toFixed(0)}k`} width={isMobile ? 34 : 40} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: T.accentTint }} animationDuration={150} />
                  {chartSuppliers.map((name, i) => (
                    <Bar key={name} dataKey={name} stackId="a" fill={getColor(name)}
                      radius={i === chartSuppliers.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                      animationDuration={600} animationEasing="ease-out" />
                  ))}
                  {projection.forecast > 0 && (
                    <Bar dataKey={FORECAST} stackId="a" fill={T.accentTint} stroke={T.accentDeep}
                      strokeDasharray="4 3" radius={[3, 3, 0, 0]}
                      animationDuration={600} animationEasing="ease-out" />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            );
          })()}
          {(chartSuppliers.length > 1 || projection.forecast > 0) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.bdr}` }}>
              {chartSuppliers.map(n => (
                <div key={n} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: getColor(n), flexShrink: 0 }} />
                  <span style={{ fontFamily: SANS, fontSize: 11, color: T.t2, maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n}</span>
                </div>
              ))}
              {projection.forecast > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: T.accentTint, border: `1.5px dashed ${T.accentDeep}`, flexShrink: 0 }} />
                  <span style={{ fontFamily: SANS, fontSize: 11, color: T.t2 }}>{FORECAST}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Due this week */}
        <div className="card" style={{ padding: "18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
            <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 14.5, color: T.t1, letterSpacing: "-0.015em" }}>{t("dash_due_week")}</span>
            <span className="num" style={{ fontSize: 12, color: T.t3 }}>{fmt(stats.dueThisWeekTotal)}</span>
          </div>
          {stats.dueThisWeek.length === 0 && (
            <div style={{ padding: "24px 0", textAlign: "center", fontFamily: SANS, fontSize: 13, color: T.t3 }}>
              {t("dash_week_clear")}
            </div>
          )}
          {stats.dueThisWeek.map((inv, i) => {
            const terms = (suppliers || []).find(s => s.name === inv.supplier)?.terms;
            const prettyTerms = terms ? terms.replace("shotef_plus(", "+").replace(")", "") : null;
            return (
            <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: i > 0 ? `1px solid ${T.bdr}` : "none" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: baseColor(inv.supplier), flexShrink: 0 }} aria-hidden="true" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: T.t1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{inv.supplier}</div>
                <div style={{ fontFamily: SANS, fontSize: 11, color: T.t3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {inv.dueDate ? new Date(inv.dueDate + "T12:00:00").toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" }) : "—"}
                  {prettyTerms && <> · {prettyTerms}</>}
                </div>
              </div>
              <span className="num" style={{ fontSize: 13, color: T.t1 }}>{fmt(inv.amount)}</span>
              <span className={`pill ${isOverdue(inv) ? "pill-overdue" : isPaid(inv) ? "pill-paid" : "pill-pending"}`}>
                <i aria-hidden="true" />{isOverdue(inv) ? t("inv_overdue") : isPaid(inv) ? t("inv_paid") : t("inv_unpaid")}
              </span>
            </div>
            );
          })}
        </div>
      </div>

      {/* Recent month mini-cards */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)", gap: 10 }}>
        {resolvedChartData.slice(-4).map(m => (
          <button key={m.month} onClick={() => onViewMonth?.(m.month)} className="card"
            style={{ padding: "12px 14px", cursor: "pointer", textAlign: "start", transition: "border-color 0.18s" }}
            onMouseEnter={e => e.currentTarget.style.borderColor = T.bdr2}
            onMouseLeave={e => e.currentTarget.style.borderColor = T.bdr}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 13, color: T.t1, letterSpacing: "-0.01em" }}>{m.month}</span>
              <span className="num" style={{ fontWeight: 600, fontSize: 13, color: T.t1 }}>{fmt(m.total)}</span>
            </div>
            {!isMobile && Object.entries(m).filter(([k]) => k !== "month" && k !== "total" && m[k] > 0)
              .sort((a, b) => b[1] - a[1]).slice(0, 3)
              .map(([sup, amt]) => (
                <div key={sup} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: getColor(sup), flexShrink: 0 }} aria-hidden="true" />
                  <span style={{ flex: 1, fontFamily: SANS, fontSize: 11, color: T.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sup}</span>
                  <span className="num" style={{ fontSize: 11, fontWeight: 500, color: T.t2 }}>{fmt(amt)}</span>
                </div>
              ))}
          </button>
        ))}
      </div>
    </div>
  );
}
