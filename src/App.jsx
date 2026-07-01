import React, {
  useState, useEffect, useCallback, useRef,
  createContext, useContext,
} from "react";
import { useAuth }        from "./contexts/AuthContext";
import { supabase }       from "./lib/supabase";
import { useInvoiceData } from "./hooks/useInvoiceData";
import { usePlan }        from "./hooks/usePlan";
import { useSyncJob }     from "./hooks/useSyncJob";
import CalendarView       from "./components/CalendarView";
import EditInvoiceModal   from "./components/EditInvoiceModal";
import AttachmentPreviewModal from "./components/AttachmentPreviewModal";
import IntegrationsPage   from "./components/IntegrationsPage";
import UsageBanner        from "./components/UsageBanner";
import AdminPage          from "./pages/AdminPage";
import { MissingSuppliersModal, AnomalyModal } from "./components/AlertModals";
import { PALETTE }        from "./constants";
import { parseCSV }      from "./utils/invoice";
import enStrings         from "./i18n/en";
import heStrings         from "./i18n/he";
import {
  LayoutDashboard, FileText, Calendar, Zap, Bell, Upload,
  TrendingUp, AlertTriangle, Clock, CheckCircle2,
  ChevronRight, ChevronLeft, ChevronDown, Filter, X, Users,
  Paperclip, Trash2, Pencil, Check, Plus, Search,
  ArrowUpRight, ArrowDownRight, ArrowUp, ArrowDown, Settings, Sun, Moon,
  Wifi, WifiOff, RefreshCw, Globe, Download, Lock,
  Building2, CreditCard, User, Eye, EyeOff, Menu,
} from "lucide-react";
import {
  ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";

const SANS = "'IBM Plex Sans', system-ui, sans-serif";
const MONO = "'IBM Plex Sans', system-ui, sans-serif";

// ── Tokens ────────────────────────────────────────────────────────────────────
const DARK = {
  bg: "#07090F", surf: "#111827", surf2: "#0E1520", surf3: "#0C1017",
  bdr: "rgba(255,255,255,0.07)", bdr2: "rgba(255,255,255,0.12)",
  t1: "#E8EFF8", t2: "#627488", t3: "#4A6278",
  indigo: "#6366F1", indigoTint: "rgba(99,102,241,0.10)", indigoBdr: "rgba(99,102,241,0.30)",
  green: "#22C55E", greenTint: "rgba(34,197,94,0.10)", greenBdr: "rgba(34,197,94,0.25)",
  red: "#EF4444", redTint: "rgba(239,68,68,0.12)", redBdr: "rgba(239,68,68,0.25)",
  amber: "#F59E0B", amberTint: "rgba(245,158,11,0.12)", amberBdr: "rgba(245,158,11,0.25)",
  isDark: true,
};
const LIGHT = {
  bg: "#F5F4F0", surf: "#FFFFFF", surf2: "#F8FAFC", surf3: "#F1F5F9",
  bdr: "#E2E8F0", bdr2: "#CBD5E1", t1: "#0F172A", t2: "#475569", t3: "#94A3B8",
  indigo: "#6366F1", indigoTint: "#EEF2FF", indigoBdr: "#C7D2FE",
  green: "#10B981", greenTint: "#ECFDF5", greenBdr: "#A7F3D0",
  red: "#EF4444", redTint: "#FEF2F2", redBdr: "#FECACA",
  amber: "#F59E0B", amberTint: "#FFFBEB", amberBdr: "#FDE68A",
  isDark: false,
};
const ThemeCtx = createContext(DARK);
const useT = () => useContext(ThemeCtx);

// ── Layout context ────────────────────────────────────────────────────────────
const LayoutCtx = createContext({ isMobile: false, isTablet: false });
const useLayout = () => useContext(LayoutCtx);

// ── Language context ───────────────────────────────────────────────────────────
const LangCtx = createContext({ lang: "he", t: k => k });
const useLang = () => useContext(LangCtx);

// Sidebar always dark
const SB = { bg: "#0C1017", bdr: "rgba(255,255,255,0.07)", t1: "#CBD6E6", t2: "rgba(255,255,255,0.35)", t3: "rgba(255,255,255,0.28)" };

// ── Data ──────────────────────────────────────────────────────────────────────


// ── Utils ─────────────────────────────────────────────────────────────────────
const fmt = (n) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);
const nextMonthYM = (ym) => { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const fmtMonth = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }); };
const fmtDate = (d) => { if (!d) return "—"; return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); };

// ── StatusBadge ───────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const T = useT();
  const MAP = {
    Unpaid:  { label: "Unpaid",  bg: T.surf3,     color: T.t2,    border: T.bdr     },
    unpaid:  { label: "Unpaid",  bg: T.surf3,     color: T.t2,    border: T.bdr     },
    Overdue: { label: "Overdue", bg: T.redTint,   color: T.red,   border: T.redBdr  },
    overdue: { label: "Overdue", bg: T.redTint,   color: T.red,   border: T.redBdr  },
    Paid:    { label: "Paid",    bg: T.greenTint, color: T.green, border: T.greenBdr},
    paid:    { label: "Paid",    bg: T.greenTint, color: T.green, border: T.greenBdr},
    Credit:  { label: "Credit",  bg: T.indigoTint,color: T.indigo,border: T.indigoBdr},
    credit:  { label: "Credit",  bg: T.indigoTint,color: T.indigo,border: T.indigoBdr},
  };
  const c = MAP[status] || MAP.Unpaid;
  return <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 10px", borderRadius: 20, fontFamily: SANS, fontSize: 11, fontWeight: 600, background: c.bg, color: c.color, whiteSpace: "nowrap" }}>{c.label}</span>;
}

// ── ChartTooltip ──────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  const T = useT();
  if (!active || !payload?.length) return null;
  const momEntry = payload.find(p => p.dataKey === "momPct");
  const barEntries = payload.filter(p => p.dataKey !== "momPct" && p.value > 0);
  if (!barEntries.length && momEntry?.value == null) return null;
  return (
    <div style={{ background: T.isDark ? "#131D2E" : T.surf2, border: `1px solid ${T.bdr2}`, borderRadius: 10, padding: "12px 16px", boxShadow: T.isDark ? "0 16px 48px rgba(0,0,0,.6)" : "0 4px 12px rgba(0,0,0,0.1)", minWidth: 152 }}>
      <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 500, color: T.t2, marginBottom: 8 }}>{label}</div>
      {barEntries.map(p => (
        <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <div style={{ width: 6, height: 6, borderRadius: 1, background: p.fill, flexShrink: 0 }} />
          <span style={{ fontFamily: SANS, fontSize: 12, color: T.t2, flex: 1 }}>{p.name}</span>
          <span style={{ fontFamily: MONO, fontSize: 12, color: T.t1, fontWeight: 500 }}>{fmt(p.value)}</span>
        </div>
      ))}
      {momEntry?.value != null && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${T.bdr}`, marginTop: 6, paddingTop: 6 }}>
          <span style={{ fontFamily: SANS, fontSize: 11, color: T.t3 }}>vs prev month</span>
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: momEntry.value >= 0 ? "#4ade80" : "#f87171" }}>
            {momEntry.value >= 0 ? "+" : ""}{momEntry.value}%
          </span>
        </div>
      )}
    </div>
  );
}

// ── Login ─────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const { isMobile } = useLayout();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("signin");
  const [metricVals, setMetricVals] = useState([0, 0, 0]);

  useEffect(() => {
    const targets = [3.2, 94, 8];
    const dur = 1400;
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min((now - start) / dur, 1);
      const e = 1 - Math.pow(1 - t, 3);
      setMetricVals([
        parseFloat((targets[0] * e).toFixed(1)),
        Math.round(targets[1] * e),
        Math.round(targets[2] * e),
      ]);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    const timeout = setTimeout(() => { raf = requestAnimationFrame(tick); }, 400);
    return () => { clearTimeout(timeout); cancelAnimationFrame(raf); };
  }, []);

  const handleGoogle = async () => { setLoading(true); await supabase.auth.signInWithOAuth({ provider: 'google' }); setLoading(false); };
  const handleEmail = async (e) => { e.preventDefault(); setLoading(true); const { error } = await supabase.auth.signInWithPassword({ email, password }); setLoading(false); if (error) alert(error.message); };
  const inp = { width: "100%", padding: "12px 16px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 7, fontFamily: SANS, fontSize: 15, color: "#F1F5F9", outline: "none" };

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {!isMobile && (
        <div style={{ width: "44%", background: "#07090F", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden", flexShrink: 0 }}>
          <style>{`
            @keyframes floatCard {
              0%   { transform: translateY(110%) rotate(var(--rot)); opacity: 0; }
              8%   { opacity: 1; }
              88%  { opacity: 1; }
              100% { transform: translateY(-20%) rotate(var(--rot)); opacity: 0; }
            }
            .login-float-card {
              position: absolute;
              animation: floatCard var(--dur) ease-in-out var(--del) infinite;
            }
            @keyframes loginFadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
            .login-fade-in { animation: loginFadeUp 0.6s cubic-bezier(.16,1,.3,1) both; }
            @keyframes metricGlow {
              0%, 100% { text-shadow: 0 0 12px rgba(99,102,241,0); }
              50% { text-shadow: 0 0 18px rgba(99,102,241,0.45); }
            }
            .login-metric-val { animation: metricGlow 3s ease-in-out infinite; }
            @keyframes loginPulse {
              0%, 100% { box-shadow: 0 0 0 0 rgba(99,102,241,0.25); }
              50% { box-shadow: 0 0 0 6px rgba(99,102,241,0); }
            }
            .login-metric-dot { animation: loginPulse 2.5s ease-in-out infinite; }
          `}</style>
          <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(99,102,241,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.06) 1px, transparent 1px)", backgroundSize: "40px 40px", pointerEvents: "none" }} />
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 70% 50% at 30% 35%, rgba(99,102,241,0.18) 0%, transparent 65%)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 50% 40% at 75% 70%, rgba(16,185,129,0.10) 0%, transparent 60%)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #07090F 0%, transparent 30%, transparent 70%, #07090F 100%)", pointerEvents: "none", zIndex: 2 }} />
          {[
            { sup: "Acme Corp",   amt: "₪28,400", status: "Paid",      sColor: "#22C55E",  sBg: "rgba(34,197,94,.12)",  init: "A", iColor: "#6366F1", left: "8%",  dur: "11s", del: "0s",    rot: "-2deg" },
            { sup: "BuildRight",  amt: "₪12,500", status: "Due in 3d", sColor: "#F59E0B",  sBg: "rgba(245,158,11,.12)", init: "B", iColor: "#10B981", left: "52%", dur: "13s", del: "2.2s",  rot: "1.5deg" },
            { sup: "TechParts",   amt: "₪22,000", status: "Overdue",   sColor: "#F87171",  sBg: "rgba(239,68,68,.12)",  init: "T", iColor: "#F59E0B", left: "26%", dur: "14s", del: "4.8s",  rot: "-1deg" },
            { sup: "MediaPro",    amt: "₪8,400",  status: "Synced ✓",  sColor: "#818CF8",  sBg: "rgba(99,102,241,.12)", init: "M", iColor: "#EF4444", left: "68%", dur: "10s", del: "1.4s",  rot: "2deg" },
            { sup: "Yes Planet",  amt: "₪18,200", status: "Paid",      sColor: "#22C55E",  sBg: "rgba(34,197,94,.12)",  init: "Y", iColor: "#10B981", left: "14%", dur: "12s", del: "6.5s",  rot: "-1.5deg" },
            { sup: "Tadiran",     amt: "₪34,600", status: "Due soon",  sColor: "#F59E0B",  sBg: "rgba(245,158,11,.12)", init: "ת", iColor: "#8B5CF6", left: "72%", dur: "15s", del: "3.6s",  rot: "1deg" },
            { sup: "HOT Mobile",  amt: "₪6,100",  status: "Paid",      sColor: "#22C55E",  sBg: "rgba(34,197,94,.12)",  init: "H", iColor: "#EF4444", left: "40%", dur: "11s", del: "8.2s",  rot: "-0.5deg" },
            { sup: "Strauss",     amt: "₪9,750",  status: "Unpaid",    sColor: "#7A8FA6",  sBg: "rgba(100,116,139,.1)", init: "ש", iColor: "#6366F1", left: "82%", dur: "13s", del: "5.1s",  rot: "2.5deg" },
            { sup: "Bezeq",       amt: "₪4,300",  status: "Paid",      sColor: "#22C55E",  sBg: "rgba(34,197,94,.12)",  init: "ב", iColor: "#10B981", left: "33%", dur: "14s", del: "9.3s",  rot: "1.5deg" },
            { sup: "Super-Pharm", amt: "₪11,200", status: "Due soon",  sColor: "#F59E0B",  sBg: "rgba(245,158,11,.12)", init: "S", iColor: "#EF4444", left: "60%", dur: "12s", del: "7.1s",  rot: "-2deg" },
          ].map((c, i) => (
            <div key={i} className="login-float-card" style={{ left: c.left, bottom: "-120px", "--dur": c.dur, "--del": c.del, "--rot": c.rot, zIndex: 1 }}>
              <div style={{ background: "rgba(17,24,39,0.85)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 10, padding: "10px 14px", backdropFilter: "blur(12px)", minWidth: 200, boxShadow: "0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: c.iColor, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontWeight: 700, fontSize: 10, color: "#fff", flexShrink: 0 }}>{c.init}</div>
                  <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 500, color: "#B8CAE0" }}>{c.sup}</span>
                </div>
                <div style={{ fontFamily: SANS, fontSize: 22, fontWeight: 600, color: "#E8EFF8", letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", marginBottom: 7 }}>{c.amt}</div>
                <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 600, color: c.sColor, background: c.sBg, padding: "2px 8px", borderRadius: 20 }}>{c.status}</span>
              </div>
            </div>
          ))}
          <div style={{ position: "relative", zIndex: 3, display: "flex", flexDirection: "column", height: "100%", padding: "40px 48px 40px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, animation: "loginFadeUp 0.6s cubic-bezier(.16,1,.3,1) 0s both" }}>
              <svg width="28" height="28" viewBox="0 0 36 36" fill="none">
                <rect width="36" height="36" rx="9" fill="rgba(99,102,241,.18)"/>
                <path d="M9 18C9 13 13 9.5 18 9.5C21 9.5 23.5 10.7 25 12.7" stroke="#A5B4FC" strokeWidth="2.2" strokeLinecap="round" fill="none"/>
                <path d="M27 18C27 23 23 26.5 18 26.5C15 26.5 12.5 25.3 11 23.3" stroke="#818CF8" strokeWidth="2.2" strokeLinecap="round" fill="none"/>
                <circle cx="18" cy="18" r="2.6" fill="#C7D2FE"/>
                <circle cx="25" cy="12.7" r="1.7" fill="#818CF8"/>
                <circle cx="11" cy="23.3" r="1.7" fill="#A5B4FC"/>
              </svg>
              <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 16, letterSpacing: "-0.02em", color: "#E8EFF8" }}>Cashflow</span>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: "clamp(38px,4vw,62px)", letterSpacing: "-0.05em", lineHeight: 1.05, color: "#E8EFF8", marginBottom: 14, animation: "loginFadeUp 0.6s cubic-bezier(.16,1,.3,1) 0.1s both" }}>
                Every invoice.<br /><span style={{ background: "linear-gradient(120deg,#6366F1,#A5B4FC)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text" }}>on time.</span>
              </div>
              <p style={{ fontFamily: SANS, fontSize: 15, lineHeight: 1.7, color: "#8299B4", maxWidth: 320, marginBottom: 28, animation: "loginFadeUp 0.6s cubic-bezier(.16,1,.3,1) 0.2s both" }}>
                Cashflow collects every invoice from Gmail, Drive, and WhatsApp automatically — so you always know what you owe, what's overdue, and what's due next.
              </p>

              {/* Impact metrics */}
              <div style={{ display: "flex", gap: 0, animation: "loginFadeUp 0.6s cubic-bezier(.16,1,.3,1) 0.28s both" }}>
                {[
                  { val: `${metricVals[0]}h`, label: "saved per week", sub: "avg. per user" },
                  { val: `${metricVals[1]}%`, label: "fewer late payments", sub: "vs. manual tracking" },
                  { val: `${metricVals[2]}s`, label: "invoice processed", sub: "upload → dashboard" },
                ].map((m, i) => (
                  <div key={i} style={{ flex: 1, padding: "14px 16px", borderLeft: i === 0 ? "1px solid rgba(255,255,255,.07)" : "none", borderRight: "1px solid rgba(255,255,255,.07)", borderTop: "1px solid rgba(255,255,255,.07)", borderBottom: "1px solid rgba(255,255,255,.07)", ...(i === 0 ? { borderRadius: "10px 0 0 10px" } : i === 2 ? { borderRadius: "0 10px 10px 0" } : {}), background: "rgba(99,102,241,0.04)" }}>
                    <div className="login-metric-val" style={{ fontFamily: SANS, fontWeight: 900, fontSize: 26, letterSpacing: "-0.04em", color: "#A5B4FC", lineHeight: 1, marginBottom: 4 }}>{m.val}</div>
                    <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 600, color: "#CBD6E6", lineHeight: 1.3 }}>{m.label}</div>
                    <div style={{ fontFamily: SANS, fontSize: 10, color: "#4A6278", marginTop: 2 }}>{m.sub}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ borderTop: "1px solid rgba(255,255,255,.06)", paddingTop: 20, animation: "loginFadeUp 0.6s cubic-bezier(.16,1,.3,1) 0.38s both" }}>
              <div style={{ fontFamily: SANS, fontSize: 10, color: "#3D5166", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>Connects with</div>
              <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
                {/* Gmail */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.75 }}>
                  <svg width="20" height="15" viewBox="0 0 20 15" fill="none"><path d="M1 0h18a1 1 0 011 1v13a1 1 0 01-1 1H1a1 1 0 01-1-1V1a1 1 0 011-1z" fill="#fff" fillOpacity=".06"/><path d="M0 1.5L10 9l10-7.5" stroke="none"/><path fill="#4285F4" d="M0 2v11h4V6.5l6 4 6-4V13h4V2L10 8.5z"/><path fill="#EA4335" d="M0 2l10 6.5L20 2H0z"/><path fill="#34A853" d="M16 13h4V6.5z"/><path fill="#FBBC05" d="M0 13h4V6.5z"/></svg>
                  <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: "#7A90A8", letterSpacing: "-0.01em" }}>Gmail</span>
                </div>
                <div style={{ width: 1, height: 18, background: "rgba(255,255,255,.08)" }} />
                {/* Google Drive */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.75 }}>
                  <svg width="20" height="18" viewBox="0 0 87.3 78"><path fill="#0066DA" d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 53H0c0 1.55.4 3.1 1.2 4.5z"/><path fill="#00AC47" d="M43.65 25L29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L1.2 48.5C.4 49.9 0 51.45 0 53h27.5z"/><path fill="#EA4335" d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H60l5.85 11.65z"/><path fill="#00832D" d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z"/><path fill="#2684FC" d="M60 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.5c1.6 0 3.15-.4 4.5-1.2z"/><path fill="#FFBA00" d="M73.4 26.5l-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 60 53h27.45c0-1.55-.4-3.1-1.2-4.5z"/></svg>
                  <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: "#7A90A8", letterSpacing: "-0.01em" }}>Drive</span>
                </div>
                <div style={{ width: 1, height: 18, background: "rgba(255,255,255,.08)" }} />
                {/* WhatsApp */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.75 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#25D366"/><path fill="#fff" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/></svg>
                  <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: "#7A90A8", letterSpacing: "-0.01em" }}>WhatsApp</span>
                </div>
                <div style={{ width: 1, height: 18, background: "rgba(255,255,255,.08)" }} />
                {/* Green Invoice */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.75 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="6" fill="#10B981"/><path d="M6 8h8M6 11.5h8M6 15h5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/><path d="M17 14l1.5 1.5 2.5-2.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: "#7A90A8", letterSpacing: "-0.01em" }}>Green Invoice</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <div style={{ flex: 1, background: isMobile ? "#07090F" : "#0C1017", display: "flex", alignItems: "center", justifyContent: "center", padding: isMobile ? "40px 24px" : "48px 40px", position: "relative" }}>
        {isMobile && <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(99,102,241,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.05) 1px, transparent 1px)", backgroundSize: "36px 36px", pointerEvents: "none" }} />}
        {isMobile && <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 50% at 50% 20%, rgba(99,102,241,0.12) 0%, transparent 60%)", pointerEvents: "none" }} />}
        <div style={{ width: "100%", maxWidth: isMobile ? "100%" : 400, position: "relative", zIndex: 1 }}>
          {isMobile && (
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 32 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: "#6366F1", display: "flex", alignItems: "center", justifyContent: "center" }}><TrendingUp size={13} color="#fff" strokeWidth={2.5} /></div>
              <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 17, color: "#F8FAFC" }}>Cashflow</span>
            </div>
          )}
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontFamily: SANS, fontWeight: 700, fontSize: isMobile ? 22 : 28, letterSpacing: "-0.03em", color: "#F1F5F9", marginBottom: 6 }}>{mode === "signin" ? "Welcome back" : "Create your account"}</h1>
            <p style={{ fontFamily: SANS, fontSize: 15, color: "#64748B", marginBottom: 16 }}>{mode === "signin" ? "Sign in to your Cashflow workspace." : "Start managing invoices in minutes."}</p>
            {/* Free tier callout */}
            <div style={{ borderRadius: 10, border: "1px solid rgba(99,102,241,0.35)", background: "rgba(99,102,241,0.08)", padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: "rgba(99,102,241,0.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#818CF8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <div>
                <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 16, color: "#E0E7FF", letterSpacing: "-0.03em", lineHeight: 1.2 }}>
                  Free up to <span style={{ color: "#A5B4FC" }}>20 invoices</span> / month
                </div>
                <div style={{ fontFamily: SANS, fontSize: 12, color: "#4A6278", marginTop: 3 }}>No credit card required · Upgrade anytime</div>
              </div>
            </div>
          </div>
          <button onClick={handleGoogle} disabled={loading} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "13px 0", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 7, cursor: loading ? "not-allowed" : "pointer", fontFamily: SANS, fontWeight: 500, fontSize: 15, color: "#F1F5F9", marginBottom: 18, opacity: loading ? 0.7 : 1 }}>
            <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/><path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/><path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/><path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/></svg>
            {loading ? "Signing in…" : "Continue with Google"}
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
            <span style={{ fontFamily: SANS, fontSize: 12, color: "#334155" }}>or email</span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
          </div>
          <form onSubmit={handleEmail} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ fontFamily: SANS, fontSize: 13, fontWeight: 500, color: "#64748B", display: "block", marginBottom: 5 }}>Email address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required style={inp} />
            </div>
            <div>
              <label style={{ fontFamily: SANS, fontSize: 13, fontWeight: 500, color: "#64748B", display: "block", marginBottom: 5 }}>Password</label>
              <div style={{ position: "relative" }}>
                <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required style={{ ...inp, paddingRight: 40 }} />
                <button type="button" onClick={() => setShowPw(v => !v)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#475569", cursor: "pointer", display: "flex", alignItems: "center" }}>
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} style={{ padding: "13px 0", background: "linear-gradient(135deg, #6366F1, #4F46E5)", border: "none", borderRadius: 7, fontFamily: SANS, fontWeight: 600, fontSize: 15, color: "#fff", cursor: loading ? "not-allowed" : "pointer", marginTop: 4, opacity: loading ? 0.7 : 1, boxShadow: "0 4px 18px rgba(99,102,241,0.4)" }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.filter = "brightness(1.1)"; }}
              onMouseLeave={e => e.currentTarget.style.filter = "none"}>
              {loading ? "Signing in…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>
          <p style={{ fontFamily: SANS, fontSize: 13, color: "#475569", textAlign: "center", marginTop: 22 }}>
            {mode === "signin" ? "Don't have an account? " : "Already have an account? "}
            <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")} style={{ background: "none", border: "none", color: "#6366F1", cursor: "pointer", fontFamily: SANS, fontSize: 13, fontWeight: 500 }}>{mode === "signin" ? "Start free" : "Sign in"}</button>
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ view, setView, suppliersCount, onUpgrade, onUpload, mobileOpen, setMobileOpen, plan, planUsed, planLimit, planPct, user, onSignOut }) {
  const { isMobile, isTablet } = useLayout();
  const { t } = useLang();
  const isDrawer = isMobile || isTablet;
  const used = planUsed ?? 0, limit = planLimit ?? 20;
  const pct = planPct != null ? Math.round(planPct * 100) : Math.round((used / limit) * 100);
  const navigate = (id) => { setView(id); if (isDrawer) setMobileOpen(false); };

  const navItem = (id, label, Icon, badge, badgeRed) => {
    const active = view === id;
    return (
      <button key={id} onClick={() => navigate(id)} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "8px 10px", borderRadius: 7, border: "none", cursor: "pointer", background: active ? "rgba(99,102,241,.10)" : "transparent", boxShadow: active ? "inset 3px 0 0 #6366F1" : "none", color: active ? "#CBD6E6" : SB.t2, fontFamily: SANS, fontSize: 13, fontWeight: active ? 600 : 400, transition: "background .12s" }}
        onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,.05)"; }}
        onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}>
        <Icon size={14} strokeWidth={1.75} color={active ? "#A5B4FC" : "#4A6278"} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1 }}>{label}</span>
        {badge !== undefined && <span style={{ background: badgeRed ? "rgba(248,113,113,.14)" : "rgba(255,255,255,.06)", color: badgeRed ? "#F87171" : "rgba(255,255,255,.3)", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 10, fontFamily: SANS }}>{badge}</span>}
      </button>
    );
  };

  const MAIN = [
    { id: "dashboard",    label: t("nav_dashboard"),    Icon: LayoutDashboard },
    { id: "invoices",     label: t("nav_invoices"),     Icon: FileText        },
    { id: "calendar",     label: t("nav_calendar"),     Icon: Calendar        },
    { id: "integrations", label: t("nav_integrations"), Icon: Zap             },
  ];

  if (isDrawer && !mobileOpen) return null;

  return (
    <>
      {isDrawer && <div onClick={() => setMobileOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 199, animation: "fadeIn 0.2s" }} />}
      <div style={{ width: 240, background: SB.bg, display: "flex", flexDirection: "column", flexShrink: 0, height: "100vh", overflowY: "auto", ...(isDrawer ? { position: "fixed", top: 0, left: 0, zIndex: 200, animation: "slideRight 0.25s ease" } : { position: "sticky", top: 0 }) }}>
        <div style={{ padding: "18px 20px 14px", display: "flex", alignItems: "center", gap: 9 }}>
          <svg width="26" height="26" viewBox="0 0 36 36" fill="none" style={{ flexShrink: 0 }}>
            <rect width="36" height="36" rx="9" fill="rgba(99,102,241,.18)"/>
            <path d="M9 18C9 13 13 9.5 18 9.5C21 9.5 23.5 10.7 25 12.7" stroke="#A5B4FC" strokeWidth="2.2" strokeLinecap="round" fill="none"/>
            <path d="M27 18C27 23 23 26.5 18 26.5C15 26.5 12.5 25.3 11 23.3" stroke="#818CF8" strokeWidth="2.2" strokeLinecap="round" fill="none"/>
            <circle cx="18" cy="18" r="2.6" fill="#C7D2FE"/>
            <circle cx="25" cy="12.7" r="1.7" fill="#818CF8"/>
            <circle cx="11" cy="23.3" r="1.7" fill="#A5B4FC"/>
          </svg>
          <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 14, letterSpacing: "-0.02em", color: "#E8EFF8", flex: 1 }}>Cashflow</span>
          {isDrawer && <button onClick={() => setMobileOpen(false)} style={{ background: "none", border: "none", color: SB.t2, cursor: "pointer", display: "flex", padding: 4 }}><X size={16} /></button>}
        </div>
        <div style={{ padding: "0 10px 14px" }}>
          <button onClick={() => { onUpload(); if (isDrawer) setMobileOpen(false); }} onMouseEnter={e => { e.currentTarget.style.background = "#7274f5"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(99,102,241,.3), 0 4px 16px rgba(99,102,241,.35)"; }} onMouseLeave={e => { e.currentTarget.style.background = "#6366F1"; e.currentTarget.style.boxShadow = "none"; }} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "9px 14px", borderRadius: 8, background: "#6366F1", border: "none", cursor: "pointer", fontFamily: SANS, fontWeight: 600, fontSize: 13, color: "#fff", letterSpacing: "-0.01em", transition: "background 0.18s, box-shadow 0.18s" }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            {t("nav_upload")}
          </button>
        </div>
        <div style={{ padding: "0 8px" }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", color: SB.t3, padding: "4px 10px 8px", textTransform: "uppercase" }}>Menu</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {MAIN.map(({ id, label, Icon }) => navItem(id, label, Icon))}
          </div>
        </div>
        <div style={{ height: 1, background: SB.bdr, margin: "8px 2px" }} />
        <div style={{ padding: "0 8px" }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", color: SB.t3, padding: "4px 10px 8px", textTransform: "uppercase" }}>Manage</div>
          {navItem("suppliers", t("nav_suppliers"), Users, suppliersCount)}
          {user?.user_metadata?.role === "admin" && navItem("admin", t("nav_admin"), Settings)}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ padding: "12px" }}>
          <div style={{ background: "rgba(99,102,241,.08)", border: "1px solid rgba(99,102,241,.18)", borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
              <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, color: "#818CF8", letterSpacing: "0.08em" }}>{(plan || "FREE").toUpperCase()} PLAN</span>
              <button onClick={onUpgrade} style={{ fontFamily: SANS, fontSize: 10, fontWeight: 500, color: "rgba(255,255,255,.3)", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>Manage</button>
            </div>
            <div style={{ fontFamily: SANS, fontSize: 11, color: "rgba(255,255,255,.35)", marginBottom: 5, display: "flex", justifyContent: "space-between" }}>
              <span>{used} of {limit} invoices</span>
              <span style={{ color: "#818CF8", fontWeight: 600 }}>{pct}%</span>
            </div>
            <div style={{ height: 3, background: "rgba(255,255,255,.07)", borderRadius: 4, overflow: "hidden" }}><div style={{ height: "100%", width: `${pct}%`, background: "#6366F1", borderRadius: 4 }} /></div>
          </div>
          <button onClick={() => navigate("settings")} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, background: "transparent", border: "none", cursor: "pointer" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,.05)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", background: "linear-gradient(135deg,#6366F1,#818CF8)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontWeight: 700, fontSize: 10, color: "#fff", flexShrink: 0 }}>{(user?.email?.[0] || "U").toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 500, color: SB.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Account"}</div>
              <div style={{ fontFamily: SANS, fontSize: 10, color: SB.t2 }}>{t("nav_settings")}</div>
            </div>
            <Settings size={12} color={SB.t2} />
          </button>
          <button onClick={onSignOut} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, background: "transparent", border: "none", cursor: "pointer", marginTop: 2 }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(239,68,68,.08)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(248,113,113,.6)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            <span style={{ fontFamily: SANS, fontSize: 12, color: "rgba(248,113,113,.6)", fontWeight: 500 }}>Sign out</span>
          </button>
        </div>
      </div>
    </>
  );
}

// ── Global header ─────────────────────────────────────────────────────────────
// ── Search Overlay ────────────────────────────────────────────────────────────
function SearchOverlay({ invoices, suppliers, onNavigate, onClose }) {
  const T = useT();
  const { t } = useLang();
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const q = query.toLowerCase().trim();
  const invResults = q
    ? invoices.filter(i =>
        i.supplier?.toLowerCase().includes(q) ||
        i.invoiceNo?.toLowerCase().includes(q) ||
        String(i.amount || "").includes(q)
      ).slice(0, 5)
    : [];
  const supResults = q
    ? (suppliers || []).filter(s => s.name?.toLowerCase().includes(q)).slice(0, 5)
    : [];
  const hasResults = invResults.length > 0 || supResults.length > 0;

  const ResultItem = ({ icon, title, sub, onClick }) => (
    <button onClick={onClick}
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
      onMouseEnter={e => e.currentTarget.style.background = T.isDark ? "rgba(255,255,255,.05)" : T.surf2}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: T.isDark ? "rgba(255,255,255,.06)" : T.surf3, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: SANS, fontSize: 13, fontWeight: 700, color: T.indigo }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: T.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        <div style={{ fontFamily: SANS, fontSize: 11, color: T.t3 }}>{sub}</div>
      </div>
    </button>
  );

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 900, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 80, animation: "fadeIn 0.15s" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, background: T.surf, border: `1px solid ${T.bdr2}`, borderRadius: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.4)", overflow: "hidden", animation: "scaleIn 0.15s cubic-bezier(.16,1,.3,1)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: `1px solid ${T.bdr}` }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.t3} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder={t("search_placeholder")} style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontFamily: SANS, fontSize: 15, color: T.t1 }} />
          <kbd onClick={onClose} style={{ fontFamily: SANS, fontSize: 11, color: T.t3, background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 4, padding: "2px 7px", cursor: "pointer" }}>Esc</kbd>
        </div>
        {!q && (
          <div style={{ padding: "20px 18px", fontFamily: SANS, fontSize: 13, color: T.t3, textAlign: "center" }}>
            {t("search_placeholder")}
          </div>
        )}
        {q && !hasResults && (
          <div style={{ padding: "20px 18px", fontFamily: SANS, fontSize: 13, color: T.t3, textAlign: "center" }}>
            {t("search_no_results")}
          </div>
        )}
        {invResults.length > 0 && (
          <div>
            <div style={{ padding: "8px 18px 4px", fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: T.t3 }}>{t("search_invoices")}</div>
            {invResults.map(inv => (
              <ResultItem key={inv.id}
                icon={inv.supplier?.charAt(0) || "?"}
                title={inv.supplier}
                sub={`${inv.invoiceNo || ""} · ${fmt(inv.amount)} · ${inv.status || ""}`}
                onClick={() => { onNavigate("invoices", (inv.dueDate || inv.invoice_date || "").slice(0, 7), inv.id); onClose(); }}
              />
            ))}
          </div>
        )}
        {supResults.length > 0 && (
          <div style={{ borderTop: invResults.length > 0 ? `1px solid ${T.bdr}` : "none" }}>
            <div style={{ padding: "8px 18px 4px", fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: T.t3 }}>{t("search_suppliers")}</div>
            {supResults.map(sup => (
              <ResultItem key={sup.id}
                icon={sup.name?.charAt(0) || "?"}
                title={sup.name}
                sub={sup.terms || ""}
                onClick={() => { onNavigate("suppliers"); onClose(); }}
              />
            ))}
          </div>
        )}
        <div style={{ padding: "8px 18px", borderTop: (hasResults || q) ? `1px solid ${T.bdr}` : "none", display: "flex", gap: 16 }}>
          <span style={{ fontFamily: SANS, fontSize: 11, color: T.t3 }}><kbd style={{ background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 3, padding: "1px 5px", fontFamily: MONO, fontSize: 10 }}>↑↓</kbd> {t("search_hint").split("·")[0].replace("↑↓","").trim()}</span>
          <span style={{ fontFamily: SANS, fontSize: 11, color: T.t3 }}><kbd style={{ background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 3, padding: "1px 5px", fontFamily: MONO, fontSize: 10 }}>↵</kbd> {t("search_hint").split("·")[1]?.trim()}</span>
          <span style={{ fontFamily: SANS, fontSize: 11, color: T.t3 }}><kbd style={{ background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 3, padding: "1px 5px", fontFamily: MONO, fontSize: 10 }}>Esc</kbd> {t("search_hint").split("·")[2]?.trim()}</span>
        </div>
      </div>
    </div>
  );
}

function GlobalHeader({ view, isDark, onToggleTheme, onToggleLang, lang, onMenuOpen, onMissingAlert, onAnomalyAlert, missingCount, anomalyCount, syncJobs, appNotifs, onClearAppNotifs, onSearchOpen }) {
  const T = useT();
  const { isMobile, isTablet } = useLayout();
  const { t } = useLang();
  const [notifOpen, setNotifOpen] = useState(false);
  const bellRef = useRef(null);
  const TITLES = { dashboard: t("nav_dashboard"), invoices: t("nav_invoices"), calendar: t("nav_calendar"), integrations: t("nav_integrations"), suppliers: t("nav_suppliers"), settings: t("nav_settings"), admin: t("nav_admin") };
  const headerBg = T.isDark ? "#0C1017" : T.surf;
  const ghostBtn = { width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: `1px solid ${T.isDark ? "rgba(255,255,255,.10)" : T.bdr}`, borderRadius: 8, cursor: "pointer", color: T.isDark ? "rgba(255,255,255,.4)" : T.t2, flexShrink: 0 };
  const totalAlerts = (missingCount || 0) + (anomalyCount || 0);
  const recentAppNotifs = (appNotifs || []).slice(0, 5);
  const totalCount = totalAlerts + recentAppNotifs.length;

  useEffect(() => {
    if (!notifOpen) return;
    const handler = (e) => { if (bellRef.current && !bellRef.current.contains(e.target)) setNotifOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [notifOpen]);

  return (
    <div style={{ height: 52, background: headerBg, borderBottom: `1px solid ${T.bdr}`, display: "flex", alignItems: "center", paddingLeft: isMobile ? 14 : 24, paddingRight: isMobile ? 12 : 24, gap: 10, flexShrink: 0 }}>
      {(isMobile || isTablet) && <button onClick={onMenuOpen} style={{ ...ghostBtn, border: "none" }}><Menu size={18} /></button>}
      <span style={{ fontFamily: SANS, fontWeight: 500, fontSize: isMobile ? 14 : 15, letterSpacing: "-0.015em", color: T.isDark ? "#E8EFF8" : T.t1 }}>{TITLES[view] || ""}</span>
      <div style={{ flex: 1 }} />
      {!isMobile && (
        <div onClick={onSearchOpen} style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 12px", background: T.isDark ? "rgba(255,255,255,.04)" : T.surf2, border: `1px solid ${T.isDark ? "rgba(255,255,255,.08)" : T.bdr}`, borderRadius: 8, height: 34, cursor: "pointer", minWidth: 180 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.isDark ? "rgba(255,255,255,.25)" : T.t3} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <span style={{ fontFamily: SANS, fontSize: 13, color: T.isDark ? "rgba(255,255,255,.25)" : T.t3, flex: 1 }}>{t("search_placeholder")}</span>
          <kbd style={{ fontFamily: SANS, fontSize: 10, color: T.isDark ? "rgba(255,255,255,.2)" : T.t3, background: T.isDark ? "rgba(255,255,255,.06)" : T.surf3, border: `1px solid ${T.isDark ? "rgba(255,255,255,.09)" : T.bdr}`, borderRadius: 4, padding: "2px 6px" }}>⌘K</kbd>
        </div>
      )}
      <button onClick={onToggleTheme} style={ghostBtn}>{isDark ? <Sun size={14} /> : <Moon size={14} />}</button>
      <button onClick={onToggleLang} title={lang === "he" ? "Switch to English" : "עברית"} style={{ ...ghostBtn, fontFamily: SANS, fontSize: 11, fontWeight: 700, letterSpacing: "-0.02em", color: T.isDark ? "rgba(255,255,255,.5)" : T.t2 }}>{lang === "he" ? "EN" : "עב"}</button>

      {/* Bell with notification dropdown */}
      <div ref={bellRef} style={{ position: "relative" }}>
        <button onClick={() => setNotifOpen(v => !v)} style={{ position: "relative", ...ghostBtn, background: notifOpen ? (T.isDark ? "rgba(255,255,255,.06)" : T.surf2) : "transparent" }}>
          <Bell size={14} />
          {totalCount > 0 && (
            <span style={{ position: "absolute", top: 6, right: 6, minWidth: 14, height: 14, background: "#EF4444", borderRadius: 7, border: `1.5px solid ${headerBg}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontSize: 8, fontWeight: 700, color: "#fff", padding: "0 3px" }}>
              {totalCount > 9 ? "9+" : totalCount}
            </span>
          )}
        </button>

        {notifOpen && (
          <div style={{ position: "absolute", top: 42, right: 0, width: 300, background: T.surf, border: `1px solid ${T.bdr2}`, borderRadius: 10, boxShadow: T.isDark ? "0 8px 32px rgba(0,0,0,0.6)" : "0 8px 32px rgba(0,0,0,0.12)", zIndex: 9999, overflow: "hidden", animation: "scaleIn 0.15s cubic-bezier(.16,1,.3,1)" }}>
            <div style={{ padding: "10px 14px 8px", borderBottom: `1px solid ${T.bdr}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: T.t1, letterSpacing: "-0.01em" }}>{t("notif_title")}</span>
              {recentAppNotifs.length > 0 && <button onClick={() => { onClearAppNotifs?.(); }} style={{ fontFamily: SANS, fontSize: 11, color: T.t3, background: "none", border: "none", cursor: "pointer", padding: 0 }}>{t("notif_clear")}</button>}
              {totalCount === 0 && <span style={{ fontFamily: SANS, fontSize: 11, color: T.t3 }}>{t("notif_all_clear")}</span>}
            </div>

            {totalCount === 0 && (
              <div style={{ padding: "20px 14px", textAlign: "center", fontFamily: SANS, fontSize: 13, color: T.t3 }}>
                {t("notif_empty")}
              </div>
            )}

            {missingCount > 0 && (
              <button onClick={() => { setNotifOpen(false); onMissingAlert?.(); }}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "transparent", border: "none", borderBottom: `1px solid ${T.bdr}`, cursor: "pointer", textAlign: "left" }}
                onMouseEnter={e => e.currentTarget.style.background = T.isDark ? "rgba(255,255,255,.04)" : T.surf2}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: T.amberTint, border: `1px solid ${T.amberBdr}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <AlertTriangle size={14} color={T.amber} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: T.t1 }}>{t("notif_missing")}</div>
                  <div style={{ fontFamily: SANS, fontSize: 11, color: T.t3, marginTop: 1 }}>{missingCount !== 1 ? t("notif_missing_sub_plural", { n: missingCount }) : t("notif_missing_sub", { n: missingCount })}</div>
                </div>
                <ChevronRight size={13} color={T.t3} />
              </button>
            )}

            {anomalyCount > 0 && (
              <button onClick={() => { setNotifOpen(false); onAnomalyAlert?.(); }}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "transparent", border: "none", borderBottom: recentAppNotifs.length > 0 ? `1px solid ${T.bdr}` : "none", cursor: "pointer", textAlign: "left" }}
                onMouseEnter={e => e.currentTarget.style.background = T.isDark ? "rgba(255,255,255,.04)" : T.surf2}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: T.indigoTint, border: `1px solid ${T.indigoBdr}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <TrendingUp size={14} color={T.indigo} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: T.t1 }}>{t("notif_anomaly")}</div>
                  <div style={{ fontFamily: SANS, fontSize: 11, color: T.t3, marginTop: 1 }}>{anomalyCount !== 1 ? t("notif_anomaly_sub_plural", { n: anomalyCount }) : t("notif_anomaly_sub", { n: anomalyCount })}</div>
                </div>
                <ChevronRight size={13} color={T.t3} />
              </button>
            )}

            <div style={{ borderTop: (missingCount > 0 || anomalyCount > 0) ? `1px solid ${T.bdr}` : "none" }}>
              <div style={{ padding: "8px 14px 4px", fontFamily: SANS, fontSize: 10, fontWeight: 700, color: T.t3, textTransform: "uppercase", letterSpacing: "0.08em" }}>Recent Activity</div>
              {recentAppNotifs.length === 0 && (
                <div style={{ padding: "10px 14px 14px", fontFamily: SANS, fontSize: 12, color: T.t3 }}>No activity yet — upload invoices or sync integrations.</div>
              )}
              {recentAppNotifs.map((n, i) => {
                  const isError = n.type === "error";
                  const isUpload = n.type === "upload";
                  const iconBg = isError ? T.redTint : isUpload ? "rgba(99,102,241,.10)" : "rgba(16,185,129,.10)";
                  const iconBdr = isError ? T.redBdr : isUpload ? T.indigoBdr : "rgba(16,185,129,.25)";
                  const iconColor = isError ? T.red : isUpload ? T.indigo : "#10B981";
                  const relTime = (() => {
                    const diff = Math.floor((Date.now() - n.ts) / 1000);
                    if (diff < 60) return `${diff}s ago`;
                    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
                    return `${Math.floor(diff / 3600)}h ago`;
                  })();
                  return (
                    <div key={n.id || i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", borderBottom: i < recentAppNotifs.length - 1 ? `1px solid ${T.bdr}` : "none" }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: iconBg, border: `1px solid ${iconBdr}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 13 }}>
                        {isError ? <AlertTriangle size={13} color={iconColor} /> : isUpload ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> : <RefreshCw size={13} color={iconColor} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: SANS, fontSize: 12, color: T.t1, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.text}</div>
                        {n.ts && <div style={{ fontFamily: SANS, fontSize: 11, color: T.t3, marginTop: 2 }}>{relTime}</div>}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KPICard({ label, value, valueColor, iconBg, iconColor, iconPath, pill, context, delay, onClick }) {
  const T = useT();
  const { isMobile } = useLayout();
  const pad = isMobile ? "14px 14px" : "20px";
  const numSize = isMobile ? 22 : 30;
  const gap = isMobile ? 10 : 14;
  return (
    <div onClick={onClick}
      onMouseEnter={onClick ? e => { e.currentTarget.style.borderColor = "#6366f1"; e.currentTarget.style.boxShadow = "0 0 0 1px rgba(99,102,241,.2)"; } : undefined}
      onMouseLeave={onClick ? e => { e.currentTarget.style.borderColor = T.bdr; e.currentTarget.style.boxShadow = "none"; } : undefined}
      style={{ background: T.surf, border: `1px solid ${T.bdr}`, borderRadius: 12, padding: pad, display: "flex", flexDirection: "column", gap, animation: "kpiIn 0.38s ease forwards", animationDelay: `${delay}s`, opacity: 0, minWidth: 0, cursor: onClick ? "pointer" : "default", transition: "border-color 0.18s, box-shadow 0.18s" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 600, color: T.t2, letterSpacing: "0.07em", textTransform: "uppercase" }}>{label}</span>
        <div style={{ width: isMobile ? 26 : 32, height: isMobile ? 26 : 32, background: iconBg, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{iconPath}</svg>
        </div>
      </div>
      <div style={{ fontFamily: SANS, fontSize: numSize, fontWeight: 600, color: valueColor || T.t1, letterSpacing: "-0.04em", lineHeight: 1, fontVariantNumeric: "tabular-nums", wordBreak: "break-all" }}>
        {fmt(value)}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
        {pill}
        {!isMobile && <span style={{ fontFamily: SANS, fontSize: 11, color: T.t3 }}>{context}</span>}
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
const GreenPill = ({ children }) => <span style={{ display: "flex", alignItems: "center", gap: 3, color: "#22C55E", fontSize: 12, fontWeight: 600, background: "rgba(34,197,94,.1)", padding: "3px 8px", borderRadius: 20, fontFamily: "'IBM Plex Sans', sans-serif" }}>{children}</span>;
const RedPill = ({ children }) => <span style={{ color: "#F87171", fontSize: 12, fontWeight: 600, background: "rgba(239,68,68,.1)", padding: "3px 8px", borderRadius: 20, fontFamily: "'IBM Plex Sans', sans-serif" }}>{children}</span>;
const AmberPill = ({ children }) => <span style={{ color: "#F59E0B", fontSize: 12, fontWeight: 600, background: "rgba(245,158,11,.1)", padding: "3px 8px", borderRadius: 20, fontFamily: "'IBM Plex Sans', sans-serif" }}>{children}</span>;

function Dashboard({ invoices, onPayAllJuly, chartData, supplierNames, supplierColor, user, onMissingAlert, onAnomalyAlert, missingSuppliers, anomalyMap, onViewMonth, onNavigateFiltered }) {
  const T = useT();
  const { t } = useLang();
  const { isMobile, isTablet } = useLayout();
  const now = new Date();
  const nextYM = `${now.getFullYear()}-${String(now.getMonth() + 2).padStart(2, "0")}`;
  const nextLabel = new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const isUnpaid = i => i.status !== "Paid" && i.status !== "paid";
  const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const currentMonthLabel = `${MONTHS_SHORT[now.getMonth()]} '${String(now.getFullYear()).slice(2)}`;
  const currentMonthInvoices = invoices.filter(i => (i.invoice_date || i.invoiceDate || i.dueDate || "").startsWith(currentYM) && i.status !== "Paid" && i.status !== "paid");
  const currentMonthTotal = currentMonthInvoices.reduce((s, i) => s + Number(i.amount || 0), 0);
  const currentMonthSuppliers = [...new Set(currentMonthInvoices.map(i => i.supplier))].length;
  const hour = now.getHours();
  const greeting = hour < 12 ? t("greeting_morning") : hour < 17 ? t("greeting_afternoon") : hour < 21 ? t("greeting_evening") : t("greeting_night");
  const firstName = user?.user_metadata?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "";
  const kpis = {
    outstanding: invoices.filter(isUnpaid).reduce((s, i) => s + Number(i.amount), 0),
    overdue:     invoices.filter(i => i.status === "Overdue" || i.status === "overdue").reduce((s, i) => s + Number(i.amount), 0),
    nextMonth:   invoices.filter(i => isUnpaid(i) && i.dueDate?.startsWith(nextYM)).reduce((s, i) => s + Number(i.amount), 0),
    paid:        invoices.filter(i => i.status === "Paid" || i.status === "paid").reduce((s, i) => s + Number(i.amount), 0),
  };
  const overdueCount = invoices.filter(i => i.status === "Overdue" || i.status === "overdue").length;
  const nextMonthCount = invoices.filter(i => isUnpaid(i) && i.dueDate?.startsWith(nextYM)).length;

  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevYM = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
  const prevOutstanding = invoices.filter(i => isUnpaid(i) && (i.dueDate || "").startsWith(prevYM)).reduce((s, i) => s + Number(i.amount), 0);
  const currOutstanding = invoices.filter(i => isUnpaid(i) && (i.dueDate || "").startsWith(currentYM)).reduce((s, i) => s + Number(i.amount), 0);
  const prevPaid = invoices.filter(i => (i.status === "Paid" || i.status === "paid") && (i.invoice_date || i.invoiceDate || "").startsWith(prevYM)).reduce((s, i) => s + Number(i.amount), 0);
  const currPaid = invoices.filter(i => (i.status === "Paid" || i.status === "paid") && (i.invoice_date || i.invoiceDate || "").startsWith(currentYM)).reduce((s, i) => s + Number(i.amount), 0);
  const outstandingDelta = prevOutstanding > 0 ? Math.round((currOutstanding - prevOutstanding) / prevOutstanding * 100) : null;
  const paidDelta = prevPaid > 0 ? Math.round((currPaid - prevPaid) / prevPaid * 100) : null;
  const DeltaPill = ({ delta }) => delta === null
    ? <span style={{ fontFamily: SANS, fontSize: 12, color: T.t3 }}>—</span>
    : delta >= 0
      ? <GreenPill><ArrowUp size={10} />+{delta}%</GreenPill>
      : <RedPill><ArrowDown size={10} />{delta}%</RedPill>;

  const CARDS = [
    {
      label: t("kpi_outstanding"), value: kpis.outstanding, delay: 0,
      iconBg: "rgba(99,102,241,.13)", iconColor: "#818CF8",
      iconPath: <><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></>,
      pill: <DeltaPill delta={outstandingDelta} />, context: t("dash_vs_last"),
      onClick: () => onNavigateFiltered?.("Unpaid"),
    },
    {
      label: t("kpi_overdue"), value: kpis.overdue, valueColor: "#F87171", delay: 0.06,
      iconBg: "rgba(239,68,68,.12)", iconColor: "#F87171",
      iconPath: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
      pill: <RedPill>{overdueCount} {t("kpi_invoices")}</RedPill>, context: t("kpi_need_action"),
      onClick: () => onNavigateFiltered?.("Overdue"),
    },
    {
      label: t("kpi_next_month"), value: kpis.nextMonth, delay: 0.12,
      iconBg: "rgba(245,158,11,.12)", iconColor: "#F59E0B",
      iconPath: <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
      pill: <AmberPill>{nextLabel}</AmberPill>, context: `· ${nextMonthCount} invoices`,
    },
    {
      label: t("kpi_total_paid"), value: kpis.paid, delay: 0.18,
      iconBg: "rgba(34,197,94,.12)", iconColor: "#22C55E",
      iconPath: <><polyline points="20 6 9 17 4 12"/></>,
      pill: <DeltaPill delta={paidDelta} />, context: t("dash_vs_last"),
      onClick: () => onNavigateFiltered?.("Paid"),
    },
  ];

  const isCompact = isMobile || isTablet;
  const kpiCols = isMobile ? "1fr 1fr" : isTablet ? "1fr 1fr" : "repeat(4,1fr)";
  const [chartRange, setChartRange] = React.useState("monthly");
  const [focusedMonth, setFocusedMonth] = React.useState(null);
  const chartSuppliers = supplierNames || [];
  const resolvedChartData = chartData && chartData.length > 0 ? chartData : [];
  const getColor = supplierColor || (() => "#6366F1");
  const focusedIdx = focusedMonth ? resolvedChartData.findIndex(m => m.month === focusedMonth) : -1;

  return (
    <div style={{ animation: "slideUp 0.35s cubic-bezier(.16,1,.3,1)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: isMobile ? 14 : 20 }}>
        <div>
          <h1 style={{ fontFamily: SANS, fontSize: isMobile ? 17 : 22, fontWeight: 700, letterSpacing: "-0.04em", color: T.t1, margin: "0 0 3px", lineHeight: 1 }}>{greeting}{firstName ? `, ${firstName}` : ""} 👋</h1>
          {!isMobile && <p style={{ fontFamily: SANS, fontSize: 13, color: T.t2, margin: 0 }}>{now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} · Here's where you stand today</p>}
        </div>
        <div style={{ flex: 1 }} />
        {!isMobile && <div style={{ background: T.isDark ? "rgba(255,255,255,.04)" : T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 8, padding: "7px 14px", fontFamily: SANS, fontSize: 12, fontWeight: 500, color: T.t2 }}>{now.toLocaleDateString("en-US", { month: "short", year: "numeric" })}</div>}
      </div>

      {((missingSuppliers?.length > 0) || (anomalyMap?.size > 0)) && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10, marginBottom: 14 }}>
          {missingSuppliers?.length > 0 && (
            <div onClick={onMissingAlert} style={{ background: T.amberTint, border: `1px solid ${T.amberBdr}`, borderRadius: 10, padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}
              onMouseEnter={e => e.currentTarget.style.opacity = "0.85"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(245,158,11,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 15, color: T.amber, letterSpacing: "-0.02em" }}>{t("dash_missing_title", { n: missingSuppliers.length })}</div>
                <div style={{ fontFamily: SANS, fontSize: 12, color: T.t2, marginTop: 2 }}>{t("dash_missing_sub")}</div>
              </div>
              <span style={{ fontFamily: SANS, fontSize: 12, color: T.amber, fontWeight: 500, flexShrink: 0 }}>{t("dash_details")}</span>
            </div>
          )}
          {anomalyMap?.size > 0 && (
            <div onClick={onAnomalyAlert} style={{ background: T.isDark ? "rgba(99,102,241,0.08)" : T.indigoTint, border: `1px solid ${T.indigoBdr}`, borderRadius: 10, padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}
              onMouseEnter={e => e.currentTarget.style.opacity = "0.85"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(99,102,241,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.isDark ? "#818CF8" : T.indigo} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 15, color: T.isDark ? "#A5B4FC" : T.indigo, letterSpacing: "-0.02em" }}>{t("dash_anomaly_title", { n: anomalyMap.size })}</div>
                <div style={{ fontFamily: SANS, fontSize: 12, color: T.t2, marginTop: 2 }}>{t("dash_anomaly_sub")}</div>
              </div>
              <span style={{ fontFamily: SANS, fontSize: 12, color: T.isDark ? "#818CF8" : T.indigo, fontWeight: 500, flexShrink: 0 }}>{t("dash_details")}</span>
            </div>
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: kpiCols, gap: 12, marginBottom: 16 }}>
        {CARDS.map(c => <KPICard key={c.label} {...c} />)}
      </div>

      <div style={{ background: T.surf, border: `1px solid ${T.isDark ? "rgba(99,102,241,.30)" : T.indigoBdr}`, borderRadius: 12, padding: isMobile ? "14px 16px" : "20px 24px", display: "flex", alignItems: isMobile ? "flex-start" : "center", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: 11, background: T.isDark ? "rgba(99,102,241,.14)" : T.indigoTint, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.isDark ? "#818CF8" : T.indigo} strokeWidth="1.75" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          </div>
          <div>
            <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 15, color: T.t1, letterSpacing: "-0.02em", marginBottom: 4 }}>
              {currentMonthTotal > 0 ? t("dash_pay_ready", { month: currentMonthLabel }) : t("dash_nothing_due", { month: currentMonthLabel })}
            </div>
            <div style={{ fontFamily: SANS, fontSize: 13, color: T.t2 }}>{currentMonthSuppliers !== 1 ? t("dash_suppliers_plural", { n: currentMonthSuppliers }) : t("dash_suppliers", { n: currentMonthSuppliers })} · <span style={{ color: T.isDark ? "#A5B4FC" : T.indigo, fontWeight: 500, fontFamily: MONO }}>{fmt(currentMonthTotal)}</span> {t("dash_total_due")}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0, alignSelf: isMobile ? "stretch" : "auto" }}>
          <button onClick={() => onViewMonth?.()} style={{ padding: "8px 16px", border: `1px solid ${T.bdr2}`, borderRadius: 8, background: T.isDark ? "rgba(255,255,255,.04)" : "transparent", fontFamily: SANS, fontSize: 13, fontWeight: 500, color: T.t2, cursor: "pointer" }}>{t("dash_view_invoices")}</button>
          <button onClick={onPayAllJuly} style={{ background: T.indigo, border: "none", borderRadius: 8, padding: "8px 20px", fontFamily: SANS, fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, boxShadow: "0 4px 18px rgba(99,102,241,.35)", letterSpacing: "-0.01em", flex: isMobile ? 1 : "none", justifyContent: "center" }}>
            {t("dash_pay_all")} <ChevronRight size={12} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      <div style={{ background: T.surf, border: `1px solid ${T.bdr}`, borderRadius: 12, padding: "22px 24px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 14, color: T.isDark ? "#CBD6E6" : T.t1, letterSpacing: "-0.02em" }}>{t("dash_payment_schedule")}</div>
              <div style={{ fontFamily: SANS, fontSize: 12, color: T.t2, marginTop: 3 }}>{t("dash_upcoming")}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {chartRange === "monthly" && (
                <div style={{ display: "flex", alignItems: "center", gap: 2, background: T.isDark ? "rgba(255,255,255,.04)" : T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 8, padding: "2px 4px" }}>
                  <button onClick={() => { if (focusedMonth && focusedIdx > 0) setFocusedMonth(resolvedChartData[focusedIdx - 1].month); else if (!focusedMonth && resolvedChartData.length > 0) setFocusedMonth(resolvedChartData[0].month); }} disabled={focusedMonth ? focusedIdx <= 0 : false} style={{ padding: "3px 7px", borderRadius: 5, border: "none", background: "transparent", fontFamily: SANS, fontSize: 13, fontWeight: 600, color: (focusedMonth && focusedIdx <= 0) ? T.t3 : T.t2, cursor: "pointer" }}>‹</button>
                  <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 600, color: T.t1, padding: "0 4px", minWidth: 60, textAlign: "center" }}>{focusedMonth || "All months"}</span>
                  <button onClick={() => { if (focusedMonth && focusedIdx < resolvedChartData.length - 1) setFocusedMonth(resolvedChartData[focusedIdx + 1].month); else if (!focusedMonth && resolvedChartData.length > 0) setFocusedMonth(resolvedChartData[resolvedChartData.length - 1].month); }} disabled={focusedMonth ? focusedIdx >= resolvedChartData.length - 1 : false} style={{ padding: "3px 7px", borderRadius: 5, border: "none", background: "transparent", fontFamily: SANS, fontSize: 13, fontWeight: 600, color: (focusedMonth && focusedIdx >= resolvedChartData.length - 1) ? T.t3 : T.t2, cursor: "pointer" }}>›</button>
                  {focusedMonth && <button onClick={() => setFocusedMonth(null)} style={{ padding: "3px 8px", borderRadius: 5, border: "none", background: "transparent", fontFamily: SANS, fontSize: 10, fontWeight: 600, color: T.t3, cursor: "pointer", marginLeft: 2 }}>All</button>}
                </div>
              )}
              <div style={{ display: "flex", gap: 4, background: T.isDark ? "rgba(255,255,255,.04)" : T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 8, padding: 3 }}>
                {[{ key: "monthly", label: "Monthly" }, { key: "quarterly", label: "Quarterly" }, { key: "yearly", label: "Yearly" }].map(opt => (
                  <button key={opt.key} onClick={() => { setChartRange(opt.key); setFocusedMonth(null); }} style={{ padding: "4px 12px", borderRadius: 6, border: "none", background: chartRange === opt.key ? (T.isDark ? "rgba(99,102,241,.25)" : T.indigoTint) : "transparent", fontFamily: SANS, fontSize: 11, fontWeight: 600, color: chartRange === opt.key ? (T.isDark ? "#A5B4FC" : T.indigo) : T.t2, cursor: "pointer" }}>{opt.label}</button>
                ))}
              </div>
            </div>
          </div>
          {(() => {
            const now2 = new Date();
            const currentMonthKey = `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][now2.getMonth()]} '${String(now2.getFullYear()).slice(2)}`;

            // Build display data per chart range
            let displayData;
            let barSize;
            if (chartRange === "monthly") {
              const base = focusedMonth
                ? resolvedChartData.filter(m => m.month === focusedMonth)
                : resolvedChartData.slice(-12);
              // Add MoM % to each point
              displayData = base.map((m, i, arr) => {
                const prev = arr[i - 1];
                const momPct = prev && prev.total > 0 ? Math.round((m.total - prev.total) / prev.total * 100) : null;
                return { ...m, momPct };
              });
              barSize = focusedMonth ? (isMobile ? 44 : 70) : (isMobile ? 20 : 28);
            } else if (chartRange === "quarterly") {
              const qMap = {};
              resolvedChartData.forEach(m => {
                const [mon, yr] = m.month.split(" '");
                const monIdx = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].indexOf(mon);
                const q = Math.floor(monIdx / 3) + 1;
                const key = `Q${q} '${yr}`;
                if (!qMap[key]) qMap[key] = { month: key, total: 0 };
                chartSuppliers.forEach(s => {
                  qMap[key][s] = (qMap[key][s] || 0) + (m[s] || 0);
                  qMap[key].total += (m[s] || 0);
                });
              });
              const qArr = Object.values(qMap);
              displayData = qArr.slice(-4).map((m, i, arr) => {
                const prev = arr[i - 1];
                const momPct = prev && prev.total > 0 ? Math.round((m.total - prev.total) / prev.total * 100) : null;
                return { ...m, momPct };
              });
              barSize = isMobile ? 34 : 50;
            } else {
              // yearly
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
              const yArr = Object.values(yMap);
              displayData = yArr.map((m, i, arr) => {
                const prev = arr[i - 1];
                const momPct = prev && prev.total > 0 ? Math.round((m.total - prev.total) / prev.total * 100) : null;
                return { ...m, momPct };
              });
              barSize = isMobile ? 44 : 60;
            }

            const hasMom = displayData.length > 1;
            return (
          <ResponsiveContainer width="100%" height={isMobile ? 180 : 260}>
            <ComposedChart data={displayData} barSize={barSize} barCategoryGap="28%" onClick={(data) => { if (data?.activeLabel && chartRange === "monthly") { setFocusedMonth(data.activeLabel); } }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.bdr} vertical={false} />
              <XAxis dataKey="month" tick={{ fontFamily: SANS, fontSize: isMobile ? 10 : 11, fill: T.t3 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left" tick={{ fontFamily: SANS, fontSize: 10, fill: T.t3 }} axisLine={false} tickLine={false} tickFormatter={v => `₪${(v / 1000).toFixed(0)}k`} width={isMobile ? 32 : 38} />
              {hasMom && <YAxis yAxisId="right" orientation="right" tick={{ fontFamily: SANS, fontSize: 10, fill: T.t3 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} width={isMobile ? 28 : 34} />}
              <Tooltip content={<ChartTooltip />} cursor={{ fill: T.indigoTint }} animationDuration={200} />
              {chartSuppliers.map((name, i) => (
                <Bar yAxisId="left" key={name} dataKey={name} stackId="a" fill={getColor(name)} radius={i === chartSuppliers.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]} animationDuration={600} animationEasing="ease-out" />
              ))}
              {hasMom && displayData.length >= 3 && <Line yAxisId="right" type="monotone" dataKey="momPct" stroke="#818CF8" strokeWidth={1.5} strokeDasharray="4 3" strokeOpacity={0.85} dot={{ r: 2.5, fill: "transparent", stroke: "#818CF8", strokeWidth: 1.5 }} activeDot={{ r: 4, fill: "#818CF8" }} label={false} connectNulls={false} animationDuration={600} />}
            </ComposedChart>
          </ResponsiveContainer>
            );
          })()}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: 16, paddingTop: 14, borderTop: `1px solid ${T.isDark ? "rgba(255,255,255,.06)" : T.bdr}` }}>
            {chartSuppliers.map(n => (
              <div key={n} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: getColor(n), flexShrink: 0 }} />
                <span style={{ fontFamily: SANS, fontSize: 11, color: T.t2, maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n}</span>
              </div>
            ))}
          </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)", gap: 10 }}>
        {resolvedChartData.slice(-4).map(m => (
          <div key={m.month} onClick={() => onViewMonth?.(m.month)}
            style={{ background: T.surf, border: `1px solid ${T.bdr}`, borderRadius: 12, padding: "12px 14px", cursor: "pointer", transition: "border-color 0.18s" }}
            onMouseEnter={e => e.currentTarget.style.borderColor = T.isDark ? "rgba(255,255,255,.12)" : T.indigo}
            onMouseLeave={e => e.currentTarget.style.borderColor = T.bdr}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 13, color: T.isDark ? "#CBD6E6" : T.t1, letterSpacing: "-0.02em" }}>{m.month}</span>
              <span style={{ fontFamily: MONO, fontWeight: 600, fontSize: 13, color: T.isDark ? "#CBD6E6" : T.t1, fontVariantNumeric: "tabular-nums" }}>{fmt(m.total)}</span>
            </div>
            {!isMobile && Object.entries(m).filter(([k]) => k !== "month" && k !== "total" && k !== "_year" && k !== "_mon" && m[k] > 0)
              .sort((a, b) => b[1] - a[1]).slice(0, 3)
              .map(([sup, amt]) => (
                <div key={sup} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
                  <div style={{ width: 16, height: 16, borderRadius: "50%", background: getColor(sup), display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontSize: 7, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{sup.charAt(0)}</div>
                  <span style={{ flex: 1, fontFamily: SANS, fontSize: 11, color: T.isDark ? "#7A8FA6" : T.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sup}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: T.isDark ? "#9AAFCA" : T.t1, fontVariantNumeric: "tabular-nums" }}>{fmt(amt)}</span>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Invoices ──────────────────────────────────────────────────────────────────
const SOURCE_LABELS = { google_drive: { icon: "📁", label: "Drive" }, gmail: { icon: "✉️", label: "Gmail" }, whatsapp: { icon: "💬", label: "WA" }, green_invoice: { icon: "🧾", label: "GI" } };

function SupplierGroup({ supplier, invoices, selectedIds, onToggleSelect, onToggleAll, onMarkPaid, onPayGroup, onEditInvoice, onViewAttachment, anomalyMap, color }) {
  const T = useT();
  const { isMobile } = useLayout();
  const [hov, setHov] = useState(false);
  const c = color || T.indigo;
  const unpaidIds = invoices.filter(i => i.status !== "Paid" && i.status !== "paid").map(i => i.id);
  const allIds = invoices.map(i => i.id);
  const allSel = allIds.length > 0 && allIds.every(id => selectedIds.has(id));
  const someSel = !allSel && allIds.some(id => selectedIds.has(id));
  const total = invoices.reduce((s, i) => s + i.amount, 0);
  const checkRef = useRef(null);
  const supplierAnomaly = anomalyMap?.get(supplier);
  useEffect(() => { if (checkRef.current) checkRef.current.indeterminate = someSel; }, [someSel]);

  return (
    <div style={{ background: T.surf, border: `1px solid ${supplierAnomaly ? T.amberBdr : T.bdr}`, borderRadius: 10, marginBottom: 10, overflow: "hidden" }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: `1px solid ${T.bdr}`, background: supplierAnomaly ? T.amberTint : "transparent" }}>
        <input type="checkbox" ref={checkRef} checked={allSel} onChange={() => onToggleAll(allIds)} style={{ accentColor: T.indigo, cursor: "pointer", width: 14, height: 14, flexShrink: 0 }} />
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: c, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontWeight: 700, fontSize: 12, color: "#fff", flexShrink: 0 }}>{supplier.charAt(0)}</div>
        <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 13, color: T.t1, flex: 1 }}>{supplier}</span>
        {supplierAnomaly && (
          <span title={`Monthly total is ${supplierAnomaly.deviationPct}% ${supplierAnomaly.direction} than baseline`} style={{ display: "flex", alignItems: "center", gap: 3, padding: "2px 7px", background: T.amberTint, border: `1px solid ${T.amberBdr}`, borderRadius: 4, color: T.amber, fontFamily: SANS, fontSize: 10, fontWeight: 700, cursor: "help" }}>
            <AlertTriangle size={9} />{supplierAnomaly.direction === "higher" ? "↑" : "↓"}{supplierAnomaly.deviationPct}%
          </span>
        )}
        {hov && unpaidIds.length > 0 && !isMobile && (
          <button onClick={e => { e.stopPropagation(); onPayGroup(unpaidIds); }} style={{ padding: "4px 10px", borderRadius: 4, background: T.indigo, border: "none", cursor: "pointer", fontFamily: SANS, fontWeight: 600, fontSize: 12, color: "#fff", display: "flex", alignItems: "center", gap: 4, animation: "fadeIn 0.15s" }}>
            <Zap size={11} />Pay
          </button>
        )}
        <span style={{ fontFamily: SANS, fontSize: 11, color: T.t3, background: T.surf2, padding: "2px 7px", borderRadius: 10, fontWeight: 600 }}>{invoices.length}</span>
        <span style={{ fontFamily: MONO, fontWeight: 500, fontSize: 13, color: T.t1 }}>{fmt(total)}</span>
      </div>
      <div style={{ overflowX: isMobile ? "auto" : "visible" }}>
        {invoices.map(inv => {
          const isSel = selectedIds.has(inv.id);
          const isPaid = inv.status === "Paid" || inv.status === "paid";
          const src = SOURCE_LABELS[inv.sync_source];
          const cols = isMobile ? "36px 1fr 100px 110px 130px" : "40px 1fr 80px 110px 120px 110px 1fr 190px";
          return (
            <div key={inv.id} onClick={() => onToggleSelect(inv.id)}
              style={{ display: "grid", gridTemplateColumns: cols, alignItems: "center", gap: 8, padding: "8px 14px", borderTop: `1px solid ${T.bdr}`, background: isSel ? T.indigoTint : "transparent", cursor: "pointer", transition: "background 0.1s", minWidth: isMobile ? 460 : "auto" }}
              onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = T.isDark ? "rgba(99,102,241,.07)" : T.surf2; }}
              onMouseLeave={e => { e.currentTarget.style.background = isSel ? T.indigoTint : "transparent"; }}>
              <input type="checkbox" checked={isSel} onChange={() => onToggleSelect(inv.id)} onClick={e => e.stopPropagation()} style={{ accentColor: T.indigo, cursor: "pointer", width: 13, height: 13 }} />
              <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                <span style={{ fontFamily: MONO, fontSize: 12, color: T.isDark ? "#627488" : T.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{inv.invoiceNo}</span>
              </div>
              {!isMobile && (
                <span title={src ? src.label : "Manual"} style={{ fontFamily: SANS, fontSize: 11, color: T.t3, display: "flex", alignItems: "center", gap: 3 }}>
                  <span>{src ? src.icon : "📤"}</span>
                  <span style={{ fontSize: 10 }}>{src ? src.label : "Manual"}</span>
                </span>
              )}
              <span style={{ fontFamily: MONO, fontWeight: 600, fontSize: 13, color: T.isDark ? "#C8D6E8" : T.t1, fontVariantNumeric: "tabular-nums" }}>{fmt(inv.amount)}</span>
              <StatusBadge status={inv.status} />
              {!isMobile && <span style={{ fontFamily: MONO, fontSize: 12, color: T.isDark ? "#627488" : T.t2, fontVariantNumeric: "tabular-nums" }}>{fmtDate(inv.invoiceDate)}</span>}
              {!isMobile && <span style={{ fontFamily: MONO, fontSize: 12, color: (inv.status === "Overdue" || inv.status === "overdue") ? "#F87171" : T.isDark ? "#627488" : T.t2, fontWeight: (inv.status === "Overdue" || inv.status === "overdue") ? 600 : 400, fontVariantNumeric: "tabular-nums" }}>{fmtDate(inv.dueDate)}</span>}
              <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                {inv.attachment_path && (
                  <button onClick={e => { e.stopPropagation(); onViewAttachment?.(inv); }} title="Preview" style={{ padding: "2px 6px", background: "transparent", border: `1px solid ${T.bdr}`, borderRadius: 4, color: T.t2, cursor: "pointer", display: "flex", alignItems: "center" }}><Paperclip size={10} /></button>
                )}
                <button onClick={e => { e.stopPropagation(); onMarkPaid(inv.id); }} style={{ padding: "2px 7px", background: isPaid ? "transparent" : T.greenTint, border: `1px solid ${isPaid ? T.bdr : T.greenBdr}`, borderRadius: 4, color: isPaid ? T.t3 : T.green, cursor: "pointer", fontFamily: SANS, fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 2 }}>
                  {isPaid ? <><X size={10} />Unpaid</> : <><Check size={10} />Paid</>}
                </button>
                {!isMobile && <button onClick={e => { e.stopPropagation(); onEditInvoice?.(inv); }} style={{ padding: "2px 6px", background: "transparent", border: `1px solid ${T.bdr}`, borderRadius: 4, color: T.t2, cursor: "pointer", display: "flex", alignItems: "center" }}><Pencil size={10} /></button>}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ padding: "6px 14px", borderTop: `1px solid ${T.bdr}`, display: "flex", justifyContent: "space-between" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontFamily: SANS, fontSize: 12, color: T.t3 }}>
          <input type="checkbox" checked={allSel} onChange={() => onToggleAll(allIds)} style={{ accentColor: T.indigo, width: 12, height: 12 }} />Select all
        </label>
        <span style={{ fontFamily: SANS, fontSize: 12, color: T.t3 }}>Total: <span style={{ fontFamily: MONO, color: T.t2 }}>{fmt(total)}</span></span>
      </div>
    </div>
  );
}

function GroupedView({ invoices, selectedMonth, onMonthChange, selectedIds, onToggleSelect, onToggleAll, onMarkPaid, onSelectAll, onPayGroup, onAllPaid, onEditInvoice, onViewAttachment, anomalyMap, missingSuppliers }) {
  const T = useT();
  const { isMobile } = useLayout();
  const monthInvoices = invoices.filter(inv => inv.dueDate?.startsWith(selectedMonth));
  const isUnpaid = i => i.status !== "Paid" && i.status !== "paid";
  const unpaid = monthInvoices.filter(isUnpaid);
  const paidCount = monthInvoices.length - unpaid.length;
  const progress = monthInvoices.length > 0 ? Math.round((paidCount / monthInvoices.length) * 100) : 0;
  const allPaid = monthInvoices.length > 0 && paidCount === monthInvoices.length;
  const monthTotal = monthInvoices.reduce((s, i) => s + Number(i.amount), 0);
  const prevAllPaid = useRef(false);
  useEffect(() => { if (allPaid && !prevAllPaid.current && monthInvoices.length > 0) onAllPaid(); prevAllPaid.current = allPaid; }, [allPaid]);
  const allSupplierNames = [...new Set(invoices.map(i => i.supplier))];
  const supplierColor = (name) => PALETTE[allSupplierNames.indexOf(name) % PALETTE.length] || "#6366F1";
  const groups = Object.entries(monthInvoices.reduce((acc, inv) => { (acc[inv.supplier] = acc[inv.supplier] || []).push(inv); return acc; }, {})).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {(() => {
          const yms = [...new Set(invoices.map(i => i.dueDate?.slice(0, 7)).filter(Boolean))].sort();
          if (!yms.includes(selectedMonth)) yms.push(selectedMonth);
          yms.sort();
          return yms.slice(0, 8).map(ym => {
            const active = ym === selectedMonth;
            const mInvoices = invoices.filter(i => i.dueDate?.startsWith(ym));
            const mTotal = mInvoices.reduce((s, i) => s + Number(i.amount), 0);
            const [y, m] = ym.split("-").map(Number);
            const shortLabel = new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short" }) + " '" + String(y).slice(2);
            return (
              <button key={ym} onClick={() => onMonthChange(ym)} style={{ padding: "7px 16px", background: active ? T.indigo : T.isDark ? "rgba(255,255,255,.04)" : T.surf2, border: `1px solid ${active ? "transparent" : T.isDark ? "rgba(255,255,255,.08)" : T.bdr}`, borderRadius: 24, fontFamily: SANS, fontSize: 13, fontWeight: active ? 600 : 500, color: active ? "#fff" : T.t2, cursor: "pointer", whiteSpace: "nowrap" }}>
                {shortLabel}
                {mTotal > 0 && <span style={{ opacity: active ? 0.65 : 0.7, fontWeight: 400, marginLeft: 4, fontFamily: MONO }}>₪{Math.round(mTotal / 1000)}k</span>}
              </button>
            );
          });
        })()}
      </div>
      {monthInvoices.length > 0 && (
        <>
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontFamily: SANS, fontSize: 12, color: T.t3 }}>{paidCount} of {monthInvoices.length} paid</span>
              <span style={{ fontFamily: MONO, fontSize: 12, color: allPaid ? T.green : T.indigo, fontWeight: 500 }}>{progress}%</span>
            </div>
            <div style={{ height: 3, background: T.surf3, borderRadius: 2 }}>
              <div style={{ height: "100%", width: `${progress}%`, background: allPaid ? T.green : T.indigo, borderRadius: 2, transition: "width 0.6s cubic-bezier(.16,1,.3,1)" }} />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: T.indigoTint, border: `1px solid ${T.indigoBdr}`, borderRadius: 8, marginBottom: 12, gap: 8 }}>
            <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 600, color: T.indigo, flex: 1, minWidth: 0 }}>{isMobile ? fmtMonth(selectedMonth) : `Total due · ${fmtMonth(selectedMonth)}`}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {unpaid.length > 0 && <button onClick={() => onSelectAll(unpaid.map(i => i.id))} style={{ padding: "4px 9px", background: "transparent", border: `1px solid ${T.indigoBdr}`, borderRadius: 5, color: T.indigo, cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{isMobile ? `All (${unpaid.length})` : `Select all (${unpaid.length})`}</button>}
              <span style={{ fontFamily: MONO, fontWeight: 500, fontSize: isMobile ? 15 : 18, color: T.t1 }}>{fmt(monthTotal)}</span>
            </div>
          </div>
          {!isMobile && unpaid.length > 0 && (
            <div style={{ display: "flex", gap: 14, marginBottom: 12, fontFamily: SANS, fontSize: 11, color: T.t3 }}>
              {[["A", "select all"], ["P", "pay"], ["Esc", "clear"]].map(([k, lbl]) => (
                <span key={k}><kbd style={{ background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 3, padding: "1px 5px", fontFamily: MONO, fontSize: 10 }}>{k}</kbd> {lbl}</span>
              ))}
            </div>
          )}
        </>
      )}
      {groups.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 0", color: T.t3 }}>
          <Calendar size={28} strokeWidth={1} style={{ margin: "0 auto 10px", display: "block" }} />
          <div style={{ fontFamily: SANS, fontSize: 13 }}>No invoices due in {fmtMonth(selectedMonth)}</div>
        </div>
      )}
      {missingSuppliers?.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: T.amberTint, border: `1px solid ${T.amberBdr}`, borderRadius: 10, marginBottom: 10 }}>
          <AlertTriangle size={14} color={T.amber} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: T.amber }}>Missing suppliers this month: </span>
            <span style={{ fontFamily: SANS, fontSize: 13, color: T.isDark ? T.amber : T.t2 }}>{missingSuppliers.join(", ")}</span>
          </div>
        </div>
      )}
      {groups.map(([supplier, supInvoices]) => (
        <SupplierGroup key={supplier} supplier={supplier} invoices={supInvoices} selectedIds={selectedIds}
          onToggleSelect={onToggleSelect} onToggleAll={onToggleAll} onMarkPaid={onMarkPaid}
          onPayGroup={ids => onSelectAll(ids)} onEditInvoice={onEditInvoice} onViewAttachment={onViewAttachment} anomalyMap={anomalyMap}
          color={supplierColor(supplier)} />
      ))}
    </div>
  );
}

function InvoicesView({ invoices, selectedMonth, onMonthChange, onMarkPaid, onBulkPaid, onBulkUnpaid, preSelectAll, onEditInvoice, onViewAttachment, anomalyMap, missingSuppliers, initialFilterStatus, initialSelectedId }) {
  const T = useT();
  const { isMobile, isTablet } = useLayout();
  const { t } = useLang();
  const supplierList = [...new Set(invoices.map(i => i.supplier))];
  const invColor = name => PALETTE[supplierList.indexOf(name) % PALETTE.length] || "#6366F1";
  const [viewMode, setViewMode] = useState("grouped");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showPayConfirm, setShowPayConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [successData, setSuccessData] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterStatuses, setFilterStatuses] = useState(new Set());
  const [filterSuppliers, setFilterSuppliers] = useState(new Set());
  const filterRef = useRef(null);
  useEffect(() => {
    if (!filterOpen) return;
    const h = (e) => { if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [filterOpen]);

  const allStatuses = ["Paid", "Unpaid", "Overdue", "Credit"];
  const toggleStatus = (s) => setFilterStatuses(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });
  const toggleSupplier = (s) => setFilterSuppliers(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });
  const activeFilters = filterStatuses.size + filterSuppliers.size;
  const filteredInvoices = invoices.filter(inv => {
    if (filterStatuses.size > 0 && !filterStatuses.has(inv.status)) return false;
    if (filterSuppliers.size > 0 && !filterSuppliers.has(inv.supplier)) return false;
    return true;
  });

  useEffect(() => {
    if (preSelectAll) {
      const ids = invoices.filter(i => i.dueDate?.startsWith(selectedMonth) && i.status !== "Paid" && i.status !== "paid").map(i => i.id);
      setSelectedIds(new Set(ids));
    }
  }, [preSelectAll, selectedMonth]);
  useEffect(() => { if (initialFilterStatus) setFilterStatuses(new Set([initialFilterStatus])); }, [initialFilterStatus]);
  useEffect(() => { if (initialSelectedId) setSelectedIds(new Set([initialSelectedId])); }, [initialSelectedId]);

  const toggleSelect = useCallback((id) => { setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }, []);
  const toggleAll = useCallback((ids) => { setSelectedIds(prev => { const allSel = ids.every(id => prev.has(id)); const n = new Set(prev); if (allSel) ids.forEach(id => n.delete(id)); else ids.forEach(id => n.add(id)); return n; }); }, []);
  const selInvs = invoices.filter(i => selectedIds.has(i.id));
  const selTotal = selInvs.reduce((s, i) => s + i.amount, 0);

  const handleConfirmPay = () => {
    const ids = [...selectedIds], count = ids.length, total = selTotal, nm = nextMonthYM(selectedMonth);
    onBulkPaid(ids); setSelectedIds(new Set()); setShowPayConfirm(false);
    setSuccessData({ count, total, nextMonth: nm }); setShowSuccess(true);
  };
  const modalBg = T.isDark ? "rgba(5,8,16,0.88)" : "rgba(15,23,42,0.55)";

  return (
    <div style={{ animation: "slideUp 0.35s cubic-bezier(.16,1,.3,1)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {!isMobile && (
          <div style={{ display: "flex", background: T.surf, border: `1px solid ${T.bdr}`, borderRadius: 6, padding: 2, gap: 2 }}>
            {["grouped", "table"].map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)} style={{ padding: "4px 12px", borderRadius: 4, border: "none", cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: viewMode === mode ? 600 : 400, background: viewMode === mode ? T.indigoTint : "transparent", color: viewMode === mode ? T.indigo : T.t2, textTransform: "capitalize" }}>{mode === "grouped" ? t("inv_grouped") : t("inv_table")}</button>
            ))}
          </div>
        )}
        <div ref={filterRef} style={{ position: "relative" }}>
          <button onClick={() => setFilterOpen(v => !v)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 6, background: activeFilters > 0 ? T.indigoTint : "transparent", border: `1px solid ${activeFilters > 0 ? T.indigoBdr : T.bdr}`, color: activeFilters > 0 ? T.indigo : T.t2, cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: activeFilters > 0 ? 600 : 400 }}>
            <Filter size={12} strokeWidth={1.75} />{t("inv_filter")}{activeFilters > 0 ? ` (${activeFilters})` : ""}
          </button>
          {filterOpen && (
            <div style={{ position: "absolute", top: 36, left: 0, width: 240, background: T.surf, border: `1px solid ${T.bdr2}`, borderRadius: 10, boxShadow: T.isDark ? "0 8px 32px rgba(0,0,0,0.5)" : "0 8px 24px rgba(0,0,0,0.1)", zIndex: 200, overflow: "hidden", animation: "scaleIn 0.15s cubic-bezier(.16,1,.3,1)" }}>
              <div style={{ padding: "10px 12px 6px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${T.bdr}` }}>
                <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: T.t2, textTransform: "uppercase", letterSpacing: "0.06em" }}>Status</span>
                {activeFilters > 0 && <button onClick={() => { setFilterStatuses(new Set()); setFilterSuppliers(new Set()); }} style={{ fontFamily: SANS, fontSize: 11, color: T.indigo, background: "none", border: "none", cursor: "pointer", padding: 0 }}>{t("notif_clear")}</button>}
              </div>
              <div style={{ padding: "6px 8px" }}>
                {allStatuses.map(s => (
                  <button key={s} onClick={() => toggleStatus(s)}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: filterStatuses.has(s) ? T.indigoTint : "transparent", border: "none", borderRadius: 5, cursor: "pointer", textAlign: "left" }}>
                    <div style={{ width: 14, height: 14, border: `1.5px solid ${filterStatuses.has(s) ? T.indigo : T.bdr2}`, borderRadius: 3, background: filterStatuses.has(s) ? T.indigo : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {filterStatuses.has(s) && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                    <span style={{ fontFamily: SANS, fontSize: 12, color: filterStatuses.has(s) ? T.indigo : T.t1 }}>{s === "Paid" ? t("inv_paid") : s === "Unpaid" ? t("inv_unpaid") : s === "Overdue" ? t("inv_overdue") : s === "Credit" ? t("inv_credit") : s}</span>
                  </button>
                ))}
              </div>
              {supplierList.length > 0 && (
                <>
                  <div style={{ padding: "6px 12px", borderTop: `1px solid ${T.bdr}` }}>
                    <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: T.t2, textTransform: "uppercase", letterSpacing: "0.06em" }}>{t("inv_col_supplier")}</span>
                  </div>
                  <div style={{ padding: "6px 8px", maxHeight: 160, overflowY: "auto" }}>
                    {supplierList.map(s => (
                      <button key={s} onClick={() => toggleSupplier(s)}
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: filterSuppliers.has(s) ? T.indigoTint : "transparent", border: "none", borderRadius: 5, cursor: "pointer", textAlign: "left" }}>
                        <div style={{ width: 14, height: 14, border: `1.5px solid ${filterSuppliers.has(s) ? T.indigo : T.bdr2}`, borderRadius: 3, background: filterSuppliers.has(s) ? T.indigo : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {filterSuppliers.has(s) && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                        </div>
                        <span style={{ fontFamily: SANS, fontSize: 12, color: filterSuppliers.has(s) ? T.indigo : T.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        {selectedIds.size > 0 && <button onClick={() => setSelectedIds(new Set())} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 6, background: "transparent", border: `1px solid ${T.redBdr}`, color: T.red, cursor: "pointer", fontFamily: SANS, fontSize: 12 }}><X size={12} />Clear</button>}
        <div style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11, color: T.t3 }}>{filteredInvoices.length}{activeFilters > 0 ? ` / ${invoices.length}` : ""} {t("inv_invoices")}</div>
      </div>

      {(isMobile || viewMode === "grouped") ? (
        <GroupedView invoices={filteredInvoices} selectedMonth={selectedMonth} onMonthChange={onMonthChange}
          selectedIds={selectedIds} onToggleSelect={toggleSelect} onToggleAll={toggleAll}
          onMarkPaid={onMarkPaid} onSelectAll={ids => setSelectedIds(new Set(ids))}
          onPayGroup={ids => { setSelectedIds(new Set(ids)); setShowPayConfirm(true); }}
          onAllPaid={() => setShowCelebration(true)} onEditInvoice={onEditInvoice} onViewAttachment={onViewAttachment}
          anomalyMap={anomalyMap} missingSuppliers={missingSuppliers} />
      ) : (
        <div style={{ background: T.surf, border: `1px solid ${T.bdr}`, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "40px minmax(140px,1fr) 130px 90px 90px 110px 70px 90px 80px", alignItems: "center", padding: "0 18px", height: 40, background: T.isDark ? "#0E1520" : T.surf2, borderBottom: `1px solid ${T.bdr}` }}>
            {["", t("inv_col_supplier"), t("inv_col_invoice"), t("inv_col_issued"), t("inv_col_due"), t("inv_col_amount"), "Source", t("inv_col_status"), ""].map((h, i) => (
              <div key={i} style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.isDark ? "rgba(255,255,255,.3)" : T.t3, textAlign: i === 5 ? "right" : "left", paddingRight: i === 5 ? 14 : 0 }}>{h}</div>
            ))}
          </div>
          {filteredInvoices.map(inv => {
            const isSel = selectedIds.has(inv.id);
            const srcInfo = SOURCE_LABELS[inv.sync_source];
            return (
              <div key={inv.id} onClick={() => toggleSelect(inv.id)}
                style={{ display: "grid", gridTemplateColumns: "40px minmax(140px,1fr) 130px 90px 90px 110px 70px 90px 80px", alignItems: "center", padding: "0 18px", height: 52, borderBottom: `1px solid ${T.isDark ? "rgba(255,255,255,.04)" : T.bdr}`, background: isSel ? T.indigoTint : "transparent", cursor: "pointer", transition: "background 0.1s" }}
                onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = T.isDark ? "rgba(99,102,241,.07)" : T.surf2; }}
                onMouseLeave={e => { e.currentTarget.style.background = isSel ? T.indigoTint : "transparent"; }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ width: 14, height: 14, border: `1.5px solid ${isSel ? T.indigo : T.isDark ? "rgba(255,255,255,.18)" : T.bdr2}`, borderRadius: 3, background: isSel ? T.indigo : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {isSel && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: invColor(inv.supplier), display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontWeight: 700, fontSize: 10, color: "#fff", flexShrink: 0 }}>{inv.supplier.charAt(0)}</div>
                  <span style={{ fontFamily: SANS, fontWeight: 500, fontSize: 13, color: T.isDark ? "#B8CAE0" : T.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inv.supplier}</span>
                </div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: T.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8, fontVariantNumeric: "tabular-nums" }}>{inv.invoiceNo}</div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: T.t2, fontVariantNumeric: "tabular-nums" }}>{fmtDate(inv.invoiceDate)}</div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: (inv.status === "Overdue" || inv.status === "overdue") ? "#F87171" : T.t2, fontWeight: (inv.status === "Overdue" || inv.status === "overdue") ? 600 : 400, fontVariantNumeric: "tabular-nums" }}>{fmtDate(inv.dueDate)}</div>
                <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600, color: T.isDark ? "#C8D6E8" : T.t1, textAlign: "right", paddingRight: 14, fontVariantNumeric: "tabular-nums" }}>{fmt(inv.amount)}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 11 }}>{srcInfo ? srcInfo.icon : "📤"}</span>
                  <span style={{ fontFamily: SANS, fontSize: 10, color: T.t3, fontWeight: 500 }}>{srcInfo ? srcInfo.label : "Manual"}</span>
                </div>
                <StatusBadge status={inv.status} />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
                  <button onClick={e => { e.stopPropagation(); inv.attachment_path && onViewAttachment?.(inv); }} title={inv.attachment_path ? "Preview" : "No attachment"} style={{ width: 26, height: 26, border: `1px solid ${T.isDark ? "rgba(255,255,255,.09)" : T.bdr}`, borderRadius: 6, background: T.isDark ? "rgba(255,255,255,.03)" : "transparent", cursor: inv.attachment_path ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", opacity: inv.attachment_path ? 1 : 0.35 }}>
                    <Paperclip size={11} strokeWidth={1.75} color={T.isDark ? "rgba(255,255,255,.35)" : T.t2} />
                  </button>
                  <button onClick={e => { e.stopPropagation(); onEditInvoice?.(inv); }} style={{ width: 26, height: 26, border: `1px solid ${T.isDark ? "rgba(255,255,255,.09)" : T.bdr}`, borderRadius: 6, background: T.isDark ? "rgba(255,255,255,.03)" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.isDark ? "rgba(255,255,255,.35)" : T.t2} strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedIds.size > 0 && (
        <div style={{ position: "fixed", bottom: isMobile ? 0 : 24, left: isMobile ? 0 : (isTablet ? 0 : 240), right: 0, display: "flex", justifyContent: "center", pointerEvents: "none", zIndex: 200, animation: "slideUp 0.25s cubic-bezier(.16,1,.3,1)" }}>
          <div style={{ pointerEvents: "auto", background: "#0F172A", padding: isMobile ? "14px 20px" : "10px 20px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 -4px 24px rgba(0,0,0,0.3)", borderRadius: isMobile ? "12px 12px 0 0" : 50, width: isMobile ? "100%" : "auto", whiteSpace: "nowrap" }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#6366F1", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontWeight: 700, fontSize: 11, color: "#fff" }}>{selectedIds.size}</div>
            <span style={{ fontFamily: SANS, fontWeight: 500, color: "#94A3B8", fontSize: 13, flex: 1 }}>{selectedIds.size} · <span style={{ fontFamily: MONO, color: "#fff" }}>{fmt(selTotal)}</span></span>
            <button onClick={() => { onBulkUnpaid?.([...selectedIds]); setSelectedIds(new Set()); }} style={{ padding: "7px 14px", borderRadius: 50, background: "transparent", border: "1px solid #334155", cursor: "pointer", fontFamily: SANS, fontWeight: 600, fontSize: 13, color: "#94A3B8", display: "flex", alignItems: "center", gap: 5 }}><X size={12} />Unpaid</button>
            <button onClick={() => setShowPayConfirm(true)} style={{ padding: "7px 18px", borderRadius: 50, background: "#6366F1", border: "none", cursor: "pointer", fontFamily: SANS, fontWeight: 600, fontSize: 13, color: "#fff" }}>{t("inv_pay_selected")} →</button>
            <button onClick={() => setSelectedIds(new Set())} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", display: "flex", alignItems: "center" }}><X size={15} /></button>
          </div>
        </div>
      )}

      {showPayConfirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, background: modalBg, backdropFilter: "blur(4px)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", padding: isMobile ? 0 : 20, animation: "fadeIn 0.2s" }}>
          <div style={{ background: T.surf, border: `1px solid ${T.bdr2}`, borderRadius: isMobile ? "16px 16px 0 0" : 14, padding: 24, width: "100%", maxWidth: isMobile ? "100%" : 500, boxShadow: "0 20px 48px rgba(0,0,0,0.2)", animation: isMobile ? "slideUp 0.25s ease" : "scaleIn 0.2s cubic-bezier(.16,1,.3,1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
              <div>
                <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 17, color: T.t1 }}>Confirm Payment</div>
                <div style={{ fontFamily: SANS, fontSize: 13, color: T.t3, marginTop: 2 }}>Marking {selInvs.length} invoice{selInvs.length !== 1 ? "s" : ""} as paid</div>
              </div>
              <button onClick={() => setShowPayConfirm(false)} style={{ background: "none", border: "none", color: T.t3, cursor: "pointer", display: "flex" }}><X size={18} /></button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto", marginBottom: 14 }}>
              {selInvs.map(inv => (
                <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: T.surf2, borderRadius: 7, border: `1px solid ${T.bdr}` }}>
                  <div style={{ width: 26, height: 26, borderRadius: "50%", background: invColor(inv.supplier), display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontWeight: 700, fontSize: 11, color: "#fff", flexShrink: 0 }}>{inv.supplier.charAt(0)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 13, color: T.t1 }}>{inv.supplier}</div>
                    <div style={{ fontFamily: MONO, fontSize: 10, color: T.t3 }}>{inv.invoiceNo}</div>
                  </div>
                  <span style={{ fontFamily: MONO, fontWeight: 500, fontSize: 13, color: T.t1 }}>{fmt(inv.amount)}</span>
                </div>
              ))}
            </div>
            <div style={{ padding: "11px 14px", background: T.indigoTint, border: `1px solid ${T.indigoBdr}`, borderRadius: 8, marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: SANS, color: T.indigo, fontSize: 13, fontWeight: 500 }}>Total</span>
              <span style={{ fontFamily: MONO, fontWeight: 500, fontSize: 20, color: T.indigo }}>{fmt(selTotal)}</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowPayConfirm(false)} style={{ flex: 1, padding: "11px 0", background: "transparent", border: `1px solid ${T.bdr2}`, borderRadius: 7, color: T.t2, cursor: "pointer", fontFamily: SANS, fontWeight: 600, fontSize: 14 }}>{t("cancel")}</button>
              <button onClick={handleConfirmPay} style={{ flex: 2, padding: "11px 0", background: T.indigo, border: "none", borderRadius: 7, color: "#fff", cursor: "pointer", fontFamily: SANS, fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                <Check size={15} strokeWidth={2.5} />{t("confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCelebration && (
        <div onClick={() => setShowCelebration(false)} style={{ position: "fixed", inset: 0, zIndex: 300, background: modalBg, backdropFilter: "blur(4px)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", padding: isMobile ? 0 : 20, animation: "fadeIn 0.2s" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.surf, border: `1px solid ${T.bdr2}`, borderRadius: isMobile ? "16px 16px 0 0" : 14, padding: "32px 28px", textAlign: "center", width: "100%", maxWidth: isMobile ? "100%" : 380, position: "relative", animation: isMobile ? "slideUp 0.25s ease" : "scaleIn 0.25s cubic-bezier(.16,1,.3,1)" }}>
            <button onClick={() => setShowCelebration(false)} style={{ position: "absolute", top: 14, right: 16, background: "none", border: "none", color: T.t3, cursor: "pointer", display: "flex" }}><X size={18} /></button>
            <div style={{ width: 60, height: 60, borderRadius: "50%", background: T.greenTint, border: `1px solid ${T.greenBdr}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <CheckCircle2 size={28} color={T.green} strokeWidth={1.5} />
            </div>
            <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 19, color: T.t1, marginBottom: 7 }}>All done for {fmtMonth(selectedMonth)}!</div>
            <div style={{ fontFamily: SANS, color: T.t2, fontSize: 14, marginBottom: 20 }}>Every invoice has been paid.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowCelebration(false)} style={{ flex: 1, padding: "10px 0", background: "transparent", border: `1px solid ${T.bdr2}`, borderRadius: 7, color: T.t2, cursor: "pointer", fontFamily: SANS, fontWeight: 600, fontSize: 13 }}>← Back</button>
              <button onClick={() => { setShowCelebration(false); onMonthChange(nextMonthYM(selectedMonth)); }} style={{ flex: 2, padding: "10px 0", background: T.indigo, border: "none", borderRadius: 7, color: "#fff", cursor: "pointer", fontFamily: SANS, fontWeight: 600, fontSize: 13 }}>Next Month →</button>
            </div>
          </div>
        </div>
      )}

      {showSuccess && successData && (
        <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(7,10,18,0.95)", backdropFilter: "blur(14px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", animation: "fadeIn 0.3s", padding: 24 }}>
          {[...Array(20)].map((_, i) => (
            <div key={i} style={{ position: "fixed", left: `${5 + i * 4.5}%`, top: `${20 + (i % 5) * 10}%`, width: i % 3 === 0 ? 9 : 6, height: i % 3 === 0 ? 9 : 6, borderRadius: i % 2 === 0 ? 2 : "50%", background: ["#6366F1","#10B981","#F59E0B","#EC4899","#818CF8"][i % 5], animation: `confettiFall ${0.5 + (i % 7) * 0.07}s ease-out ${i * 0.05}s both`, pointerEvents: "none" }} />
          ))}
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
            <CheckCircle2 size={34} color="#10B981" strokeWidth={1.5} />
          </div>
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 28, letterSpacing: "-0.03em", color: "#F1F5F9", marginBottom: 7 }}>All Clear</div>
          <div style={{ fontFamily: SANS, color: "#64748B", fontSize: 15, marginBottom: 5 }}>{successData.count} invoice{successData.count !== 1 ? "s" : ""} marked paid</div>
          <div style={{ fontFamily: MONO, fontWeight: 500, fontSize: 24, color: "#10B981", marginBottom: 24 }}>{fmt(successData.total)}</div>
          <div style={{ display: "flex", gap: 10, width: "100%", maxWidth: 320 }}>
            <button onClick={() => setShowSuccess(false)} style={{ flex: 1, padding: "10px 0", background: "transparent", border: "1px solid #1E293B", borderRadius: 7, color: "#64748B", cursor: "pointer", fontFamily: SANS, fontWeight: 600, fontSize: 14 }}>← Back</button>
            <button onClick={() => { setShowSuccess(false); onMonthChange(successData.nextMonth); }} style={{ flex: 2, padding: "10px 0", background: "#6366F1", border: "none", borderRadius: 7, color: "#fff", cursor: "pointer", fontFamily: SANS, fontWeight: 600, fontSize: 14 }}>
              Next: {fmtMonth(successData.nextMonth)} →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Integrations ──────────────────────────────────────────────────────────────
const INTEGRATIONS_DATA = [
  { id: "drive", label: "Google Drive",  color: "#4285F4", connected: true,  last: "2 min ago",  count: 43 },
  { id: "gmail", label: "Gmail",         color: "#EA4335", connected: false, last: null,         count: 0  },
  { id: "wa",    label: "WhatsApp",      color: "#25D366", connected: false, last: null,         count: 0  },
  { id: "green", label: "Green Invoice", color: "#16A34A", connected: true,  last: "1 hour ago", count: 12 },
];
function IntegrationsView() {
  const T = useT();
  const [expanded, setExpanded] = useState(null);
  return (
    <div style={{ animation: "slideUp 0.35s cubic-bezier(.16,1,.3,1)", maxWidth: 680 }}>
      {INTEGRATIONS_DATA.map(intg => (
        <div key={intg.id} style={{ background: T.surf, border: `1px solid ${intg.connected ? intg.color + "40" : T.bdr}`, borderLeft: `3px solid ${intg.connected ? intg.color : T.bdr}`, borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px" }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: `${intg.color}14`, border: `1px solid ${intg.color}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {intg.connected ? <Wifi size={15} color={intg.color} strokeWidth={1.75} /> : <WifiOff size={15} color={T.t3} strokeWidth={1.75} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 14, color: T.t1 }}>{intg.label}</div>
              <div style={{ fontFamily: SANS, fontSize: 12, color: T.t3, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{intg.connected ? `Connected · ${intg.last} · ${intg.count} invoices` : "Not connected"}</div>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              {intg.connected && <button style={{ padding: "5px 8px", background: "transparent", border: `1px solid ${T.bdr}`, borderRadius: 5, color: T.t2, cursor: "pointer", display: "flex", alignItems: "center" }}><RefreshCw size={12} /></button>}
              <button style={{ padding: "5px 10px", background: intg.connected ? T.redTint : T.indigoTint, border: `1px solid ${intg.connected ? T.redBdr : T.indigoBdr}`, borderRadius: 5, color: intg.connected ? T.red : T.indigo, cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 600 }}>{intg.connected ? "Disconnect" : "Connect"}</button>
              <button onClick={() => setExpanded(expanded === intg.id ? null : intg.id)} style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: `1px solid ${T.bdr}`, borderRadius: 5, cursor: "pointer", color: T.t2 }}>
                <ChevronDown size={13} style={{ transform: expanded === intg.id ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
              </button>
            </div>
          </div>
          {expanded === intg.id && (
            <div style={{ padding: "12px 16px", borderTop: `1px solid ${T.bdr}`, background: T.surf2, animation: "fadeIn 0.15s" }}>
              <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: T.t3, marginBottom: 10 }}>Settings</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <label style={{ fontFamily: SANS, fontSize: 12, color: T.t2, display: "block", marginBottom: 4 }}>Sync frequency</label>
                  <select style={{ width: "100%", padding: "7px 10px", background: T.surf, border: `1px solid ${T.bdr}`, borderRadius: 5, fontFamily: SANS, fontSize: 13, color: T.t1 }}>
                    <option>Every hour</option><option>Every 6 hours</option><option>Daily</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontFamily: SANS, fontSize: 12, color: T.t2, display: "block", marginBottom: 4 }}>Folder / label</label>
                  <input defaultValue="Invoices/" style={{ width: "100%", padding: "7px 10px", background: T.surf, border: `1px solid ${T.bdr}`, borderRadius: 5, fontFamily: MONO, fontSize: 12, color: T.t1 }} />
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Suppliers ─────────────────────────────────────────────────────────────────
function SuppliersView({ suppliers, onAdd, onUpdate, onDelete }) {
  const T = useT();
  const { isMobile } = useLayout();
  const { t } = useLang();
  const [filterTerm, setFilterTerm] = useState("all");
  const [editId, setEditId] = useState(null);
  const [editData, setEditData] = useState({});
  const [csvToast, setCsvToast] = useState(null);
  const csvRef = useRef(null);
  const TERMS = ["all", "shotef_plus(45)", "shotef_plus(30)", "shotef", "immediate"];
  const filtered = filterTerm === "all" ? suppliers : suppliers.filter(s => s.terms === filterTerm);
  const inp = { flex: 1, padding: "6px 10px", background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 5, fontFamily: SANS, fontSize: 12, color: T.t1, minWidth: 0, outline: "none" };

  const handleCSV = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCSV(text);
    let added = 0;
    for (const row of rows) {
      if (row.name) { await onAdd?.({ name: row.name, terms: row.terms || "shotef", notes: row.notes || "" }); added++; }
    }
    setCsvToast(t("sup_imported", { n: added }));
    setTimeout(() => setCsvToast(null), 3000);
    e.target.value = "";
  };

  return (
    <div style={{ animation: "slideUp 0.35s cubic-bezier(.16,1,.3,1)" }}>
      {csvToast && (
        <div style={{ marginBottom: 10, padding: "8px 14px", background: T.greenTint, border: `1px solid ${T.greenBdr}`, borderRadius: 7, fontFamily: SANS, fontSize: 13, color: T.green, animation: "fadeIn 0.2s" }}>
          {csvToast}
        </div>
      )}
      <input ref={csvRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleCSV} />
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        {TERMS.map(t => (
          <button key={t} onClick={() => setFilterTerm(t)} style={{ padding: "4px 10px", borderRadius: 3, border: `1px solid ${filterTerm === t ? T.indigo : T.bdr}`, background: filterTerm === t ? T.indigoTint : "transparent", color: filterTerm === t ? T.indigo : T.t2, cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 600 }}>
            {t === "all" ? `All (${suppliers.length})` : isMobile ? t.replace("shotef_plus(", "+").replace(")", "") : t}
          </button>
        ))}
        <div style={{ marginLeft: "auto" }}>
          <button onClick={() => csvRef.current?.click()} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 6, background: "transparent", border: `1px solid ${T.bdr}`, color: T.t2, cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 500 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            {t("sup_import")}
          </button>
        </div>
      </div>
      <div style={{ background: T.surf, border: `1px solid ${T.bdr}`, borderRadius: 10, overflow: "hidden" }}>
        {filtered.map((sup, idx) => (
          <div key={sup.id} style={{ padding: "11px 14px", borderTop: idx > 0 ? `1px solid ${T.bdr}` : "none" }}>
            {editId === sup.id ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 7 }}>
                  <input value={editData.name ?? ""} placeholder={t("sup_name")} onChange={e => setEditData(d => ({ ...d, name: e.target.value }))} style={inp} />
                  <input value={editData.terms ?? ""} placeholder={t("sup_terms")} onChange={e => setEditData(d => ({ ...d, terms: e.target.value }))} style={{ ...inp, maxWidth: 130 }} />
                </div>
                <div style={{ display: "flex", gap: 7 }}>
                  <input value={editData.notes ?? ""} placeholder={t("sup_notes")} onChange={e => setEditData(d => ({ ...d, notes: e.target.value }))} style={inp} />
                  <button onClick={async () => { try { await onUpdate?.(sup.id, editData); } catch {} setEditId(null); }} style={{ padding: "6px 12px", background: T.greenTint, border: `1px solid ${T.greenBdr}`, borderRadius: 5, color: T.green, cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}><Check size={11} />{t("sup_save")}</button>
                  <button onClick={() => setEditId(null)} style={{ padding: "6px 10px", background: "transparent", border: `1px solid ${T.bdr}`, borderRadius: 5, color: T.t2, cursor: "pointer", display: "flex", alignItems: "center", flexShrink: 0 }}><X size={11} /></button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: PALETTE[idx % PALETTE.length], display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontWeight: 700, fontSize: 11, color: "#fff", flexShrink: 0 }}>{sup.name.charAt(0)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: T.t1 }}>{sup.name}</div>
                  <div style={{ fontFamily: MONO, fontSize: 11, color: T.t3 }}>{sup.terms}</div>
                </div>
                {!isMobile && sup.notes && <span style={{ fontFamily: SANS, fontSize: 12, color: T.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>{sup.notes}</span>}
                <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                  <button onClick={() => { setEditId(sup.id); setEditData({ name: sup.name, terms: sup.terms, notes: sup.notes }); }} style={{ padding: "3px 8px", background: "transparent", border: `1px solid ${T.bdr}`, borderRadius: 4, color: T.t2, cursor: "pointer", fontFamily: SANS, fontSize: 11, display: "flex", alignItems: "center", gap: 3 }}><Pencil size={10} />{!isMobile && t("sup_edit")}</button>
                  <button onClick={() => onDelete?.(sup.id)} style={{ padding: "3px 7px", background: "transparent", border: `1px solid ${T.redBdr}`, borderRadius: 4, color: T.red, cursor: "pointer", display: "flex", alignItems: "center" }}><Trash2 size={10} /></button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        {(() => { const csvRef = React.createRef(); return (<>
          <input type="file" accept=".csv,.txt" ref={csvRef} style={{ display: "none" }}
            onChange={async e => {
              const file = e.target.files?.[0];
              if (!file) return;
              const text = await file.text();
              const parsed = parseCSV(text);
              if (!parsed.length) { alert("No suppliers found in CSV. Make sure it has a 'name' column."); return; }
              let added = 0;
              for (const s of parsed) { try { await onAdd?.({ name: s.name, terms: s.terms || "", notes: s.notes || "" }); added++; } catch {} }
              alert(`Imported ${added} supplier${added !== 1 ? "s" : ""}.`);
              e.target.value = "";
            }}
          />
          <button onClick={() => csvRef.current?.click()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "transparent", border: `1px solid ${T.bdr2}`, borderRadius: 7, fontFamily: SANS, fontSize: 12, fontWeight: 600, color: T.t2, cursor: "pointer" }}>
            {t("sup_import")}
          </button>
        </>); })()}
        <button onClick={() => onAdd?.({ name: "New Supplier", terms: "shotef", notes: "" })}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "transparent", border: `1px solid ${T.bdr}`, borderRadius: 6, color: T.t1, cursor: "pointer", fontFamily: SANS, fontSize: 13, fontWeight: 600 }}>
          <Plus size={13} />{t("sup_add")}
        </button>
      </div>
    </div>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────
function SettingsScreen({ onUpgrade, onSignOut, user, invoices, suppliers, onNavigateToIntegrations }) {
  const T = useT();
  const { isMobile, isTablet } = useLayout();
  const { t } = useLang();
  const isCompact = isMobile || isTablet;

  const generalRef = useRef(null);
  const profileRef = useRef(null);
  const billingRef = useRef(null);
  const integrationsRef = useRef(null);
  const teamRef = useRef(null);
  const dataRef = useRef(null);
  const dangerRef = useRef(null);
  const sectionRefs = { general: generalRef, profile: profileRef, billing: billingRef, integrations: integrationsRef, team: teamRef, data: dataRef, danger: dangerRef };

  const [activeSection, setActiveSection] = useState("general");
  const [saved, setSaved] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [bizName, setBizName] = useState(user?.user_metadata?.business_name || "");
  const [logoUrl, setLogoUrl] = useState(user?.user_metadata?.logo_url || null);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef(null);
  const [currency, setCurrency] = useState("ILS");
  const [timezone, setTimezone] = useState("Asia/Jerusalem");
  const [fullName, setFullName] = useState(user?.user_metadata?.full_name || user?.email?.split("@")[0] || "");
  const [changingPw, setChangingPw] = useState(false);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwError, setPwError] = useState("");
  const [deleteInput, setDeleteInput] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const SETTINGS_KEY = "urban_cashflow_settings";
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      if (!user?.user_metadata?.business_name && s.bizName !== undefined) setBizName(s.bizName);
      if (s.currency) setCurrency(s.currency);
      if (s.timezone) setTimezone(s.timezone);
    } catch {}
  }, []);

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const fd = new FormData();
      fd.append('logo', file);
      const res = await fetch('/api/profile/logo', { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token}` }, body: fd });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || 'Upload failed'); }
      const { logo_url } = await res.json();
      setLogoUrl(logo_url);
      await supabase.auth.updateUser({ data: { logo_url } });
    } catch (err) { setSaveError(err.message); }
    setLogoUploading(false);
    e.target.value = '';
  };

  const scrollTo = (id) => { sectionRefs[id]?.current?.scrollIntoView({ behavior: "smooth", block: "start" }); setActiveSection(id); };

  const saveSection = async (id) => {
    setSaveError(null);
    try {
      if (id === "general") {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ bizName, currency, timezone }));
        await supabase.auth.updateUser({ data: { business_name: bizName } });
      }
      if (id === "profile") {
        const { error } = await supabase.auth.updateUser({ data: { full_name: fullName } });
        if (error) { setSaveError(error.message); return; }
      }
      setSaved(id); setTimeout(() => setSaved(null), 2000);
    } catch (err) { setSaveError(err.message); }
  };

  const handlePasswordChange = async () => {
    setPwError("");
    if (!pwNew) { setPwError("New password is required."); return; }
    if (pwNew !== pwConfirm) { setPwError("Passwords don't match."); return; }
    if (pwNew.length < 6) { setPwError("Password must be at least 6 characters."); return; }
    const { error } = await supabase.auth.updateUser({ password: pwNew });
    if (error) { setPwError(error.message); return; }
    setChangingPw(false); setPwCurrent(""); setPwNew(""); setPwConfirm("");
    setSaved("profile"); setTimeout(() => setSaved(null), 2000);
  };
  const inp = { width: "100%", padding: "9px 12px", background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 6, fontFamily: SANS, fontSize: 13, color: T.t1, outline: "none" };
  const sel = { ...inp, cursor: "pointer" };
  const { plan: settingsPlan, used, limit, pct: planPctRaw } = usePlan();

  const downloadCSV = (filename, rows, cols) => {
    const escape = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.join(","), ...rows.map(r => cols.map(c => escape(r[c])).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const exportInvoices = () => downloadCSV("invoices.csv", invoices || [], ["supplier","invoice_no","invoice_date","due_date","amount","status","notes"]);
  const exportSuppliers = () => downloadCSV("suppliers.csv", suppliers || [], ["name","terms","notes"]);
  const exportReport = () => {
    const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const groups = {};
    (invoices || []).forEach(inv => {
      const d = new Date((inv.invoice_date || inv.invoiceDate || inv.dueDate || "") + "T12:00:00");
      if (isNaN(d)) return;
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      const label = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
      if (!groups[key]) groups[key] = { month: label, total: 0, paid: 0, unpaid: 0, overdue: 0 };
      const amt = Number(inv.amount || 0);
      groups[key].total += amt;
      if (inv.status === "Paid" || inv.status === "paid") groups[key].paid += amt;
      else if (inv.status === "Overdue" || inv.status === "overdue") groups[key].overdue += amt;
      else groups[key].unpaid += amt;
    });
    const rows = Object.keys(groups).sort().map(k => groups[k]);
    downloadCSV("financial-report.csv", rows, ["month","total","paid","unpaid","overdue"]);
  };
  const pct = Math.round((planPctRaw || 0) * 100);

  const NAV = [
    { id: "general",      label: t("set_general"),      Icon: Building2,     locked: false, danger: false },
    { id: "profile",      label: t("set_profile"),      Icon: User,          locked: false, danger: false },
    { id: "billing",      label: t("set_billing"),      Icon: CreditCard,    locked: false, danger: false },
    { id: "integrations", label: t("set_integrations"), Icon: Zap,           locked: false, danger: false },
    { id: "team",         label: t("set_team"),         Icon: Users,         locked: true,  danger: false },
    { id: "data",         label: t("set_export"),       Icon: Download,      locked: false, danger: false },
    { id: "danger",       label: t("set_danger"),       Icon: AlertTriangle, locked: false, danger: true  },
  ];

  const Section = ({ id, title, desc, children }) => (
    <div ref={sectionRefs[id]} style={{ marginBottom: 40, scrollMarginTop: 20 }}>
      <div style={{ marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${T.bdr}` }}>
        <h2 style={{ fontFamily: SANS, fontWeight: 700, fontSize: 15, color: T.t1, letterSpacing: "-0.02em" }}>{title}</h2>
        {desc && <p style={{ fontFamily: SANS, fontSize: 12, color: T.t3, marginTop: 3 }}>{desc}</p>}
      </div>
      {children}
    </div>
  );

  const Row = ({ label, hint, children }) =>
    isCompact ? (
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 600, color: T.t2, marginBottom: 5 }}>{label}{hint && <span style={{ fontWeight: 400, color: T.t3 }}> — {hint}</span>}</div>
        {children}
      </div>
    ) : (
      <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 20, alignItems: "start", marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 500, color: T.t1 }}>{label}</div>
          {hint && <div style={{ fontFamily: SANS, fontSize: 11, color: T.t3, marginTop: 2 }}>{hint}</div>}
        </div>
        <div>{children}</div>
      </div>
    );

  const SaveBtn = ({ id }) => (
    <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, marginTop: 4 }}>
      {saveError && saved !== id && <span style={{ fontFamily: SANS, fontSize: 12, color: T.red }}>{saveError}</span>}
      <button onClick={() => saveSection(id)} style={{ padding: "7px 16px", background: T.indigo, border: "none", borderRadius: 6, fontFamily: SANS, fontWeight: 600, fontSize: 12, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
        {saved === id ? <><Check size={12} />{t("set_saved")}</> : t("set_save")}
      </button>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: isCompact ? "column" : "row", gap: 0, animation: "slideUp 0.35s cubic-bezier(.16,1,.3,1)" }}>
      {isCompact ? (
        <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 12, marginBottom: 24, borderBottom: `1px solid ${T.bdr}` }}>
          {NAV.map(({ id, label, Icon, locked, danger }) => (
            <button key={id} onClick={() => scrollTo(id)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 6, border: `1px solid ${activeSection === id ? T.indigoBdr : T.bdr}`, background: activeSection === id ? T.indigoTint : "transparent", color: danger ? T.red : activeSection === id ? T.indigo : T.t2, cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: activeSection === id ? 600 : 400, whiteSpace: "nowrap", flexShrink: 0 }}>
              <Icon size={12} strokeWidth={1.75} />{label}{locked && <Lock size={9} color={T.t3} />}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ width: 192, flexShrink: 0, marginRight: 44 }}>
          <div style={{ position: "sticky", top: 20 }}>
            {NAV.map(({ id, label, Icon, locked, danger }) => (
              <button key={id} onClick={() => scrollTo(id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 6, border: "none", background: activeSection === id ? T.indigoTint : "transparent", color: danger ? T.red : activeSection === id ? T.indigo : T.t2, cursor: "pointer", fontFamily: SANS, fontSize: 13, fontWeight: activeSection === id ? 600 : 400, marginBottom: 1, textAlign: "left" }}
                onMouseEnter={e => { if (activeSection !== id) e.currentTarget.style.background = T.surf2; }}
                onMouseLeave={e => { if (activeSection !== id) e.currentTarget.style.background = "transparent"; }}>
                <Icon size={13} strokeWidth={1.75} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{label}</span>
                {locked && <Lock size={10} color={T.t3} />}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0, maxWidth: isCompact ? "100%" : 560 }}>
        <Section id="general" title={t("set_general")} desc="">
          <Row label="Business Logo">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {logoUrl
                ? <img src={logoUrl} alt="logo" style={{ width: 48, height: 48, borderRadius: 8, objectFit: "contain", border: `1px solid ${T.bdr}`, background: T.surf2 }} />
                : <div style={{ width: 48, height: 48, borderRadius: 8, background: T.surf2, border: `1px solid ${T.bdr}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🏢</div>
              }
              <input ref={logoInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: "none" }} onChange={handleLogoUpload} />
              <button onClick={() => logoInputRef.current?.click()} disabled={logoUploading} style={{ padding: "7px 14px", border: `1px solid ${T.bdr2}`, borderRadius: 7, background: "transparent", fontFamily: SANS, fontSize: 12, fontWeight: 500, color: T.t2, cursor: "pointer" }}>
                {logoUploading ? "Uploading…" : "Upload logo"}
              </button>
              {logoUrl && <button onClick={() => { setLogoUrl(null); supabase.auth.updateUser({ data: { logo_url: null } }); }} style={{ background: "none", border: "none", color: T.t3, cursor: "pointer", fontSize: 12 }}>Remove</button>}
            </div>
          </Row>
          <Row label={t("set_biz_name")}><input value={bizName} onChange={e => setBizName(e.target.value)} style={inp} /></Row>
          <Row label={t("set_currency")}>
            <select value={currency} onChange={e => setCurrency(e.target.value)} style={sel}>
              <option value="ILS">₪ Israeli New Shekel (ILS)</option>
              <option value="USD">$ US Dollar (USD)</option>
              <option value="EUR">€ Euro (EUR)</option>
              <option value="GBP">£ British Pound (GBP)</option>
            </select>
          </Row>
          <Row label={t("set_timezone")}>
            <select value={timezone} onChange={e => setTimezone(e.target.value)} style={sel}>
              <option value="Asia/Jerusalem">Asia/Jerusalem (UTC+3)</option>
              <option value="UTC">UTC</option>
              <option value="Europe/London">Europe/London (UTC+0)</option>
              <option value="America/New_York">America/New_York (UTC-5)</option>
              <option value="America/Los_Angeles">America/Los_Angeles (UTC-8)</option>
            </select>
          </Row>
          <SaveBtn id="general" />
        </Section>

        <Section id="profile" title={t("set_profile")} desc="">
          <Row label={t("set_full_name")}><input value={fullName} onChange={e => setFullName(e.target.value)} style={inp} /></Row>
          <Row label={t("set_email")}><input value={user?.email || ""} disabled style={{ ...inp, opacity: 0.5, cursor: "not-allowed" }} /></Row>
          <Row label={t("set_change_pw")}>
            {!changingPw ? (
              <button onClick={() => setChangingPw(true)} style={{ padding: "8px 14px", background: "transparent", border: `1px solid ${T.bdr}`, borderRadius: 6, fontFamily: SANS, fontSize: 13, color: T.t1, cursor: "pointer" }}>{t("set_change_pw")}</button>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input type="password" value={pwCurrent} onChange={e => setPwCurrent(e.target.value)} placeholder={t("set_current_pw")} style={inp} />
                <input type="password" value={pwNew} onChange={e => setPwNew(e.target.value)} placeholder={t("set_new_pw")} style={inp} />
                <input type="password" value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} placeholder={t("set_confirm_pw")} style={inp} />
                {pwError && <div style={{ fontFamily: SANS, fontSize: 12, color: T.red }}>{pwError}</div>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={handlePasswordChange} style={{ flex: 1, padding: "8px 0", background: T.indigo, border: "none", borderRadius: 6, fontFamily: SANS, fontWeight: 600, fontSize: 13, color: "#fff", cursor: "pointer" }}>{t("set_update_pw")}</button>
                  <button onClick={() => { setChangingPw(false); setPwError(""); setPwCurrent(""); setPwNew(""); setPwConfirm(""); }} style={{ padding: "8px 14px", background: "transparent", border: `1px solid ${T.bdr}`, borderRadius: 6, fontFamily: SANS, fontSize: 13, color: T.t2, cursor: "pointer" }}>{t("set_cancel")}</button>
                </div>
              </div>
            )}
          </Row>
          <SaveBtn id="profile" />
        </Section>

        <Section id="billing" title={t("set_billing")} desc="">
          <div style={{ background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 10, padding: 16, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, gap: 10 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 14, color: T.t1 }}>{(settingsPlan || "free").charAt(0).toUpperCase() + (settingsPlan || "free").slice(1)} Plan</span>
                  <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 3, background: T.surf3, color: T.t3, border: `1px solid ${T.bdr}` }}>{(settingsPlan || "FREE").toUpperCase()}</span>
                </div>
                <div style={{ fontFamily: SANS, fontSize: 12, color: T.t2 }}>Up to {limit} invoices/month</div>
              </div>
              <button onClick={onUpgrade} style={{ padding: "7px 12px", background: T.indigo, border: "none", borderRadius: 6, fontFamily: SANS, fontWeight: 600, fontSize: 12, color: "#fff", cursor: "pointer", flexShrink: 0 }}>{t("set_upgrade")}</button>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: SANS, fontSize: 12, color: T.t3, marginBottom: 6 }}>
              <span>Usage this month</span><span style={{ fontFamily: MONO }}>{used} / {limit}</span>
            </div>
            <div style={{ height: 4, background: T.surf3, borderRadius: 2 }}><div style={{ height: "100%", width: `${pct}%`, background: pct >= 90 ? T.red : T.indigo, borderRadius: 2 }} /></div>
          </div>
          <div style={{ fontFamily: SANS, fontSize: 13, color: T.t3 }}>Billing status: <span style={{ color: T.t2 }}>No active subscription</span></div>
        </Section>

        <Section id="integrations" title={t("set_integrations")} desc="">
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 8 }}>
            <Zap size={15} color={T.t3} strokeWidth={1.5} style={{ flexShrink: 0 }} />
            <span style={{ fontFamily: SANS, fontSize: 13, color: T.t2 }}>
              {t("set_manage_int")}{" "}
              <button
                onClick={onNavigateToIntegrations}
                style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: T.indigo, background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                {t("set_int_tab")}
              </button>
              {" "}{t("set_int_tab_suffix")}
            </span>
          </div>
        </Section>

        <Section id="team" title={t("set_team")} desc="">
          <div style={{ position: "relative", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ opacity: 0.2, pointerEvents: "none", userSelect: "none" }}>
              <div style={{ background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 8, padding: "12px 13px", marginBottom: 10 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <input placeholder="name@company.com" style={{ flex: 1, padding: "9px 12px", background: T.surf, border: `1px solid ${T.bdr}`, borderRadius: 6, fontFamily: SANS, fontSize: 13, color: T.t1 }} readOnly />
                  <button style={{ padding: "9px 12px", background: T.indigo, border: "none", borderRadius: 6, color: "#fff", cursor: "pointer", fontFamily: SANS, fontSize: 13, fontWeight: 600, flexShrink: 0 }}>Invite</button>
                </div>
              </div>
            </div>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: T.surf2, border: `1px solid ${T.bdr}`, display: "flex", alignItems: "center", justifyContent: "center" }}><Lock size={18} color={T.t3} strokeWidth={1.5} /></div>
              <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 14, color: T.t1 }}>Coming soon</div>
              <div style={{ fontFamily: SANS, fontSize: 12, color: T.t3, textAlign: "center", maxWidth: 220 }}>Team collaboration is on the roadmap.</div>
            </div>
          </div>
        </Section>

        <Section id="data" title={t("set_export")} desc="">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { label: t("set_export_invoices"),  fn: exportInvoices },
              { label: t("set_export_suppliers"), fn: exportSuppliers },
              { label: t("set_export_report"),    fn: exportReport },
            ].map(item => (
              <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 8 }}>
                <Download size={14} color={T.t2} strokeWidth={1.75} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: T.t1 }}>{item.label}</div>
                </div>
                <button onClick={item.fn} style={{ padding: "6px 12px", background: "transparent", border: `1px solid ${T.bdr}`, borderRadius: 5, fontFamily: SANS, fontSize: 12, fontWeight: 600, color: T.t1, cursor: "pointer", flexShrink: 0 }}>{t("set_export_btn")}</button>
              </div>
            ))}
          </div>
        </Section>

        <div ref={dangerRef} style={{ scrollMarginTop: 20 }}>
          <div style={{ background: T.redTint, border: `1px solid ${T.redBdr}`, borderRadius: 10, padding: "18px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
              <AlertTriangle size={13} color={T.red} strokeWidth={2} />
              <h2 style={{ fontFamily: SANS, fontWeight: 700, fontSize: 13, color: T.red }}>Danger Zone</h2>
            </div>
            <p style={{ fontFamily: SANS, fontSize: 13, color: T.t2, marginBottom: 14, lineHeight: 1.5 }}>These actions are permanent and cannot be undone.</p>
            {!showDeleteConfirm ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 13px", background: T.surf, border: `1px solid ${T.redBdr}`, borderRadius: 8 }}>
                <div>
                  <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: T.t1 }}>Delete account</div>
                  {!isMobile && <div style={{ fontFamily: SANS, fontSize: 11, color: T.t3 }}>Permanently delete your account and all data.</div>}
                </div>
                <button onClick={() => setShowDeleteConfirm(true)} style={{ padding: "6px 12px", background: "transparent", border: `1px solid ${T.redBdr}`, borderRadius: 5, fontFamily: SANS, fontSize: 12, fontWeight: 600, color: T.red, cursor: "pointer", flexShrink: 0 }}>Delete</button>
              </div>
            ) : (
              <div style={{ padding: 14, background: T.surf, border: `1px solid ${T.redBdr}`, borderRadius: 8 }}>
                <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, color: T.t1, marginBottom: 4 }}>Are you absolutely sure?</div>
                <p style={{ fontFamily: SANS, fontSize: 13, color: T.t2, marginBottom: 12, lineHeight: 1.5 }}>This will permanently delete your account and all data. <strong style={{ color: T.red }}>Cannot be undone.</strong></p>
                <label style={{ fontFamily: SANS, fontSize: 12, color: T.t3, display: "block", marginBottom: 6 }}>Type <strong style={{ fontFamily: MONO, color: T.red }}>DELETE</strong> to confirm</label>
                <input value={deleteInput} onChange={e => setDeleteInput(e.target.value)} placeholder="DELETE" style={{ ...inp, marginBottom: 10, border: `1px solid ${T.redBdr}` }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => { setShowDeleteConfirm(false); setDeleteInput(""); }} style={{ flex: 1, padding: "9px 0", background: "transparent", border: `1px solid ${T.bdr}`, borderRadius: 6, fontFamily: SANS, fontWeight: 600, fontSize: 13, color: T.t2, cursor: "pointer" }}>Cancel</button>
                  <button disabled={deleteInput !== "DELETE"} onClick={onSignOut} style={{ flex: 2, padding: "9px 0", background: deleteInput === "DELETE" ? T.red : T.redTint, border: `1px solid ${T.redBdr}`, borderRadius: 6, fontFamily: SANS, fontWeight: 700, fontSize: 13, color: deleteInput === "DELETE" ? "#fff" : T.redBdr, cursor: deleteInput === "DELETE" ? "pointer" : "not-allowed" }}>
                    Permanently delete
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Upgrade modal ─────────────────────────────────────────────────────────────
function UpgradeModal({ onClose, planUsed, planLimit, planPct }) {
  const T = useT();
  const { isMobile } = useLayout();
  const [billing, setBilling] = useState("monthly");
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState(null);
  const used = planUsed ?? 0, limit = planLimit ?? 20;
  const pct = planPct != null ? Math.round(planPct * 100) : Math.round((used / limit) * 100);

  const handleSubscribe = async (tier) => {
    setLoading(tier); setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ plan: tier, billing }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Subscription failed");
      if (data.url) window.location.href = data.url;
      else onClose();
    } catch (e) { setError(e.message); } finally { setLoading(null); }
  };
  const PLANS = { basic: { monthly: 99, annual: 79 }, pro: { monthly: 199, annual: 159 } };
  const FEATURES = [
    { label: "Manual upload + OCR",  basic: true, pro: true  },
    { label: "Dashboard & calendar", basic: true, pro: true  },
    { label: "50 invoices/month",    basic: true, pro: false },
    { label: "150 invoices/month",   basic: false,pro: true  },
    { label: "Auto-sync",            basic: false,pro: true  },
    { label: "Priority support",     basic: false,pro: true  },
  ];
  const modalBg = T.isDark ? "rgba(5,8,16,0.9)" : "rgba(15,23,42,0.6)";
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 500, background: modalBg, backdropFilter: "blur(6px)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", padding: isMobile ? 0 : 20, animation: "fadeIn 0.2s" }}>
      <div style={{ width: "100%", maxWidth: isMobile ? "100%" : 560, background: T.surf, border: `1px solid ${T.bdr2}`, borderRadius: isMobile ? "16px 16px 0 0" : 16, padding: isMobile ? "24px 20px" : "30px 26px", boxShadow: "0 20px 60px rgba(0,0,0,0.25)", animation: isMobile ? "slideUp 0.25s ease" : "scaleIn 0.2s cubic-bezier(.16,1,.3,1)", position: "relative", maxHeight: isMobile ? "90vh" : "none", overflowY: "auto" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 14, right: 16, background: "none", border: "none", color: T.t3, cursor: "pointer", display: "flex" }}><X size={18} /></button>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: isMobile ? 19 : 21, letterSpacing: "-0.03em", color: T.t1, marginBottom: 6 }}>You're growing. Your plan should too.</div>
          <p style={{ fontFamily: SANS, color: T.t2, fontSize: 13, lineHeight: 1.6 }}>You've processed <strong style={{ color: T.indigo }}>{used} invoices</strong> this month — great work.</p>
        </div>
        <div style={{ background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 8, padding: "12px 16px", marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontFamily: SANS, fontSize: 13, color: T.t2 }}>Invoices this month</span>
            <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, color: pct >= 100 ? T.red : pct >= 80 ? T.amber : T.t1 }}>{used} / {limit === Infinity ? "∞" : limit}</span>
          </div>
          <div style={{ height: 6, background: T.bdr2, borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: pct >= 100 ? T.red : pct >= 80 ? T.amber : T.indigo, borderRadius: 3, transition: "width 0.5s" }} />
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: SANS, fontSize: 12, color: T.t3, marginBottom: 6 }}><span>{used} processed</span><span>{limit} on Free</span></div>
          <div style={{ height: 5, background: T.surf3, borderRadius: 3 }}><div style={{ height: "100%", width: `${pct}%`, background: pct >= 90 ? T.red : T.indigo, borderRadius: 3 }} /></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 16 }}>
          <div style={{ display: "flex", background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 6, padding: 2 }}>
            {["monthly", "annual"].map(b => (
              <button key={b} onClick={() => setBilling(b)} style={{ padding: "5px 12px", borderRadius: 4, border: "none", cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: billing === b ? 600 : 400, background: billing === b ? T.surf : "transparent", color: billing === b ? T.t1 : T.t2, textTransform: "capitalize" }}>{b}</button>
            ))}
          </div>
          {billing === "annual" && <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: T.green, background: T.greenTint, border: `1px solid ${T.greenBdr}`, borderRadius: 3, padding: "2px 8px" }}>Save 20%</span>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div style={{ background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 10, padding: 14 }}>
            <div style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: T.t3, marginBottom: 5 }}>BASIC</div>
            <div style={{ marginBottom: 10 }}><span style={{ fontFamily: MONO, fontSize: 22, fontWeight: 500, color: T.t1 }}>₪{PLANS.basic[billing]}</span><span style={{ fontFamily: SANS, fontSize: 11, color: T.t3 }}>/mo</span></div>
            <button onClick={() => handleSubscribe("basic")} disabled={!!loading} style={{ width: "100%", padding: "9px 0", borderRadius: 6, background: T.surf, border: `1px solid ${T.bdr}`, color: T.t1, fontFamily: SANS, fontSize: 13, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", opacity: loading === "basic" ? 0.7 : 1 }}>{loading === "basic" ? "…" : "Get Basic"}</button>
          </div>
          <div style={{ background: T.indigoTint, border: `2px solid ${T.indigo}`, borderRadius: 10, padding: 14, position: "relative" }}>
            <div style={{ position: "absolute", top: -11, left: "50%", transform: "translateX(-50%)", background: T.indigo, color: "#fff", fontFamily: SANS, fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 100, whiteSpace: "nowrap" }}>Popular</div>
            <div style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: T.indigo, marginBottom: 5 }}>PRO</div>
            <div style={{ marginBottom: 10 }}><span style={{ fontFamily: MONO, fontSize: 22, fontWeight: 500, color: T.t1 }}>₪{PLANS.pro[billing]}</span><span style={{ fontFamily: SANS, fontSize: 11, color: T.t3 }}>/mo</span></div>
            <button onClick={() => handleSubscribe("pro")} disabled={!!loading} style={{ width: "100%", padding: "9px 0", borderRadius: 6, background: T.indigo, border: "none", color: "#fff", fontFamily: SANS, fontSize: 13, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", opacity: loading === "pro" ? 0.7 : 1 }}>{loading === "pro" ? "…" : "Get Pro"}</button>
          </div>
        </div>
        <div style={{ background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 8, overflow: "hidden", marginBottom: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 50px 50px", padding: "6px 12px", borderBottom: `1px solid ${T.bdr}` }}>
            {["", "Basic", "Pro"].map((h, i) => <span key={h} style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: i === 2 ? T.indigo : T.t3, textAlign: i > 0 ? "center" : "left" }}>{h}</span>)}
          </div>
          {FEATURES.map(f => (
            <div key={f.label} style={{ display: "grid", gridTemplateColumns: "1fr 50px 50px", padding: "5px 12px", borderTop: `1px solid ${T.bdr}` }}>
              <span style={{ fontFamily: SANS, fontSize: 12, color: T.t2 }}>{f.label}</span>
              <span style={{ display: "flex", justifyContent: "center" }}>{f.basic ? <Check size={12} color={T.green} strokeWidth={2.5} /> : <X size={12} color={T.bdr2} strokeWidth={2} />}</span>
              <span style={{ display: "flex", justifyContent: "center" }}>{f.pro ? <Check size={12} color={T.green} strokeWidth={2.5} /> : <X size={12} color={T.bdr2} strokeWidth={2} />}</span>
            </div>
          ))}
        </div>
        {error && <div style={{ fontFamily: SANS, fontSize: 12, color: T.red, background: T.redTint, border: `1px solid ${T.redBdr}`, borderRadius: 6, padding: "8px 12px", marginBottom: 8 }}>{error}</div>}
        <button onClick={onClose} style={{ display: "block", width: "100%", background: "none", border: "none", color: T.t3, fontFamily: SANS, fontSize: 13, cursor: "pointer", padding: "6px 0", textDecoration: "underline", textDecorationStyle: "dotted" }}>Continue viewing (read-only)</button>
      </div>
    </div>
  );
}

// ── App root ──────────────────────────────────────────────────────────────────
export default function App() {
  const { user, signOut, loading: authLoading } = useAuth();
  const isLoggedIn = !!user;

  const [isDark, setIsDark] = useState(true);
  const [lang, setLang] = useState("en");
  const t = useCallback((key, vars) => {
    const strings = lang === "he" ? heStrings : enStrings;
    let s = strings[key] || enStrings[key] || key;
    if (vars) Object.entries(vars).forEach(([k, v]) => { s = s.replace(`{${k}}`, v); });
    return s;
  }, [lang]);
  const [view, setView] = useState("dashboard");
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [calMonth, setCalMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [preSelectAll, setPreSelectAll] = useState(false);
  const [initialFilterStatus, setInitialFilterStatus] = useState(null);
  const [deepLinkInvoiceId, setDeepLinkInvoiceId] = useState(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [windowWidth, setWindowWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1280);
  const [editInvoice, setEditInvoice] = useState(null);
  const [showMissingModal, setShowMissingModal] = useState(false);
  const [showAnomalyModal, setShowAnomalyModal] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [extractMsg, setExtractMsg] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [appNotifs, setAppNotifs] = useState([]);
  const [oauthResult, setOauthResult] = useState(null);
  const fileRef = useRef();
  const notifiedJobsRef = useRef(new Set());

  // Real invoice data
  const {
    suppliers, computed: invoices, allNames, color,
    missingSuppliers, anomalyMap,
    addInvoice, updateInvoice, deleteInvoice,
    addSupplier, updateSupplier, deleteSupplier, getSupplier,
    refreshInvoices,
  } = useInvoiceData();

  // Real plan data
  const { plan, used: planUsed, limit: planLimit, pct: planPct, isAtLimit, refresh: refreshPlan } = usePlan();

  // Sync jobs for IntegrationsPage
  const { jobs: syncJobs, startSync, cancelSync } = useSyncJob({
    onBatchDone: refreshInvoices,
  });

  useEffect(() => {
    const h = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  useEffect(() => { if (windowWidth >= 1024) setMobileMenuOpen(false); }, [windowWidth]);

  useEffect(() => {
    const h = (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setShowSearch(true); } };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#\??/, ""));
    const code = params.get("code") || hashParams.get("code");
    const error = params.get("error") || hashParams.get("error");
    if (code || error) {
      setOauthResult({ code, error });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const addAppNotif = useCallback((notif) => {
    setAppNotifs(prev => [{ ...notif, id: Date.now() + Math.random() }, ...prev].slice(0, 20));
  }, []);

  useEffect(() => {
    Object.values(syncJobs).forEach(job => {
      const key = job.jobId || job.integrationId;
      if (!key || notifiedJobsRef.current.has(key)) return;
      if (job.done) {
        notifiedJobsRef.current.add(key);
        addAppNotif({ type: "sync", icon: "✓", text: `${job.integrationId || "Drive"} sync complete — ${job.added ?? 0} invoice${job.added !== 1 ? "s" : ""} added`, ts: Date.now() });
      } else if (job.error) {
        notifiedJobsRef.current.add(key);
        addAppNotif({ type: "error", icon: "⚠", text: `Sync error: ${String(job.error).slice(0, 80)}`, ts: Date.now() });
      }
    });
  }, [syncJobs, addAppNotif]);

  const isMobile = windowWidth < 640;
  const isTablet = windowWidth >= 640 && windowWidth < 1024;
  const T = isDark ? DARK : LIGHT;

  // Derive chart data from real invoices
  const getSupplierColor = useCallback((name) => {
    const idx = allNames.indexOf(name);
    return PALETTE[idx >= 0 ? idx % PALETTE.length : 0];
  }, [allNames]);

  const chartData = (() => {
    const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const map = {};
    invoices.forEach(inv => {
      if (!inv.dueDate) return;
      const d = new Date(inv.dueDate + "T12:00:00");
      const key = `${MONTHS[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
      if (!map[key]) map[key] = { month: key, _year: d.getFullYear(), _mon: d.getMonth() };
      map[key][inv.supplier] = (map[key][inv.supplier] || 0) + Number(inv.amount || 0);
    });
    return Object.values(map)
      .sort((a, b) => a._year !== b._year ? a._year - b._year : a._mon - b._mon)
      .map(m => {
        const { _year, _mon, ...rest } = m;
        const total = Object.entries(rest)
          .filter(([k]) => k !== "month")
          .reduce((s, [, v]) => s + v, 0);
        return { ...rest, total };
      });
  })();

  const handlePayAll = () => { setSelectedMonth(selectedMonth); setPreSelectAll(true); setView("invoices"); };
  const handleViewMonth = (monthLabel) => {
    if (monthLabel) {
      // Parse "Jun '26" → "2026-06"
      const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const m = monthLabel.match(/^(\w{3})\s+'(\d{2})$/);
      if (m) {
        const mi = MONTHS.indexOf(m[1]);
        if (mi >= 0) setSelectedMonth(`20${m[2]}-${String(mi + 1).padStart(2, "0")}`);
      }
    }
    setView("invoices");
  };
  const handleMarkPaid = useCallback((id) => {
    const inv = invoices.find(i => i.id === id);
    const isPaid = inv?.status === "Paid" || inv?.status === "paid";
    updateInvoice(id, { status: isPaid ? "Unpaid" : "Paid" });
  }, [updateInvoice, invoices]);
  const handleBulkPaid = useCallback((ids) => { ids.forEach(id => updateInvoice(id, { status: "Paid" })); }, [updateInvoice]);
  const handleBulkUnpaid = useCallback((ids) => { ids.forEach(id => updateInvoice(id, { status: "Unpaid" })); }, [updateInvoice]);
  useEffect(() => { if (preSelectAll) { const t = setTimeout(() => setPreSelectAll(false), 100); return () => clearTimeout(t); } }, [preSelectAll]);
  useEffect(() => { if (view !== "invoices") { setInitialFilterStatus(null); setDeepLinkInvoiceId(null); } }, [view]);

  // Upload handler — full pipeline: PDF/image → Claude extraction → dedup → R2/Supabase storage → addInvoice
  const handleUpload = useCallback(async (e) => {
    const files = Array.from(e?.target?.files || []);
    if (!files.length) return;
    setExtracting(true);
    setExtractMsg({ text: `Processing ${files.length} file${files.length > 1 ? "s" : ""}…`, ok: null });
    try {
      const { processPdf, fileToBase64, extractInvoice, translateSupplierName } = await import("./utils/image");
      const { findDuplicates, isLatinOnly } = await import("./utils/invoice");
      const { calcDueDate, correctSwappedDate } = await import("./utils/dates");
      const { STATUS } = await import("./constants");
      const { data: { session } } = await supabase.auth.getSession();

      const existingNames = new Set(invoices.map(i => i.source_file).filter(Boolean).map(n => n.toLowerCase()));
      const [toExtract, fileSkipped] = files.reduce(([ok, skip], f) =>
        existingNames.has(f.name.toLowerCase()) ? [ok, [...skip, f]] : [[...ok, f], skip], [[], []]);

      const imageResults = await Promise.allSettled(
        toExtract.map(f => f.type === "application/pdf" ? processPdf(f) : fileToBase64(f).then(img => [img]))
      );
      const pageUnits = [];
      imageResults.forEach((r, i) => {
        if (r.status === "rejected") pageUnits.push({ file: toExtract[i], error: r.reason });
        else r.value.forEach(pageImage => pageUnits.push({ file: toExtract[i], pageImage }));
      });
      const extractResults = await Promise.allSettled(
        pageUnits.map(unit => {
          if (unit.error) return Promise.reject(new Error(`${unit.file.name}: ${unit.error.message}`));
          return extractInvoice(unit.pageImage).then(ex => ({ file: unit.file, ex }));
        })
      );
      const candidates = [], errors = [];
      await Promise.allSettled(extractResults.map(async (r, i) => {
        if (r.status === "rejected") { errors.push(r.reason?.message || `${pageUnits[i].file.name}: failed`); return; }
        const { file, ex } = r.value;
        const invoiceDate = correctSwappedDate(ex.invoiceDate) || ex.invoiceDate || "";
        let sup = getSupplier(ex.supplier);
        if (!sup && isLatinOnly(ex.supplier)) {
          const hebrew = await translateSupplierName(ex.supplier);
          if (hebrew) sup = getSupplier(hebrew) || null;
        }
        const isCredit = ex.type === "credit";
        const rawAmount = Math.abs(Number(ex.amount)) || 0;
        const due = isCredit ? null : calcDueDate(invoiceDate, sup);
        candidates.push({ file, candidate: {
          supplier: sup?.name || ex.supplier || "",
          invoice_no: ex.invoiceNo || "",
          invoice_date: invoiceDate,
          amount: isCredit ? -rawAmount : rawAmount,
          due_date: isCredit ? "" : (due ? due.toISOString().split("T")[0] : ""),
          status: isCredit ? STATUS.CREDIT : STATUS.UNPAID,
          invoice_type: isCredit ? "credit" : "invoice",
          notes: "",
          source_file: file.name,
        }});
      }));
      const withTempIds = candidates.map((c, i) => ({ ...c.candidate, id: `__new_${i}`, invoiceNo: c.candidate.invoice_no, invoiceDate: c.candidate.invoice_date }));
      const dupeSet = findDuplicates([...invoices, ...withTempIds]);
      const toAdd = candidates.filter((_, i) => !dupeSet.has(`__new_${i}`));
      const contentDupes = candidates.length - toAdd.length;

      let added = 0, attachmentIssues = 0;
      await Promise.allSettled(toAdd.map(async ({ file, candidate }) => {
        try {
          let attachment = {};
          try {
            const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
            const presignRes = await fetch('/api/attachments/presign', {
              method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
              body: JSON.stringify({ filename: file.name, contentType: file.type }),
            });
            if (presignRes.ok) {
              const presign = await presignRes.json();
              if (presign.backend === 'r2' && presign.uploadUrl) {
                await fetch(presign.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
                attachment = { attachment_path: presign.key, attachment_backend: 'r2', attachment_status: 'present' };
              } else {
                const key = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
                await supabase.storage.from('attachments').upload(key, file, { contentType: file.type, upsert: true });
                attachment = { attachment_path: key, attachment_backend: 'supabase', attachment_status: 'present' };
              }
            }
          } catch { attachment = { attachment_status: 'missing' }; attachmentIssues++; }
          await addInvoice({ ...candidate, ...attachment });
          added++;
        } catch (err) { errors.push(`${file.name}: ${err.message}`); }
      }));

      if (added > 0) { refreshPlan(); addAppNotif({ type: "upload", icon: "📄", text: `${added} invoice${added !== 1 ? "s" : ""} uploaded from ${files.length === 1 ? files[0].name : `${files.length} files`}`, ts: Date.now() }); }
      const parts = [];
      if (added) parts.push(`${added} added`);
      if (fileSkipped.length) parts.push(`${fileSkipped.length} already uploaded`);
      if (contentDupes) parts.push(`${contentDupes} already exist`);
      if (attachmentIssues) parts.push(`${attachmentIssues} saved without file`);
      if (errors.length) parts.push(`${errors.length} failed: ${errors[0]}`);
      const hasIssue = fileSkipped.length || contentDupes || attachmentIssues || errors.length;
      setExtractMsg({ text: (added && !hasIssue ? "✓ " : "") + (parts.join(" · ") || "nothing to add"), ok: !hasIssue && added > 0 });
    } catch (err) {
      setExtractMsg({ text: `Error: ${err.message}`, ok: false });
    } finally {
      setExtracting(false);
      setTimeout(() => setExtractMsg(null), 5000);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [invoices, user, addInvoice, getSupplier, refreshPlan]);

  if (authLoading) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#07090F", color: "#627488", fontFamily: SANS, fontSize: 14 }}>Loading…</div>;
  }

  if (!isLoggedIn) {
    return (
      <LayoutCtx.Provider value={{ isMobile, isTablet }}>
        <style>{`*, *::before, *::after { box-sizing:border-box; margin:0; padding:0 } body { font-family:${SANS}; -webkit-font-smoothing:antialiased; background:#07090F; } input::placeholder { color:#334155 } @keyframes kpiIn { from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)} }`}</style>
        <LoginScreen onLogin={() => {}} />
      </LayoutCtx.Provider>
    );
  }

  return (
    <ThemeCtx.Provider value={T}>
      <LayoutCtx.Provider value={{ isMobile, isTablet }}>
        <LangCtx.Provider value={{ lang, t }}>
        <div style={{ display: "flex", minHeight: "100vh", background: T.bg, fontFamily: SANS, color: T.t1, direction: lang === "he" ? "rtl" : "ltr" }}>
          <style>{`
            @keyframes slideUp    { from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none} }
            @keyframes slideRight { from{opacity:0;transform:translateX(-100%)}to{opacity:1;transform:none} }
            @keyframes fadeIn     { from{opacity:0}to{opacity:1} }
            @keyframes scaleIn    { from{opacity:0;transform:scale(.97)}to{opacity:1;transform:none} }
            @keyframes confettiFall { 0%{transform:translateY(0) rotate(0);opacity:1} 100%{transform:translateY(-130px) rotate(480deg);opacity:0} }
            @keyframes kpiIn { from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)} }
            *, *::before, *::after { box-sizing:border-box; margin:0; padding:0 }
            ::-webkit-scrollbar{width:5px;height:5px}
            ::-webkit-scrollbar-track{background:transparent}
            ::-webkit-scrollbar-thumb{background:${T.isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.12)"};border-radius:3px}
            input:focus,select:focus { border-color:${T.indigo} !important; outline:none; }
            button:focus-visible { outline:2px solid ${T.indigo}; outline-offset:2px; }
          `}</style>

          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" multiple style={{ display: "none" }} onChange={handleUpload} />

          {extractMsg && (
            <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: extractMsg.ok === null ? T.surf : extractMsg.ok ? T.greenTint : T.redTint, border: `1px solid ${extractMsg.ok === null ? T.bdr : extractMsg.ok ? T.greenBdr : T.redBdr}`, color: extractMsg.ok === null ? T.t1 : extractMsg.ok ? T.green : T.red, padding: "10px 20px", borderRadius: 8, fontFamily: SANS, fontSize: 13, boxShadow: "0 4px 20px rgba(0,0,0,0.3)", whiteSpace: "nowrap" }}>
              {extracting && "⟳ "}{extractMsg.text}
            </div>
          )}

          <Sidebar view={view} setView={setView} suppliersCount={suppliers.length}
            onUpgrade={() => setShowUpgrade(true)} onUpload={() => fileRef.current?.click()}
            mobileOpen={mobileMenuOpen} setMobileOpen={setMobileMenuOpen}
            plan={plan} planUsed={planUsed} planLimit={planLimit} planPct={planPct} user={user} onSignOut={signOut} />

          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
            <GlobalHeader view={view} isDark={isDark} onToggleTheme={() => setIsDark(v => !v)} onToggleLang={() => setLang(l => l === "he" ? "en" : "he")} lang={lang} onMenuOpen={() => setMobileMenuOpen(true)} onMissingAlert={() => setShowMissingModal(true)} onAnomalyAlert={() => setShowAnomalyModal(true)} missingCount={missingSuppliers?.length || 0} anomalyCount={anomalyMap?.size || 0} syncJobs={syncJobs} appNotifs={appNotifs} onClearAppNotifs={() => setAppNotifs([])} onSearchOpen={() => setShowSearch(true)} />
            {isAtLimit && (
              <UsageBanner plan={plan} used={planUsed} limit={planLimit} remaining={planLimit - planUsed} onUpgrade={() => setShowUpgrade(true)} />
            )}
            <main style={{ flex: 1, overflowY: "auto", padding: isMobile ? "20px 16px 100px" : "28px clamp(20px,3vw,36px) 80px" }}>
              <div style={{ width: "100%" }}>
                {view === "dashboard"    && <Dashboard invoices={invoices} onPayAllJuly={handlePayAll} chartData={chartData} supplierNames={allNames} supplierColor={getSupplierColor} user={user} onMissingAlert={() => setShowMissingModal(true)} onAnomalyAlert={() => setShowAnomalyModal(true)} missingSuppliers={missingSuppliers} anomalyMap={anomalyMap} onViewMonth={handleViewMonth} onNavigateFiltered={(status) => { setView("invoices"); setInitialFilterStatus(status); }} />}
                {view === "invoices"     && <InvoicesView invoices={invoices} selectedMonth={selectedMonth} onMonthChange={setSelectedMonth} onMarkPaid={handleMarkPaid} onBulkPaid={handleBulkPaid} onBulkUnpaid={handleBulkUnpaid} preSelectAll={preSelectAll} onEditInvoice={setEditInvoice} anomalyMap={anomalyMap} missingSuppliers={missingSuppliers} initialFilterStatus={initialFilterStatus} initialSelectedId={deepLinkInvoiceId} onViewAttachment={async (inv) => { try { const { data: { session } } = await supabase.auth.getSession(); const res = await fetch(`/api/invoices/${inv.id}/attachment-url`, { headers: { Authorization: `Bearer ${session?.access_token}` } }); if (res.ok) { const { url } = await res.json(); setPreviewAttachment({ url, filename: inv.source_file || inv.attachment_path?.split('/').pop() || 'invoice' }); } } catch(e) { console.error('attachment-url:', e); } }} />}
                {view === "calendar"     && <CalendarView computed={invoices} calMonth={calMonth} setCalMonth={setCalMonth} color={getSupplierColor} />}
                {view === "integrations" && <IntegrationsPage
                  syncJobs={syncJobs} onStartSync={startSync} onCancelSync={cancelSync}
                  onInvoicesRefresh={refreshInvoices} isAtLimit={isAtLimit} onUpgrade={() => setShowUpgrade(true)}
                  oauthResult={oauthResult} onClearOAuthResult={() => setOauthResult(null)}
                  onNotificationsRefresh={() => addAppNotif({ type: "sync", icon: "✓", text: "Integration connected successfully", ts: Date.now() })}
                />}
                {view === "suppliers"    && <SuppliersView suppliers={suppliers} onAdd={addSupplier} onUpdate={updateSupplier} onDelete={deleteSupplier} />}
                {view === "settings"     && <SettingsScreen onUpgrade={() => setShowUpgrade(true)} onSignOut={signOut} user={user} invoices={invoices} suppliers={suppliers} onNavigateToIntegrations={() => setView("integrations")} />}
                {view === "admin"        && <AdminPage />}
              </div>
            </main>
          </div>

          {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} planUsed={planUsed} planLimit={planLimit} planPct={planPct} />}

          {editInvoice && (
            <EditInvoiceModal
              editInvoice={editInvoice}
              setEditInvoice={setEditInvoice}
              suppliers={suppliers}
              addInvoice={addInvoice}
              updateInvoice={updateInvoice}
              getSupplier={getSupplier}
              onViewAttachment={att => setPreviewAttachment(att)}
              anomaly={anomalyMap?.get(editInvoice?.supplier)}
            />
          )}

          {previewAttachment && (
            <AttachmentPreviewModal
              url={previewAttachment.url}
              filename={previewAttachment.filename}
              onClose={() => setPreviewAttachment(null)}
            />
          )}

          {showSearch && (
            <SearchOverlay
              invoices={invoices}
              suppliers={suppliers}
              onNavigate={(v, month, invId) => { setView(v); if (month) setSelectedMonth(month); if (invId) setDeepLinkInvoiceId(invId); }}
              onClose={() => setShowSearch(false)}
            />
          )}

          {showMissingModal && missingSuppliers?.length > 0 && (
            <MissingSuppliersModal
              missingSuppliers={missingSuppliers}
              invoices={invoices}
              suppliers={suppliers}
              onClose={() => setShowMissingModal(false)}
              lang={lang}
            />
          )}

          {showAnomalyModal && anomalyMap?.size > 0 && (
            <AnomalyModal
              anomalyMap={anomalyMap}
              computed={invoices}
              invoices={invoices}
              onClose={() => setShowAnomalyModal(false)}
              onEditInvoice={setEditInvoice}
              lang={lang}
            />
          )}
        </div>
        </LangCtx.Provider>
      </LayoutCtx.Provider>
    </ThemeCtx.Provider>
  );
}
