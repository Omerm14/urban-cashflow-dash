import { useState } from "react";
import { currency, fmtMonth, fmtMonthShort } from "../utils/dates";
import {
  TrendingUp, AlertTriangle, Clock, CheckCircle2,
  ArrowUpRight, ArrowDownRight, Zap, ChevronRight,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";

const T = {
  surf:  "#FFFFFF",
  surf2: "#F8FAFC",
  bdr:   "#E2E8F0",
  bdr2:  "#CBD5E1",
  t1:    "#0F172A",
  t2:    "#475569",
  t3:    "#94A3B8",
  indigo: "#6366F1",
  indigoTint: "#EEF2FF",
  indigoBdr:  "#C7D2FE",
  green:  "#10B981",
  red:    "#EF4444",
  amber:  "#F59E0B",
};

const STAT_CFG = [
  { key: "outstanding", label: "Outstanding", Icon: TrendingUp,    accent: T.indigo },
  { key: "overdue",     label: "Overdue",     Icon: AlertTriangle, accent: T.red    },
  { key: "nextMonth",   label: "Next Month",  Icon: Clock,         accent: T.amber  },
  { key: "paid",        label: "Total Paid",  Icon: CheckCircle2,  accent: T.green  },
];

function KPICard({ label, value, prev, Icon, accent }) {
  const delta = prev > 0 ? ((value - prev) / prev) * 100 : 0;
  const isPositive = delta > 0;
  const isGood = label === "Total Paid" ? isPositive : !isPositive;
  const TrendIcon = isPositive ? ArrowUpRight : ArrowDownRight;
  const trendColor = isGood ? T.green : T.red;

  return (
    <div className="stat-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span className="stat-lbl">{label}</span>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: `${accent}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon size={13} color={accent} strokeWidth={2} />
        </div>
      </div>
      <div className="stat-val">{currency(value)}</div>
      <div className="stat-trend">
        <TrendIcon size={13} color={trendColor} strokeWidth={2.5} />
        <span className="stat-trend-pill" style={{ color: trendColor }}>{Math.abs(delta).toFixed(1)}%</span>
        <span className="stat-trend-lbl">vs last month</span>
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const filtered = payload.filter(p => p.value > 0);
  if (!filtered.length) return null;
  return (
    <div style={{ background: T.surf, border: `1px solid ${T.bdr}`, borderRadius: 6, padding: "10px 14px", boxShadow: "0 4px 12px rgba(0,0,0,.1)", fontFamily: "'DM Sans',sans-serif" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.t3, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
      {filtered.map(p => (
        <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <div style={{ width: 6, height: 6, borderRadius: 1, background: p.fill, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: T.t2, flex: 1 }}>{p.name}</span>
          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: T.t1, fontWeight: 500 }}>{currency(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard({ kpis, prevKpis = {}, monthlyData, allNames, color, maxTotal, onPayMonth }) {
  const ctaMonth = monthlyData[0] || null;

  // Build recharts-compatible data: [{ym, month, [supplier]: amount, ...}]
  const chartData = monthlyData.map(({ ym, sups }) => ({
    month: fmtMonthShort(ym),
    ym,
    ...sups,
  }));

  // unique supplier names across all months
  const supplierNames = allNames || [];

  return (
    <div style={{ animation: "slideUp .4s cubic-bezier(.16,1,.3,1)" }}>

      {/* KPI row */}
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        {STAT_CFG.map(({ key, label, Icon, accent }) => (
          <KPICard key={key} label={label} value={kpis[key] || 0} prev={prevKpis[key] || 0} Icon={Icon} accent={accent} />
        ))}
      </div>

      {/* Pay CTA */}
      {ctaMonth && onPayMonth && (
        <div className="pay-banner" onClick={() => onPayMonth(ctaMonth.ym)}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: T.indigoTint, border: `1px solid ${T.indigoBdr}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Zap size={20} color={T.indigo} strokeWidth={2} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: T.t1, marginBottom: 2 }}>
                {fmtMonth(ctaMonth.ym)} — {Object.keys(ctaMonth.sups).length} suppliers ready to pay
              </div>
              <div style={{ fontSize: 13, color: T.t2 }}>
                Select all and confirm in one click ·{" "}
                <span style={{ fontFamily: "'DM Mono',monospace", color: T.indigo, fontWeight: 500 }}>{currency(ctaMonth.total)}</span> total
              </div>
            </div>
          </div>
          <button
            className="btn btn-primary"
            style={{ padding: "9px 18px", fontSize: 13, flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}
            onClick={e => { e.stopPropagation(); onPayMonth(ctaMonth.ym); }}
          >
            Pay All <ChevronRight size={14} strokeWidth={2.5} />
          </button>
        </div>
      )}

      {/* Chart + breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}>

        {/* Chart card */}
        <div className="card" style={{ padding: "20px 24px" }}>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: T.t1, marginBottom: 3 }}>Monthly Payment Schedule</div>
            <div style={{ fontSize: 13, color: T.t3 }}>Unpaid invoices grouped by due month</div>
          </div>

          {chartData.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: T.t3 }}>
              <div style={{ fontSize: 13 }}>No upcoming payments</div>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} barSize={32} barCategoryGap="40%">
                  <CartesianGrid strokeDasharray="3 3" stroke={T.bdr} vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fill: T.t3 }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    tick={{ fontFamily: "'DM Mono',monospace", fontSize: 10, fill: T.t3 }}
                    axisLine={false} tickLine={false}
                    tickFormatter={v => `₪${(v / 1000).toFixed(0)}k`}
                    width={42}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(99,102,241,.04)" }} />
                  {supplierNames.map((name, i) => (
                    <Bar
                      key={name}
                      dataKey={name}
                      stackId="a"
                      fill={color(name)}
                      radius={i === supplierNames.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.bdr}` }}>
                {supplierNames.map(n => (
                  <div key={n} style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: T.t2 }}>
                    <div style={{ width: 7, height: 7, borderRadius: 1, background: color(n) }} />
                    {n}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Monthly breakdown panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          {monthlyData.slice(0, 4).map(({ ym, sups, total }) => (
            <div
              key={ym}
              className="card"
              style={{ padding: "12px 16px", cursor: "pointer", transition: "border-color .12s" }}
              onClick={() => onPayMonth && onPayMonth(ym)}
              onMouseEnter={e => e.currentTarget.style.borderColor = T.indigo}
              onMouseLeave={e => e.currentTarget.style.borderColor = T.bdr}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontWeight: 600, fontSize: 13, color: T.t1 }}>{fmtMonth(ym)}</span>
                <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 500, fontSize: 13, color: T.t1 }}>{currency(total)}</span>
              </div>
              {Object.entries(sups).sort((a, b) => b[1] - a[1]).map(([sup, amt]) => (
                <div key={sup} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", borderTop: `1px solid ${T.bdr}`, fontSize: 12 }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: color(sup), flexShrink: 0 }} />
                  <span style={{ flex: 1, fontFamily: "'DM Sans',sans-serif", color: T.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sup}</span>
                  <span style={{ fontFamily: "'DM Mono',monospace", color: T.t2, fontSize: 11 }}>{currency(amt)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
