import { useState, useMemo, useRef, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useT, useLayout, useLang } from "../../contexts/AppContexts";
import { FONT_UI as SANS, FONT_DISPLAY as DISPLAY, FONT_MONO as MONO, chartPalette } from "../../theme";
import { fmt } from "../../utils/format";
import { downloadCSV } from "../../utils/csv";
import { todayISO } from "../../utils/collections";
import { analysisYears, yearSeries, topCustomerIds, paymentSpikes, chartRows, seriesTotal, ANALYSIS_TOP_N, lineStyleFor } from "../../utils/collectionsAnalysis";
import { monthShortName, monthLong } from "./shared";
import { Download, TrendingUp, TrendingDown, Users } from "lucide-react";

const kfmt = v => (Math.abs(v) >= 1000 ? `₪${Math.round(v / 1000)}k` : `₪${Math.round(v)}`);
const OTHER = "other";

export default function AnalysisTab({ customers, receivables }) {
  const T = useT();
  const { t, lang } = useLang();
  const { isMobile } = useLayout();
  const today = todayISO();
  const [basis, setBasis] = useState("collected");
  // In January the current year has no complete month yet, so it isn't offered.
  const years = useMemo(() => analysisYears(receivables, basis)
    .filter(y => !(y === Number(today.slice(0, 4)) && today.slice(5, 7) === "01")), [receivables, basis, today]);
  const [year, setYear] = useState(() => Number(today.slice(0, 4)));
  const activeYear = years.includes(year) ? year : (years[years.length - 1] ?? Number(today.slice(0, 4)));
  // "Others" starts hidden: it sums every remaining customer and would flatten the named lines.
  const [hidden, setHidden] = useState(() => new Set([OTHER]));
  const [showTotal, setShowTotal] = useState(false);
  const [picked, setPicked] = useState(null);   // null = automatic top N
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef(null);
  useEffect(() => {
    if (!pickerOpen) return;
    const h = e => { if (pickerRef.current && !pickerRef.current.contains(e.target)) setPickerOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [pickerOpen]);

  const names = useMemo(() => new Map(customers.map(c => [c.id, c.name])), [customers]);
  // For the current year, only complete months are shown (the current month would read as a
  // sudden drop for everyone). Applies to both bases and to the chart, table, totals and CSV.
  const visibleMonths = activeYear === Number(today.slice(0, 4)) ? Number(today.slice(5, 7)) - 1 : 12;
  const rawSeries = useMemo(() => yearSeries(receivables, activeYear, basis, today.slice(0, 7)), [receivables, activeYear, basis, today]);
  const series = useMemo(() => {
    if (visibleMonths >= 12) return rawSeries;
    const m = new Map();
    for (const [id, vals] of rawSeries) {
      const trimmed = vals.map((v, i) => (i >= visibleMonths ? null : v));
      if (seriesTotal(trimmed) > 0) m.set(id, trimmed);
    }
    return m;
  }, [rawSeries, visibleMonths]);
  const prevSeries = useMemo(() => yearSeries(receivables, activeYear - 1, basis, today.slice(0, 7)), [receivables, activeYear, basis, today]);
  const autoTop = useMemo(() => topCustomerIds(series, ANALYSIS_TOP_N), [series]);
  const lineIds = (picked || autoTop).filter(id => series.has(id));
  const hasOthers = [...series.keys()].some(id => !lineIds.includes(id) && seriesTotal(series.get(id)) > 0);
  const palette = chartPalette(T.isDark);
  // Color follows the line's slot in the chosen set (fixed palette order); hiding a line never repaints the others.
  const colorOf = key => key === OTHER ? palette[7] : palette[lineStyleFor(lineIds.indexOf(key)).color];
  const DASHES = { solid: undefined, dashed: "6 4", dotted: "1 4" };
  const dashOf = key => key === OTHER ? undefined : DASHES[lineStyleFor(lineIds.indexOf(key)).style];
  const TOTAL_DASH = "10 3 1 3"; // dash-dot, distinct from every customer style
  const totalSwatch = (
    <svg width={14} height={6} aria-hidden="true" style={{ flexShrink: 0 }}>
      <line x1={1} x2={13} y1={3} y2={3} stroke={T.t2} strokeWidth={2.5} strokeLinecap="round" strokeDasharray="5 2 0.5 2" />
    </svg>
  );
  // Legend / tooltip swatch that shows the line style as well as the color.
  const swatch = (key, w = 16) => (
    <svg width={w} height={6} aria-hidden="true" style={{ flexShrink: 0 }}>
      <line x1={1} x2={w - 1} y1={3} y2={3} stroke={colorOf(key)} strokeWidth={2.5} strokeLinecap="round" strokeDasharray={dashOf(key) === "6 4" ? "4 3" : dashOf(key) === "1 4" ? "0.5 3" : undefined} />
    </svg>
  );

  const rows = useMemo(() => chartRows(series, lineIds).slice(0, visibleMonths), [series, lineIds, visibleMonths]);
  const spikesFor = id => paymentSpikes(series.get(id) || [], prevSeries.get(id) || []);
  const spikes = useMemo(() => {
    const m = new Map();
    for (const id of lineIds) m.set(id, spikesFor(id));
    return m;
  }, [series, prevSeries, lineIds]); // eslint-disable-line react-hooks/exhaustive-deps
  const monthKey = i => `${activeYear}-${String(i + 1).padStart(2, "0")}`;
  const notable = lineIds.filter(id => !hidden.has(id))
    .flatMap(id => spikes.get(id).map(s => ({ ...s, id })))
    .sort((a, b) => b.i - a.i || Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 6);

  const toggle = key => setHidden(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const tableIds = [...series.keys()].filter(id => seriesTotal(series.get(id)) > 0).sort((a, b) => seriesTotal(series.get(b)) - seriesTotal(series.get(a)));
  const exportCsv = () => {
    const cols = ["customer", ...Array.from({ length: visibleMonths }, (_, i) => monthKey(i)), "total"];
    const out = tableIds.map(id => {
      const vals = series.get(id);
      const row = { customer: names.get(id) || "", total: seriesTotal(vals).toFixed(2) };
      vals.slice(0, visibleMonths).forEach((v, i) => { row[monthKey(i)] = v === null ? "" : v.toFixed(2); });
      return row;
    });
    downloadCSV(`collections-analysis-${basis}-${activeYear}.csv`, out, cols, { bom: true });
  };

  // Spike markers drawn as the line's dot: ▲ above / ▼ below the point, in status colors.
  const makeDot = id => props => {
    const { cx, cy, index } = props;
    if (cx == null || cy == null) return null;
    const s = spikes.get(id)?.find(x => x.i === index);
    if (!s) return <circle key={`${id}-${index}`} cx={cx} cy={cy} r={3} fill={colorOf(id)} stroke={T.surf} strokeWidth={2} />;
    const up = s.kind === "up";
    const p = up ? `M${cx - 6},${cy - 8} L${cx + 6},${cy - 8} L${cx},${cy - 17}Z` : `M${cx - 6},${cy + 8} L${cx + 6},${cy + 8} L${cx},${cy + 17}Z`;
    return (
      <g key={`${id}-${index}`}>
        <circle cx={cx} cy={cy} r={4} fill={colorOf(id)} stroke={T.surf} strokeWidth={2} />
        <path d={p} fill={up ? T.green : T.red} stroke={T.surf} strokeWidth={1}><title>{`${names.get(id)} · ${t("ana_vs_avg", { pct: `${s.pct > 0 ? "+" : ""}${s.pct}` })}`}</title></path>
      </g>
    );
  };

  const TooltipBox = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const items = payload.filter(p => p.value !== null && p.value !== undefined).sort((a, b) => b.value - a.value);
    return (
      <div dir={lang === "he" ? "rtl" : "ltr"} style={{ background: T.surf, border: `1px solid ${T.bdr2}`, borderRadius: 9, boxShadow: "var(--shadow-pop)", padding: "8px 10px", minWidth: 180 }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 12, color: T.t1, marginBottom: 4 }}>{monthLong(monthKey(label), lang)}</div>
        {items.map(p => (
          <div key={p.dataKey} style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", fontFamily: SANS, fontSize: 12, color: T.t2, lineHeight: 1.7 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>{p.dataKey === "total" ? totalSwatch : swatch(p.dataKey === "other" ? OTHER : lineIds.find(id => `c_${id}` === p.dataKey) ?? OTHER, 14)}{p.name}</span>
            <span className="num" style={{ color: T.t1 }}>{fmt(p.value)}</span>
          </div>
        ))}
      </div>
    );
  };

  const pill = active => ({ padding: "5px 12px", borderRadius: 7, border: "none", cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: active ? 700 : 400, background: active ? T.accentTint : "transparent", color: active ? T.accent : T.t2 });
  const ctl = { height: 32, padding: "0 10px", background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 7, fontFamily: SANS, fontSize: 12, color: T.t1 };
  const lbl = { fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: T.t3, marginBottom: 6 };

  if (!receivables.length || !years.length) {
    return <div style={{ textAlign: "center", padding: "56px 16px", fontFamily: SANS, fontSize: 13, color: T.t3 }}>{t("ana_empty")}</div>;
  }

  const legendKeys = [...lineIds, ...(hasOthers ? [OTHER] : [])];
  const nameOf = key => key === OTHER ? t("ana_others") : names.get(key) || t("cust_unknown");
  const totalOf = key => key === OTHER ? [...series].filter(([id]) => !lineIds.includes(id)).reduce((a, [, v]) => a + seriesTotal(v), 0) : seriesTotal(series.get(key));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: SANS, fontSize: 12, color: T.t3 }}>
          {t("ana_year")}
          <select id="ana-year" value={activeYear} onChange={e => { setYear(Number(e.target.value)); setPicked(null); }} style={ctl}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <div role="group" aria-label={t("ana_basis")} style={{ display: "flex", background: T.surf, border: `1px solid ${T.bdr}`, borderRadius: 8, padding: 2, gap: 2 }}>
          {["collected", "billed"].map(b => <button key={b} aria-pressed={basis === b} onClick={() => setBasis(b)} style={pill(basis === b)}>{t(`ana_basis_${b}`)}</button>)}
        </div>
        <div ref={pickerRef} style={{ position: "relative" }}>
          <button onClick={() => setPickerOpen(v => !v)} aria-expanded={pickerOpen} className="btn btn-ghost" style={{ height: 32, padding: "0 12px", fontSize: 12 }}>
            <Users size={13} aria-hidden="true" />{t("ana_choose", { n: lineIds.length })}
          </button>
          {pickerOpen && (
            <div style={{ position: "absolute", top: 36, insetInlineStart: 0, width: 250, maxHeight: 300, overflowY: "auto", background: T.surf, border: `1px solid ${T.bdr2}`, borderRadius: 10, boxShadow: "var(--shadow-pop)", zIndex: 200, padding: 6 }}>
              <div style={{ fontFamily: SANS, fontSize: 11, color: T.t3, padding: "4px 8px 6px" }}>{t("ana_choose_hint", { n: ANALYSIS_TOP_N })}</div>
              {tableIds.map(id => {
                const on = lineIds.includes(id);
                const full = !on && lineIds.length >= ANALYSIS_TOP_N;
                return (
                  <label key={id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, fontFamily: SANS, fontSize: 12, color: full ? T.t3 : T.t1, cursor: full ? "default" : "pointer" }}>
                    <input type="checkbox" id={`ana-pick-${id}`} checked={on} disabled={full} style={{ accentColor: T.accent }}
                      onChange={() => setPicked(on ? lineIds.filter(x => x !== id) : [...lineIds, id])} />
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{names.get(id)}</span>
                    <span className="num" style={{ color: T.t3, fontSize: 11 }}>{kfmt(seriesTotal(series.get(id)))}</span>
                  </label>
                );
              })}
              {picked && <button onClick={() => setPicked(null)} style={{ margin: "6px 8px", background: "none", border: "none", color: T.accent, cursor: "pointer", fontFamily: SANS, fontSize: 12, padding: 0 }}>{t("ana_reset_top")}</button>}
            </div>
          )}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: SANS, fontSize: 12, color: T.t2, cursor: "pointer" }}>
          <input type="checkbox" id="ana-total" checked={showTotal} onChange={e => setShowTotal(e.target.checked)} style={{ accentColor: T.accent }} />{t("ana_total_line")}
        </label>
        <button className="btn btn-ghost" style={{ marginInlineStart: "auto", height: 32, padding: "0 12px", fontSize: 12 }} onClick={exportCsv}>
          <Download size={13} aria-hidden="true" />{t("coll_export_month")}
        </button>
      </div>

      <div className="card" style={{ padding: isMobile ? 12 : 16 }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 15, color: T.t1 }}>{t(`ana_title_${basis}`, { year: activeYear })}</div>
        <div style={{ fontFamily: SANS, fontSize: 12, color: T.t3, marginTop: 2, marginBottom: 10 }}>{t("ana_hint")}{visibleMonths < 12 ? ` ${t("ana_partial_hint", { month: monthShortName(monthKey(visibleMonths), lang) })}` : ""}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {legendKeys.map(key => (
            <button key={key} onClick={() => toggle(key)} aria-pressed={!hidden.has(key)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, border: `1px solid ${T.bdr}`, background: T.surf2, cursor: "pointer", fontFamily: SANS, fontSize: 12, color: T.t1, opacity: hidden.has(key) ? 0.45 : 1, textDecoration: hidden.has(key) ? "line-through" : "none" }}>
              {swatch(key)}
              {nameOf(key)} <span className="num" style={{ color: T.t3, fontSize: 11 }}>{kfmt(totalOf(key))}</span>
            </button>
          ))}
        </div>
        <div dir="ltr">
          <ResponsiveContainer width="100%" height={isMobile ? 240 : 320}>
            <LineChart data={rows} margin={{ top: 22, right: 12, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.bdr} vertical={false} />
              <XAxis dataKey="i" tickFormatter={i => monthShortName(monthKey(i), lang)} tick={{ fontFamily: SANS, fontSize: isMobile ? 10 : 11, fill: T.t3 }} axisLine={false} tickLine={false} interval={isMobile ? 1 : 0} />
              <YAxis tick={{ fontFamily: MONO, fontSize: 10, fill: T.t3 }} axisLine={false} tickLine={false} tickFormatter={kfmt} width={isMobile ? 40 : 48} />
              <Tooltip content={<TooltipBox />} cursor={{ stroke: T.bdr2, strokeWidth: 1 }} animationDuration={120} />
              {lineIds.map(id => !hidden.has(id) && (
                <Line key={id} type="monotone" dataKey={`c_${id}`} name={names.get(id)} stroke={colorOf(id)} strokeWidth={2} strokeLinecap="round" strokeDasharray={dashOf(id)} dot={makeDot(id)} activeDot={{ r: 5, stroke: T.surf, strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
              ))}
              {hasOthers && !hidden.has(OTHER) && (
                <Line type="monotone" dataKey="other" name={t("ana_others")} stroke={colorOf(OTHER)} strokeWidth={2} dot={{ r: 3, fill: colorOf(OTHER), stroke: T.surf, strokeWidth: 2 }} isAnimationActive={false} />
              )}
              {showTotal && (
                <Line type="monotone" dataKey="total" name={t("ana_total_line")} stroke={T.t2} strokeWidth={2} strokeLinecap="round" strokeDasharray={TOTAL_DASH} dot={false} isAnimationActive={false} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <div style={lbl}>{t("ana_notable")}</div>
        {notable.length === 0 ? (
          <div style={{ fontFamily: SANS, fontSize: 12.5, color: T.t3 }}>{t("ana_no_notable")}</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
            {notable.map(n => {
              const up = n.kind === "up";
              const Icon = up ? TrendingUp : TrendingDown;
              return (
                <div key={`${n.id}-${n.i}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: T.surf, border: `1px solid ${T.bdr}`, borderRadius: 9, fontFamily: SANS, fontSize: 12.5, color: T.t1 }}>
                  <Icon size={15} color={up ? T.green : T.red} aria-hidden="true" />
                  {swatch(n.id, 14)}
                  <span>{t(up ? "ana_spike_up" : "ana_spike_down", { name: names.get(n.id), pct: Math.abs(n.pct), month: monthShortName(monthKey(n.i), lang) })}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <div style={lbl}>{t("ana_table")}</div>
        <div className="card" style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 900, fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ ...lbl, marginBottom: 0, padding: "8px 10px", textAlign: "start", background: T.surf2, position: "sticky", insetInlineStart: 0 }}>{t("coll_field_customer")}</th>
                {Array.from({ length: visibleMonths }, (_, i) => <th key={i} style={{ ...lbl, marginBottom: 0, padding: "8px 6px", textAlign: "end", background: T.surf2 }}>{monthShortName(monthKey(i), lang)}</th>)}
                <th style={{ ...lbl, marginBottom: 0, padding: "8px 10px", textAlign: "end", background: T.surf2 }}>{t("coll_total")}</th>
              </tr>
            </thead>
            <tbody>
              {tableIds.map(id => {
                const vals = series.get(id);
                const sp = spikesFor(id);
                return (
                  <tr key={id} style={{ borderTop: `1px solid ${T.bdr}` }}>
                    <td style={{ padding: "7px 10px", fontFamily: SANS, color: T.t1, whiteSpace: "nowrap", position: "sticky", insetInlineStart: 0, background: T.surf }}>{names.get(id)}</td>
                    {vals.slice(0, visibleMonths).map((v, i) => {
                      const s = sp.find(x => x.i === i);
                      return (
                        <td key={i} className="num" title={s ? t("ana_vs_avg", { pct: `${s.pct > 0 ? "+" : ""}${s.pct}` }) : undefined}
                          style={{ padding: "7px 6px", textAlign: "end", whiteSpace: "nowrap", color: s ? (s.kind === "up" ? T.green : T.red) : v ? T.t2 : T.t3, fontWeight: s ? 700 : 400 }}>
                          {v === null ? "" : v ? Math.round(v).toLocaleString("en-US") : "—"}{s ? (s.kind === "up" ? " ▲" : " ▼") : ""}
                        </td>
                      );
                    })}
                    <td className="num" style={{ padding: "7px 10px", textAlign: "end", fontWeight: 600, color: T.t1, whiteSpace: "nowrap" }}>{Math.round(seriesTotal(vals)).toLocaleString("en-US")}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: `1px solid ${T.bdr2}`, background: T.surf2 }}>
                <td style={{ padding: "8px 10px", fontFamily: SANS, fontWeight: 700, color: T.t1, position: "sticky", insetInlineStart: 0, background: T.surf2 }}>{t("coll_total")}</td>
                {rows.map(r => <td key={r.i} className="num" style={{ padding: "8px 6px", textAlign: "end", fontWeight: 700, color: T.t1, whiteSpace: "nowrap" }}>{r.total === null ? "" : Math.round(r.total).toLocaleString("en-US")}</td>)}
                <td className="num" style={{ padding: "8px 10px", textAlign: "end", fontWeight: 700, color: T.t1, whiteSpace: "nowrap" }}>{Math.round(rows.reduce((a, r) => a + (r.total || 0), 0)).toLocaleString("en-US")}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
