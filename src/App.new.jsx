import React, {
  useState, useEffect, useCallback, useRef,
  createContext, useContext,
} from "react";
import { useAuth }        from "./contexts/AuthContext";
import { supabase }       from "./lib/supabase";
import { useInvoiceData } from "./hooks/useInvoiceData";
import { usePlan }        from "./hooks/usePlan";
import CalendarView       from "./components/CalendarView";
import EditInvoiceModal   from "./components/EditInvoiceModal";
import { MissingSuppliersModal } from "./components/AlertModals";
import { PALETTE }        from "./constants";
import {
  LayoutDashboard, FileText, Calendar, Zap, Bell, Upload,
  TrendingUp, AlertTriangle, Clock, CheckCircle2,
  ChevronRight, ChevronLeft, ChevronDown, Filter, X, Users,
  Paperclip, Trash2, Pencil, Check, Plus, Search,
  ArrowUpRight, ArrowDownRight, Settings, Sun, Moon,
  Wifi, WifiOff, RefreshCw, Globe, Download, Lock,
  Building2, CreditCard, User, Eye, EyeOff, Menu,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
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

// Sidebar always dark
const SB = { bg: "#0C1017", bdr: "rgba(255,255,255,0.07)", t1: "#CBD6E6", t2: "rgba(255,255,255,0.35)", t3: "rgba(255,255,255,0.28)" };

// ── Data ──────────────────────────────────────────────────────────────────────
const INITIAL_INVOICES = [
  { id: 1,  supplier: "Acme Corp",  invoiceNo: "INV-2024-0891", amount: 18000, invoiceDate: "2024-06-01", dueDate: "2024-07-15", status: "unpaid"  },
  { id: 2,  supplier: "BuildRight", invoiceNo: "INV-2024-0892", amount: 12500, invoiceDate: "2024-05-20", dueDate: "2024-07-08", status: "overdue", attachment: true },
  { id: 3,  supplier: "TechParts",  invoiceNo: "INV-2024-0893", amount: 22000, invoiceDate: "2024-06-10", dueDate: "2024-07-22", status: "unpaid"  },
  { id: 4,  supplier: "MediaPro",   invoiceNo: "INV-2024-0894", amount:  8400, invoiceDate: "2024-05-15", dueDate: "2024-07-30", status: "overdue" },
  { id: 5,  supplier: "Acme Corp",  invoiceNo: "INV-2024-0895", amount:  9500, invoiceDate: "2024-06-18", dueDate: "2024-07-28", status: "unpaid"  },
  { id: 6,  supplier: "BuildRight", invoiceNo: "INV-2024-0896", amount: 15000, invoiceDate: "2024-06-25", dueDate: "2024-08-05", status: "unpaid"  },
  { id: 7,  supplier: "TechParts",  invoiceNo: "INV-2024-0897", amount:  6200, invoiceDate: "2024-05-01", dueDate: "2024-08-15", status: "unpaid"  },
  { id: 8,  supplier: "MediaPro",   invoiceNo: "INV-2024-0898", amount: 11800, invoiceDate: "2024-06-05", dueDate: "2024-08-10", status: "unpaid", attachment: true },
  { id: 9,  supplier: "Acme Corp",  invoiceNo: "INV-2024-0887", amount: 16200, invoiceDate: "2024-05-01", dueDate: "2024-06-15", status: "paid"    },
  { id: 10, supplier: "BuildRight", invoiceNo: "INV-2024-0888", amount:  9800, invoiceDate: "2024-05-10", dueDate: "2024-06-20", status: "paid"    },
];
const INITIAL_SUPPLIERS = [
  { id: 1, name: "Acme Corp",  terms: "shotef_plus(30)", notes: "Main supplier"  },
  { id: 2, name: "BuildRight", terms: "shotef",          notes: ""               },
  { id: 3, name: "TechParts",  terms: "shotef_plus(45)", notes: "Quarterly"      },
  { id: 4, name: "MediaPro",   terms: "immediate",       notes: "Pay on receipt" },
];
const CHART_DATA = [
  { month: "Feb", "Acme Corp": 15000, "BuildRight": 10000, "MediaPro": 13200, "TechParts": 0,     total: 38200 },
  { month: "Mar", "Acme Corp": 20400, "BuildRight": 19000, "MediaPro": 0,     "TechParts": 22000, total: 61400 },
  { month: "Apr", "Acme Corp": 0,     "BuildRight": 15000, "MediaPro": 14800, "TechParts": 0,     total: 29800 },
  { month: "May", "Acme Corp": 22100, "BuildRight": 0,     "MediaPro": 15000, "TechParts": 18000, total: 55100 },
  { month: "Jun", "Acme Corp": 16000, "BuildRight": 21300, "MediaPro": 0,     "TechParts": 10000, total: 47300 },
  { month: "Jul", "Acme Corp": 27500, "BuildRight": 12500, "MediaPro": 8400,  "TechParts": 22000, total: 70400 },
];
const SUPPLIER_COLORS = {
  "Acme Corp": "#6366F1", "BuildRight": "#10B981", "TechParts": "#F59E0B", "MediaPro": "#EF4444",
};

// ── Utils ─────────────────────────────────────────────────────────────────────
const fmt = (n) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);
const nextMonthYM = (ym) => { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const fmtMonth = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }); };
const fmtDate = (d) => { if (!d) return "—"; return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); };

// ── StatusBadge ───────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const T = useT();
  const MAP = {
    unpaid:  { label: "Unpaid",  bg: T.surf3,     color: T.t2,    border: T.bdr     },
    overdue: { label: "Overdue", bg: T.redTint,   color: T.red,   border: T.redBdr  },
    paid:    { label: "Paid",    bg: T.greenTint, color: T.green, border: T.greenBdr},
    credit:  { label: "Credit",  bg: T.indigoTint,color: T.indigo,border: T.indigoBdr},
  };
  const c = MAP[status] || MAP.unpaid;
  return <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 10px", borderRadius: 20, fontFamily: SANS, fontSize: 11, fontWeight: 600, background: c.bg, color: c.color, whiteSpace: "nowrap" }}>{c.label}</span>;
}

// ── ChartTooltip ──────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  const T = useT();
  if (!active || !payload?.length) return null;
  const filtered = payload.filter(p => p.value > 0);
  if (!filtered.length) return null;
  return (
    <div style={{ background: T.isDark ? "#131D2E" : T.surf2, border: `1px solid ${T.bdr2}`, borderRadius: 10, padding: "12px 16px", boxShadow: T.isDark ? "0 16px 48px rgba(0,0,0,.6)" : "0 4px 12px rgba(0,0,0,0.1)", minWidth: 152 }}>
      <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 500, color: T.t2, marginBottom: 8 }}>{label}</div>
      {filtered.map(p => (
        <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <div style={{ width: 6, height: 6, borderRadius: 1, background: p.fill, flexShrink: 0 }} />
          <span style={{ fontFamily: SANS, fontSize: 12, color: T.t2, flex: 1 }}>{p.name}</span>
          <span style={{ fontFamily: MONO, fontSize: 12, color: T.t1, fontWeight: 500 }}>{fmt(p.value)}</span>
        </div>
      ))}
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

  const handleGoogle = async () => { setLoading(true); await supabase.auth.signInWithOAuth({ provider: 'google' }); setLoading(false); };
  const handleEmail = async (e) => { e.preventDefault(); setLoading(true); const { error } = await supabase.auth.signInWithPassword({ email, password }); setLoading(false); if (error) alert(error.message); };
  const inp = { width: "100%", padding: "10px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 7, fontFamily: SANS, fontSize: 14, color: "#F1F5F9", outline: "none" };

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
          ].map((c, i) => (
            <div key={i} className="login-float-card" style={{ left: c.left, bottom: "-120px", "--dur": c.dur, "--del": c.del, "--rot": c.rot, zIndex: 1 }}>
              <div style={{ background: "rgba(17,24,39,0.85)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 10, padding: "10px 14px", backdropFilter: "blur(12px)", minWidth: 170 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: c.iColor, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontWeight: 700, fontSize: 10, color: "#fff", flexShrink: 0 }}>{c.init}</div>
                  <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 500, color: "#B8CAE0" }}>{c.sup}</span>
                </div>
                <div style={{ fontFamily: SANS, fontSize: 18, fontWeight: 600, color: "#E8EFF8", letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", marginBottom: 7 }}>{c.amt}</div>
                <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 600, color: c.sColor, background: c.sBg, padding: "2px 8px", borderRadius: 20 }}>{c.status}</span>
              </div>
            </div>
          ))}
          <div style={{ position: "relative", zIndex: 3, display: "flex", flexDirection: "column", height: "100%", padding: "40px 48px 40px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
              <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: "clamp(26px,3vw,40px)", letterSpacing: "-0.04em", lineHeight: 1.15, color: "#E8EFF8", marginBottom: 14 }}>
                Every invoice.<br />Always on time.
              </div>
              <p style={{ fontFamily: SANS, fontSize: 14, lineHeight: 1.75, color: "#627488", maxWidth: 320 }}>
                Cashflow syncs invoices from Drive, Gmail, and WhatsApp — then schedules payments automatically so nothing slips through.
              </p>
            </div>
            <div style={{ display: "flex", gap: 0, borderTop: "1px solid rgba(255,255,255,.06)", paddingTop: 24 }}>
              {[["₪2.4M", "processed monthly"], ["48 hrs", "saved per user"], ["4.8★", "200+ businesses"]].map(([v, l], i) => (
                <div key={l} style={{ flex: 1, paddingRight: 16, borderRight: i < 2 ? "1px solid rgba(255,255,255,.06)" : "none", paddingLeft: i > 0 ? 16 : 0 }}>
                  <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 20, color: "#6366F1", letterSpacing: "-0.03em", marginBottom: 3, fontVariantNumeric: "tabular-nums" }}>{v}</div>
                  <div style={{ fontFamily: SANS, fontSize: 11, color: "#4A6278", lineHeight: 1.4 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <div style={{ flex: 1, background: isMobile ? "#07090F" : "#0C1017", display: "flex", alignItems: "center", justifyContent: "center", padding: isMobile ? "40px 24px" : "48px 40px", position: "relative" }}>
        {isMobile && <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(99,102,241,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.05) 1px, transparent 1px)", backgroundSize: "36px 36px", pointerEvents: "none" }} />}
        {isMobile && <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 50% at 50% 20%, rgba(99,102,241,0.12) 0%, transparent 60%)", pointerEvents: "none" }} />}
        <div style={{ width: "100%", maxWidth: isMobile ? "100%" : 380, position: "relative", zIndex: 1 }}>
          {isMobile && (
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 32 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: "#6366F1", display: "flex", alignItems: "center", justifyContent: "center" }}><TrendingUp size={13} color="#fff" strokeWidth={2.5} /></div>
              <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 17, color: "#F8FAFC" }}>Cashflow</span>
            </div>
          )}
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontFamily: SANS, fontWeight: 700, fontSize: isMobile ? 22 : 24, letterSpacing: "-0.03em", color: "#F1F5F9", marginBottom: 6 }}>{mode === "signin" ? "Welcome back" : "Create your account"}</h1>
            <p style={{ fontFamily: SANS, fontSize: 14, color: "#64748B" }}>{mode === "signin" ? "Sign in to your Cashflow workspace." : "Start managing invoices in minutes."}</p>
          </div>
          <button onClick={handleGoogle} disabled={loading} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "11px 0", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 7, cursor: loading ? "not-allowed" : "pointer", fontFamily: SANS, fontWeight: 500, fontSize: 14, color: "#F1F5F9", marginBottom: 18, opacity: loading ? 0.7 : 1 }}>
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
              <label style={{ fontFamily: SANS, fontSize: 12, fontWeight: 500, color: "#64748B", display: "block", marginBottom: 5 }}>Email address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" required style={inp} />
            </div>
            <div>
              <label style={{ fontFamily: SANS, fontSize: 12, fontWeight: 500, color: "#64748B", display: "block", marginBottom: 5 }}>Password</label>
              <div style={{ position: "relative" }}>
                <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required style={{ ...inp, paddingRight: 40 }} />
                <button type="button" onClick={() => setShowPw(v => !v)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#475569", cursor: "pointer", display: "flex", alignItems: "center" }}>
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} style={{ padding: "11px 0", background: "#6366F1", border: "none", borderRadius: 7, fontFamily: SANS, fontWeight: 600, fontSize: 14, color: "#fff", cursor: loading ? "not-allowed" : "pointer", marginTop: 4, opacity: loading ? 0.7 : 1 }}>
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
function Sidebar({ view, setView, suppliersCount, onUpgrade, onUpload, mobileOpen, setMobileOpen }) {
  const { isMobile, isTablet } = useLayout();
  const isDrawer = isMobile || isTablet;
  const used = 18, limit = 20, pct = Math.round((used / limit) * 100);
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
    { id: "dashboard",    label: "Dashboard",    Icon: LayoutDashboard },
    { id: "invoices",     label: "Invoices",     Icon: FileText        },
    { id: "calendar",     label: "Calendar",     Icon: Calendar        },
    { id: "integrations", label: "Integrations", Icon: Zap             },
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
          <button onClick={() => { onUpload(); if (isDrawer) setMobileOpen(false); }} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "9px 14px", borderRadius: 8, background: "#6366F1", border: "none", cursor: "pointer", fontFamily: SANS, fontWeight: 600, fontSize: 13, color: "#fff", letterSpacing: "-0.01em" }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Upload Invoice
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
          {navItem("suppliers", "Suppliers", Users, suppliersCount)}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ padding: "12px" }}>
          <div style={{ background: "rgba(99,102,241,.08)", border: "1px solid rgba(99,102,241,.18)", borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
              <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, color: "#818CF8", letterSpacing: "0.08em" }}>FREE PLAN</span>
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
            <div style={{ width: 26, height: 26, borderRadius: "50%", background: "linear-gradient(135deg,#6366F1,#818CF8)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontWeight: 700, fontSize: 10, color: "#fff", flexShrink: 0 }}>AK</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: SANS, fontSize: 12, fontWeight: 500, color: SB.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Alex K.</div>
              <div style={{ fontFamily: SANS, fontSize: 10, color: SB.t2 }}>Settings</div>
            </div>
            <Settings size={12} color={SB.t2} />
          </button>
        </div>
      </div>
    </>
  );
}

// ── Global header ─────────────────────────────────────────────────────────────
function GlobalHeader({ view, isDark, onToggleTheme, onMenuOpen }) {
  const T = useT();
  const { isMobile, isTablet } = useLayout();
  const TITLES = { dashboard: "Dashboard", invoices: "Invoices", calendar: "Calendar", integrations: "Integrations", suppliers: "Suppliers", settings: "Settings" };
  const headerBg = T.isDark ? "#0C1017" : T.surf;
  const ghostBtn = { width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: `1px solid ${T.isDark ? "rgba(255,255,255,.10)" : T.bdr}`, borderRadius: 8, cursor: "pointer", color: T.isDark ? "rgba(255,255,255,.4)" : T.t2, flexShrink: 0 };
  return (
    <div style={{ height: 52, background: headerBg, borderBottom: `1px solid ${T.bdr}`, display: "flex", alignItems: "center", paddingLeft: isMobile ? 14 : 24, paddingRight: isMobile ? 12 : 24, gap: 10, flexShrink: 0 }}>
      {(isMobile || isTablet) && <button onClick={onMenuOpen} style={{ ...ghostBtn, border: "none" }}><Menu size={18} /></button>}
      <span style={{ fontFamily: SANS, fontWeight: 500, fontSize: isMobile ? 14 : 15, letterSpacing: "-0.015em", color: T.isDark ? "#E8EFF8" : T.t1 }}>{TITLES[view] || ""}</span>
      <div style={{ flex: 1 }} />
      {!isMobile && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 12px", background: T.isDark ? "rgba(255,255,255,.04)" : T.surf2, border: `1px solid ${T.isDark ? "rgba(255,255,255,.08)" : T.bdr}`, borderRadius: 8, height: 34, cursor: "pointer", minWidth: 180 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.isDark ? "rgba(255,255,255,.25)" : T.t3} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <span style={{ fontFamily: SANS, fontSize: 13, color: T.isDark ? "rgba(255,255,255,.25)" : T.t3, flex: 1 }}>Search anything…</span>
          <kbd style={{ fontFamily: SANS, fontSize: 10, color: T.isDark ? "rgba(255,255,255,.2)" : T.t3, background: T.isDark ? "rgba(255,255,255,.06)" : T.surf3, border: `1px solid ${T.isDark ? "rgba(255,255,255,.09)" : T.bdr}`, borderRadius: 4, padding: "2px 6px" }}>⌘K</kbd>
        </div>
      )}
      <button onClick={() => {}} style={ghostBtn}><Globe size={13} /></button>
      <button onClick={onToggleTheme} style={ghostBtn}>{isDark ? <Sun size={14} /> : <Moon size={14} />}</button>
      <button style={{ position: "relative", ...ghostBtn }}>
        <Bell size={14} />
        <span style={{ position: "absolute", top: 7, right: 7, width: 6, height: 6, background: "#EF4444", borderRadius: "50%", border: `1.5px solid ${headerBg}` }} />
      </button>
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KPICard({ label, value, valueColor, iconBg, iconColor, iconPath, pill, context, delay }) {
  const T = useT();
  const { isMobile } = useLayout();
  const pad = isMobile ? "14px 14px" : "20px";
  const numSize = isMobile ? 22 : 30;
  const gap = isMobile ? 10 : 14;
  return (
    <div style={{ background: T.surf, border: `1px solid ${T.bdr}`, borderRadius: 12, padding: pad, display: "flex", flexDirection: "column", gap, animation: "kpiIn 0.38s ease forwards", animationDelay: `${delay}s`, opacity: 0, minWidth: 0 }}>
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
const ArrowUp = () => <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="18 15 12 9 6 15"/></svg>;
const GreenPill = ({ children }) => <span style={{ display: "flex", alignItems: "center", gap: 3, color: "#22C55E", fontSize: 12, fontWeight: 600, background: "rgba(34,197,94,.1)", padding: "3px 8px", borderRadius: 20, fontFamily: "'IBM Plex Sans', sans-serif" }}>{children}</span>;
const RedPill = ({ children }) => <span style={{ color: "#F87171", fontSize: 12, fontWeight: 600, background: "rgba(239,68,68,.1)", padding: "3px 8px", borderRadius: 20, fontFamily: "'IBM Plex Sans', sans-serif" }}>{children}</span>;
const AmberPill = ({ children }) => <span style={{ color: "#F59E0B", fontSize: 12, fontWeight: 600, background: "rgba(245,158,11,.1)", padding: "3px 8px", borderRadius: 20, fontFamily: "'IBM Plex Sans', sans-serif" }}>{children}</span>;

function Dashboard({ invoices, onPayAllJuly }) {
  const T = useT();
  const { isMobile, isTablet } = useLayout();
  const kpis = {
    outstanding: invoices.filter(i => i.status !== "paid").reduce((s, i) => s + i.amount, 0),
    overdue:     invoices.filter(i => i.status === "overdue").reduce((s, i) => s + i.amount, 0),
    nextMonth:   invoices.filter(i => i.status !== "paid" && i.dueDate?.startsWith("2024-08")).reduce((s, i) => s + i.amount, 0),
    paid:        invoices.filter(i => i.status === "paid").reduce((s, i) => s + i.amount, 0),
  };
  const overdueCount = invoices.filter(i => i.status === "overdue").length;
  const nextMonthCount = invoices.filter(i => i.status !== "paid" && i.dueDate?.startsWith("2024-08")).length;

  const CARDS = [
    {
      label: "Outstanding", value: kpis.outstanding, delay: 0,
      iconBg: "rgba(99,102,241,.13)", iconColor: "#818CF8",
      iconPath: <><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></>,
      pill: <GreenPill><ArrowUp />+12%</GreenPill>, context: "vs last month",
    },
    {
      label: "Overdue", value: kpis.overdue, valueColor: "#F87171", delay: 0.06,
      iconBg: "rgba(239,68,68,.12)", iconColor: "#F87171",
      iconPath: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
      pill: <RedPill>{overdueCount} invoices</RedPill>, context: "need action",
    },
    {
      label: "Next Month", value: kpis.nextMonth, delay: 0.12,
      iconBg: "rgba(245,158,11,.12)", iconColor: "#F59E0B",
      iconPath: <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
      pill: <AmberPill>Aug 2024</AmberPill>, context: `· ${nextMonthCount} invoices`,
    },
    {
      label: "Total Paid", value: kpis.paid, delay: 0.18,
      iconBg: "rgba(34,197,94,.12)", iconColor: "#22C55E",
      iconPath: <><polyline points="20 6 9 17 4 12"/></>,
      pill: <GreenPill><ArrowUp />+28%</GreenPill>, context: "this year",
    },
  ];

  const isCompact = isMobile || isTablet;
  const kpiCols = isMobile ? "1fr 1fr" : isTablet ? "1fr 1fr" : "repeat(4,1fr)";
  const supplierNames = Object.keys(SUPPLIER_COLORS);

  return (
    <div style={{ animation: "slideUp 0.35s cubic-bezier(.16,1,.3,1)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: isMobile ? 14 : 20 }}>
        <div>
          <h1 style={{ fontFamily: SANS, fontSize: isMobile ? 17 : 21, fontWeight: 600, letterSpacing: "-0.04em", color: T.t1, margin: "0 0 3px", lineHeight: 1 }}>Dashboard</h1>
          {!isMobile && <p style={{ fontFamily: SANS, fontSize: 13, color: T.t2, margin: 0 }}>June 28, 2024 · Here's where you stand today</p>}
        </div>
        <div style={{ flex: 1 }} />
        {!isMobile && <div style={{ background: T.isDark ? "rgba(255,255,255,.04)" : T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 8, padding: "7px 14px", fontFamily: SANS, fontSize: 12, fontWeight: 500, color: T.t2 }}>Jun 2024</div>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: kpiCols, gap: 12, marginBottom: 16 }}>
        {CARDS.map(c => <KPICard key={c.label} {...c} />)}
      </div>

      <div style={{ background: T.surf, border: `1px solid ${T.isDark ? "rgba(99,102,241,.30)" : T.indigoBdr}`, borderRadius: 12, padding: isMobile ? "14px 16px" : "20px 24px", display: "flex", alignItems: isMobile ? "flex-start" : "center", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: 11, background: T.isDark ? "rgba(99,102,241,.14)" : T.indigoTint, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.isDark ? "#818CF8" : T.indigo} strokeWidth="1.75" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          </div>
          <div>
            <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 15, color: T.t1, letterSpacing: "-0.02em", marginBottom: 4 }}>Pay July '24 — you're ready</div>
            <div style={{ fontFamily: SANS, fontSize: 13, color: T.t2 }}>4 suppliers · <span style={{ color: T.isDark ? "#A5B4FC" : T.indigo, fontWeight: 500, fontFamily: MONO }}>{fmt(70400)}</span> total due</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0, alignSelf: isMobile ? "stretch" : "auto" }}>
          <button style={{ padding: "8px 16px", border: `1px solid ${T.bdr2}`, borderRadius: 8, background: T.isDark ? "rgba(255,255,255,.04)" : "transparent", fontFamily: SANS, fontSize: 13, fontWeight: 500, color: T.t2, cursor: "pointer" }}>View invoices</button>
          <button onClick={onPayAllJuly} style={{ background: T.indigo, border: "none", borderRadius: 8, padding: "8px 20px", fontFamily: SANS, fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, boxShadow: "0 4px 18px rgba(99,102,241,.35)", letterSpacing: "-0.01em", flex: isMobile ? 1 : "none", justifyContent: "center" }}>
            Pay All <ChevronRight size={12} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isCompact ? "1fr" : "1fr 310px", gap: 14 }}>
        <div style={{ background: T.surf, border: `1px solid ${T.bdr}`, borderRadius: 12, padding: "22px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 14, color: T.isDark ? "#CBD6E6" : T.t1, letterSpacing: "-0.02em" }}>Payment Schedule</div>
              <div style={{ fontFamily: SANS, fontSize: 12, color: T.t2, marginTop: 3 }}>Upcoming payments by month</div>
            </div>
            <button style={{ padding: "5px 12px", border: `1px solid ${T.bdr}`, borderRadius: 6, background: T.isDark ? "rgba(255,255,255,.04)" : T.surf2, fontFamily: SANS, fontSize: 11, fontWeight: 600, color: T.t2, cursor: "pointer" }}>4 months</button>
          </div>
          <ResponsiveContainer width="100%" height={isMobile ? 140 : 180}>
            <BarChart data={CHART_DATA} barSize={isMobile ? 20 : 28} barCategoryGap="40%">
              <CartesianGrid strokeDasharray="3 3" stroke={T.bdr} vertical={false} />
              <XAxis dataKey="month" tick={{ fontFamily: SANS, fontSize: isMobile ? 10 : 11, fill: T.t3 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontFamily: SANS, fontSize: 10, fill: T.t3 }} axisLine={false} tickLine={false} tickFormatter={v => `₪${(v / 1000).toFixed(0)}k`} width={isMobile ? 32 : 38} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: T.indigoTint }} />
              {supplierNames.map((name, i) => (
                <Bar key={name} dataKey={name} stackId="a" fill={SUPPLIER_COLORS[name]} radius={i === supplierNames.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: 16, paddingTop: 14, borderTop: `1px solid ${T.isDark ? "rgba(255,255,255,.06)" : T.bdr}` }}>
            {supplierNames.map(n => (
              <div key={n} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: SUPPLIER_COLORS[n], flexShrink: 0 }} />
                <span style={{ fontFamily: SANS, fontSize: 11, color: T.t2, maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr", gap: 10 }}>
          {CHART_DATA.slice(-4).map(m => (
            <div key={m.month} onClick={onPayAllJuly}
              style={{ background: T.surf, border: `1px solid ${T.bdr}`, borderRadius: 12, padding: "14px 16px", cursor: "pointer", transition: "border-color 0.18s" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = T.isDark ? "rgba(255,255,255,.12)" : T.indigo}
              onMouseLeave={e => e.currentTarget.style.borderColor = T.bdr}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 13, color: T.isDark ? "#CBD6E6" : T.t1, letterSpacing: "-0.02em" }}>{m.month} '24</span>
                <span style={{ fontFamily: MONO, fontWeight: 600, fontSize: 13, color: T.isDark ? "#CBD6E6" : T.t1, fontVariantNumeric: "tabular-nums" }}>{fmt(m.total)}</span>
              </div>
              {!isMobile && Object.entries(m).filter(([k]) => k !== "month" && k !== "total" && m[k] > 0)
                .sort((a, b) => b[1] - a[1]).slice(0, 3)
                .map(([sup, amt]) => (
                  <div key={sup} style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 0" }}>
                    <div style={{ width: 18, height: 18, borderRadius: "50%", background: SUPPLIER_COLORS[sup] || T.t2, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontSize: 8, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{sup.charAt(0)}</div>
                    <span style={{ flex: 1, fontFamily: SANS, fontSize: 11, color: T.isDark ? "#7A8FA6" : T.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sup}</span>
                    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: T.isDark ? "#9AAFCA" : T.t1, fontVariantNumeric: "tabular-nums" }}>{fmt(amt)}</span>
                  </div>
                ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Invoices ──────────────────────────────────────────────────────────────────
function SupplierGroup({ supplier, invoices, selectedIds, onToggleSelect, onToggleAll, onMarkPaid, onPayGroup }) {
  const T = useT();
  const { isMobile } = useLayout();
  const [hov, setHov] = useState(false);
  const c = SUPPLIER_COLORS[supplier] || T.t2;
  const unpaidIds = invoices.filter(i => i.status !== "paid").map(i => i.id);
  const allSel = unpaidIds.length > 0 && unpaidIds.every(id => selectedIds.has(id));
  const someSel = !allSel && unpaidIds.some(id => selectedIds.has(id));
  const total = invoices.reduce((s, i) => s + i.amount, 0);
  const checkRef = useRef(null);
  useEffect(() => { if (checkRef.current) checkRef.current.indeterminate = someSel; }, [someSel]);

  return (
    <div style={{ background: T.surf, border: `1px solid ${T.bdr}`, borderRadius: 10, marginBottom: 10, overflow: "hidden" }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: `1px solid ${T.bdr}` }}>
        <input type="checkbox" ref={checkRef} checked={allSel} onChange={() => onToggleAll(unpaidIds)} style={{ accentColor: T.indigo, cursor: "pointer", width: 14, height: 14, flexShrink: 0 }} />
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: c, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontWeight: 700, fontSize: 12, color: "#fff", flexShrink: 0 }}>{supplier.charAt(0)}</div>
        <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 13, color: T.t1, flex: 1 }}>{supplier}</span>
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
          const isPaid = inv.status === "paid";
          const cols = isMobile ? "36px 1fr 100px 110px 130px" : "40px 1fr 110px 120px 110px 1fr 190px";
          return (
            <div key={inv.id} onClick={() => !isPaid && onToggleSelect(inv.id)}
              style={{ display: "grid", gridTemplateColumns: cols, alignItems: "center", gap: 8, padding: "8px 14px", borderTop: `1px solid ${T.bdr}`, background: isSel ? T.indigoTint : "transparent", cursor: isPaid ? "default" : "pointer", transition: "background 0.1s", minWidth: isMobile ? 460 : "auto" }}
              onMouseEnter={e => { if (!isSel && !isPaid) e.currentTarget.style.background = T.isDark ? "rgba(99,102,241,.07)" : T.surf2; }}
              onMouseLeave={e => { e.currentTarget.style.background = isSel ? T.indigoTint : "transparent"; }}>
              <input type="checkbox" checked={isSel} disabled={isPaid} onChange={() => onToggleSelect(inv.id)} onClick={e => e.stopPropagation()} style={{ accentColor: T.indigo, cursor: isPaid ? "default" : "pointer", width: 13, height: 13, opacity: isPaid ? 0.35 : 1 }} />
              <span style={{ fontFamily: MONO, fontSize: 12, color: T.isDark ? "#627488" : T.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{inv.invoiceNo}</span>
              <span style={{ fontFamily: MONO, fontWeight: 600, fontSize: 13, color: T.isDark ? "#C8D6E8" : T.t1, fontVariantNumeric: "tabular-nums" }}>{fmt(inv.amount)}</span>
              <StatusBadge status={inv.status} />
              {!isMobile && <span style={{ fontFamily: MONO, fontSize: 12, color: T.isDark ? "#627488" : T.t2, fontVariantNumeric: "tabular-nums" }}>{fmtDate(inv.invoiceDate)}</span>}
              {!isMobile && <span style={{ fontFamily: MONO, fontSize: 12, color: inv.status === "overdue" ? "#F87171" : T.isDark ? "#627488" : T.t2, fontWeight: inv.status === "overdue" ? 600 : 400, fontVariantNumeric: "tabular-nums" }}>{fmtDate(inv.dueDate)}</span>}
              <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                {inv.attachment && <button onClick={e => e.stopPropagation()} style={{ padding: "2px 6px", background: "transparent", border: `1px solid ${T.bdr}`, borderRadius: 4, color: T.t2, cursor: "pointer", display: "flex", alignItems: "center" }}><Paperclip size={10} /></button>}
                {!isPaid && <button onClick={e => { e.stopPropagation(); onMarkPaid(inv.id); }} style={{ padding: "2px 7px", background: T.greenTint, border: `1px solid ${T.greenBdr}`, borderRadius: 4, color: T.green, cursor: "pointer", fontFamily: SANS, fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 2 }}><Check size={10} />Paid</button>}
                {!isMobile && <button onClick={e => e.stopPropagation()} style={{ padding: "2px 6px", background: "transparent", border: `1px solid ${T.bdr}`, borderRadius: 4, color: T.t2, cursor: "pointer", display: "flex", alignItems: "center" }}><Pencil size={10} /></button>}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ padding: "6px 14px", borderTop: `1px solid ${T.bdr}`, display: "flex", justifyContent: "space-between" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontFamily: SANS, fontSize: 12, color: T.t3 }}>
          <input type="checkbox" checked={allSel} onChange={() => onToggleAll(unpaidIds)} style={{ accentColor: T.indigo, width: 12, height: 12 }} />Select all unpaid
        </label>
        <span style={{ fontFamily: SANS, fontSize: 12, color: T.t3 }}>Total: <span style={{ fontFamily: MONO, color: T.t2 }}>{fmt(total)}</span></span>
      </div>
    </div>
  );
}

function GroupedView({ invoices, selectedMonth, onMonthChange, selectedIds, onToggleSelect, onToggleAll, onMarkPaid, onSelectAll, onPayGroup, onAllPaid }) {
  const T = useT();
  const { isMobile } = useLayout();
  const monthInvoices = invoices.filter(inv => inv.dueDate?.startsWith(selectedMonth));
  const unpaid = monthInvoices.filter(i => i.status !== "paid");
  const paidCount = monthInvoices.length - unpaid.length;
  const progress = monthInvoices.length > 0 ? Math.round((paidCount / monthInvoices.length) * 100) : 0;
  const allPaid = monthInvoices.length > 0 && paidCount === monthInvoices.length;
  const monthTotal = monthInvoices.reduce((s, i) => s + i.amount, 0);
  const prevAllPaid = useRef(false);
  useEffect(() => { if (allPaid && !prevAllPaid.current && monthInvoices.length > 0) onAllPaid(); prevAllPaid.current = allPaid; }, [allPaid]);
  const groups = Object.entries(monthInvoices.reduce((acc, inv) => { (acc[inv.supplier] = acc[inv.supplier] || []).push(inv); return acc; }, {})).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {["2024-07", "2024-08", "2024-09", "2024-10"].map(ym => {
          const active = ym === selectedMonth;
          const mInvoices = invoices.filter(i => i.dueDate?.startsWith(ym));
          const mTotal = mInvoices.reduce((s, i) => s + i.amount, 0);
          const [y, m] = ym.split("-").map(Number);
          const shortLabel = new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short" }) + " '" + String(y).slice(2);
          return (
            <button key={ym} onClick={() => onMonthChange(ym)} style={{ padding: "7px 16px", background: active ? T.indigo : T.isDark ? "rgba(255,255,255,.04)" : T.surf2, border: `1px solid ${active ? "transparent" : T.isDark ? "rgba(255,255,255,.08)" : T.bdr}`, borderRadius: 24, fontFamily: SANS, fontSize: 13, fontWeight: active ? 600 : 500, color: active ? "#fff" : T.t2, cursor: "pointer", whiteSpace: "nowrap" }}>
              {shortLabel}
              {mTotal > 0 && <span style={{ opacity: active ? 0.65 : 0.7, fontWeight: 400, marginLeft: 4, fontFamily: MONO }}>₪{Math.round(mTotal / 1000)}k</span>}
            </button>
          );
        })}
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
      {groups.map(([supplier, supInvoices]) => (
        <SupplierGroup key={supplier} supplier={supplier} invoices={supInvoices} selectedIds={selectedIds}
          onToggleSelect={onToggleSelect} onToggleAll={onToggleAll} onMarkPaid={onMarkPaid}
          onPayGroup={ids => onSelectAll(ids)} />
      ))}
    </div>
  );
}

function InvoicesView({ invoices, selectedMonth, onMonthChange, onMarkPaid, onBulkPaid, preSelectAll }) {
  const T = useT();
  const { isMobile } = useLayout();
  const [viewMode, setViewMode] = useState("grouped");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showPayConfirm, setShowPayConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [successData, setSuccessData] = useState(null);

  useEffect(() => {
    if (preSelectAll) {
      const ids = invoices.filter(i => i.dueDate?.startsWith(selectedMonth) && i.status !== "paid").map(i => i.id);
      setSelectedIds(new Set(ids));
    }
  }, [preSelectAll, selectedMonth]);

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
              <button key={mode} onClick={() => setViewMode(mode)} style={{ padding: "4px 12px", borderRadius: 4, border: "none", cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: viewMode === mode ? 600 : 400, background: viewMode === mode ? T.indigoTint : "transparent", color: viewMode === mode ? T.indigo : T.t2, textTransform: "capitalize" }}>{mode}</button>
            ))}
          </div>
        )}
        <button style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 6, background: "transparent", border: `1px solid ${T.bdr}`, color: T.t2, cursor: "pointer", fontFamily: SANS, fontSize: 12 }}><Filter size={12} strokeWidth={1.75} />Filter</button>
        {selectedIds.size > 0 && <button onClick={() => setSelectedIds(new Set())} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 6, background: "transparent", border: `1px solid ${T.redBdr}`, color: T.red, cursor: "pointer", fontFamily: SANS, fontSize: 12 }}><X size={12} />Clear</button>}
        <div style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11, color: T.t3 }}>{invoices.length} invoices</div>
      </div>

      {(isMobile || viewMode === "grouped") ? (
        <GroupedView invoices={invoices} selectedMonth={selectedMonth} onMonthChange={onMonthChange}
          selectedIds={selectedIds} onToggleSelect={toggleSelect} onToggleAll={toggleAll}
          onMarkPaid={onMarkPaid} onSelectAll={ids => setSelectedIds(new Set(ids))}
          onPayGroup={ids => { setSelectedIds(new Set(ids)); setShowPayConfirm(true); }}
          onAllPaid={() => setShowCelebration(true)} />
      ) : (
        <div style={{ background: T.surf, border: `1px solid ${T.bdr}`, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "40px minmax(140px,1fr) 130px 90px 90px 110px 90px 52px", alignItems: "center", padding: "0 18px", height: 40, background: T.isDark ? "#0E1520" : T.surf2, borderBottom: `1px solid ${T.bdr}` }}>
            {["", "Supplier", "Invoice #", "Issued", "Due", "Amount", "Status", ""].map((h, i) => (
              <div key={i} style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.isDark ? "rgba(255,255,255,.3)" : T.t3, textAlign: i === 5 ? "right" : "left", paddingRight: i === 5 ? 14 : 0 }}>{h}</div>
            ))}
          </div>
          {invoices.map(inv => {
            const isSel = selectedIds.has(inv.id);
            return (
              <div key={inv.id} onClick={() => toggleSelect(inv.id)}
                style={{ display: "grid", gridTemplateColumns: "40px minmax(140px,1fr) 130px 90px 90px 110px 90px 52px", alignItems: "center", padding: "0 18px", height: 52, borderBottom: `1px solid ${T.isDark ? "rgba(255,255,255,.04)" : T.bdr}`, background: isSel ? T.indigoTint : "transparent", cursor: "pointer", transition: "background 0.1s" }}
                onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = T.isDark ? "rgba(99,102,241,.07)" : T.surf2; }}
                onMouseLeave={e => { e.currentTarget.style.background = isSel ? T.indigoTint : "transparent"; }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ width: 14, height: 14, border: `1.5px solid ${isSel ? T.indigo : T.isDark ? "rgba(255,255,255,.18)" : T.bdr2}`, borderRadius: 3, background: isSel ? T.indigo : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {isSel && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: SUPPLIER_COLORS[inv.supplier] || T.t2, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontWeight: 700, fontSize: 10, color: "#fff", flexShrink: 0 }}>{inv.supplier.charAt(0)}</div>
                  <span style={{ fontFamily: SANS, fontWeight: 500, fontSize: 13, color: T.isDark ? "#B8CAE0" : T.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inv.supplier}</span>
                </div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: T.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8, fontVariantNumeric: "tabular-nums" }}>{inv.invoiceNo}</div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: T.t2, fontVariantNumeric: "tabular-nums" }}>{fmtDate(inv.invoiceDate)}</div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: inv.status === "overdue" ? "#F87171" : T.t2, fontWeight: inv.status === "overdue" ? 600 : 400, fontVariantNumeric: "tabular-nums" }}>{fmtDate(inv.dueDate)}</div>
                <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600, color: T.isDark ? "#C8D6E8" : T.t1, textAlign: "right", paddingRight: 14, fontVariantNumeric: "tabular-nums" }}>{fmt(inv.amount)}</div>
                <StatusBadge status={inv.status} />
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button onClick={e => e.stopPropagation()} style={{ width: 26, height: 26, border: `1px solid ${T.isDark ? "rgba(255,255,255,.09)" : T.bdr}`, borderRadius: 6, background: T.isDark ? "rgba(255,255,255,.03)" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.isDark ? "rgba(255,255,255,.35)" : T.t2} strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedIds.size > 0 && (
        <div style={{ position: "fixed", ...(isMobile ? { bottom: 0, left: 0, right: 0, borderRadius: "12px 12px 0 0" } : { bottom: 24, left: "50%", transform: "translateX(-50%)", borderRadius: 50 }), background: "#0F172A", padding: isMobile ? "14px 20px" : "10px 20px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 -4px 24px rgba(0,0,0,0.3)", animation: "slideUp 0.25s cubic-bezier(.16,1,.3,1)", zIndex: 200, whiteSpace: "nowrap" }}>
          <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#6366F1", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontWeight: 700, fontSize: 11, color: "#fff" }}>{selectedIds.size}</div>
          <span style={{ fontFamily: SANS, fontWeight: 500, color: "#94A3B8", fontSize: 13, flex: 1 }}>{selectedIds.size} · <span style={{ fontFamily: MONO, color: "#fff" }}>{fmt(selTotal)}</span></span>
          <button onClick={() => setShowPayConfirm(true)} style={{ padding: "7px 18px", borderRadius: 50, background: "#6366F1", border: "none", cursor: "pointer", fontFamily: SANS, fontWeight: 600, fontSize: 13, color: "#fff" }}>Pay →</button>
          <button onClick={() => setSelectedIds(new Set())} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", display: "flex", alignItems: "center" }}><X size={15} /></button>
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
                  <div style={{ width: 26, height: 26, borderRadius: "50%", background: SUPPLIER_COLORS[inv.supplier] || T.t2, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontWeight: 700, fontSize: 11, color: "#fff", flexShrink: 0 }}>{inv.supplier.charAt(0)}</div>
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
              <button onClick={() => setShowPayConfirm(false)} style={{ flex: 1, padding: "11px 0", background: "transparent", border: `1px solid ${T.bdr2}`, borderRadius: 7, color: T.t2, cursor: "pointer", fontFamily: SANS, fontWeight: 600, fontSize: 14 }}>Cancel</button>
              <button onClick={handleConfirmPay} style={{ flex: 2, padding: "11px 0", background: T.indigo, border: "none", borderRadius: 7, color: "#fff", cursor: "pointer", fontFamily: SANS, fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                <Check size={15} strokeWidth={2.5} />Confirm
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
function SuppliersView({ suppliers: init }) {
  const T = useT();
  const { isMobile } = useLayout();
  const [suppliers, setSuppliers] = useState(init);
  const [filterTerm, setFilterTerm] = useState("all");
  const [editId, setEditId] = useState(null);
  const [editData, setEditData] = useState({});
  const TERMS = ["all", "shotef_plus(45)", "shotef_plus(30)", "shotef", "immediate"];
  const filtered = filterTerm === "all" ? suppliers : suppliers.filter(s => s.terms === filterTerm);
  const inp = { flex: 1, padding: "6px 10px", background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 5, fontFamily: SANS, fontSize: 12, color: T.t1, minWidth: 0, outline: "none" };

  return (
    <div style={{ animation: "slideUp 0.35s cubic-bezier(.16,1,.3,1)" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {TERMS.map(t => (
          <button key={t} onClick={() => setFilterTerm(t)} style={{ padding: "4px 10px", borderRadius: 3, border: `1px solid ${filterTerm === t ? T.indigo : T.bdr}`, background: filterTerm === t ? T.indigoTint : "transparent", color: filterTerm === t ? T.indigo : T.t2, cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 600 }}>
            {t === "all" ? `All (${suppliers.length})` : isMobile ? t.replace("shotef_plus(", "+").replace(")", "") : t}
          </button>
        ))}
      </div>
      <div style={{ background: T.surf, border: `1px solid ${T.bdr}`, borderRadius: 10, overflow: "hidden" }}>
        {filtered.map((sup, idx) => (
          <div key={sup.id} style={{ padding: "11px 14px", borderTop: idx > 0 ? `1px solid ${T.bdr}` : "none" }}>
            {editId === sup.id ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 7 }}>
                  <input value={editData.name ?? ""} placeholder="Name" onChange={e => setEditData(d => ({ ...d, name: e.target.value }))} style={inp} />
                  <input value={editData.terms ?? ""} placeholder="Terms" onChange={e => setEditData(d => ({ ...d, terms: e.target.value }))} style={{ ...inp, maxWidth: 130 }} />
                </div>
                <div style={{ display: "flex", gap: 7 }}>
                  <input value={editData.notes ?? ""} placeholder="Notes" onChange={e => setEditData(d => ({ ...d, notes: e.target.value }))} style={inp} />
                  <button onClick={() => { setSuppliers(prev => prev.map(s => s.id === sup.id ? { ...s, ...editData } : s)); setEditId(null); }} style={{ padding: "6px 12px", background: T.greenTint, border: `1px solid ${T.greenBdr}`, borderRadius: 5, color: T.green, cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}><Check size={11} />Save</button>
                  <button onClick={() => setEditId(null)} style={{ padding: "6px 10px", background: "transparent", border: `1px solid ${T.bdr}`, borderRadius: 5, color: T.t2, cursor: "pointer", display: "flex", alignItems: "center", flexShrink: 0 }}><X size={11} /></button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: SUPPLIER_COLORS[sup.name] || T.surf3, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SANS, fontWeight: 700, fontSize: 11, color: SUPPLIER_COLORS[sup.name] ? "#fff" : T.t2, flexShrink: 0 }}>{sup.name.charAt(0)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: T.t1 }}>{sup.name}</div>
                  <div style={{ fontFamily: MONO, fontSize: 11, color: T.t3 }}>{sup.terms}</div>
                </div>
                {!isMobile && sup.notes && <span style={{ fontFamily: SANS, fontSize: 12, color: T.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>{sup.notes}</span>}
                <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                  <button onClick={() => { setEditId(sup.id); setEditData({ name: sup.name, terms: sup.terms, notes: sup.notes }); }} style={{ padding: "3px 8px", background: "transparent", border: `1px solid ${T.bdr}`, borderRadius: 4, color: T.t2, cursor: "pointer", fontFamily: SANS, fontSize: 11, display: "flex", alignItems: "center", gap: 3 }}><Pencil size={10} />{!isMobile && "Edit"}</button>
                  <button onClick={() => setSuppliers(prev => prev.filter(s => s.id !== sup.id))} style={{ padding: "3px 7px", background: "transparent", border: `1px solid ${T.redBdr}`, borderRadius: 4, color: T.red, cursor: "pointer", display: "flex", alignItems: "center" }}><Trash2 size={10} /></button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <button onClick={() => setSuppliers(prev => [...prev, { id: Date.now(), name: "New Supplier", terms: "shotef", notes: "" }])}
        style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: "transparent", border: `1px solid ${T.bdr}`, borderRadius: 6, color: T.t1, cursor: "pointer", fontFamily: SANS, fontSize: 13, fontWeight: 600 }}>
        <Plus size={13} />Add Supplier
      </button>
    </div>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────
function SettingsScreen({ onUpgrade, onSignOut }) {
  const T = useT();
  const { isMobile, isTablet } = useLayout();
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
  const [bizName, setBizName] = useState("Apollo Trading Ltd.");
  const [currency, setCurrency] = useState("ILS");
  const [timezone, setTimezone] = useState("Asia/Jerusalem");
  const [fullName, setFullName] = useState("Alex Kohn");
  const [changingPw, setChangingPw] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const scrollTo = (id) => { sectionRefs[id]?.current?.scrollIntoView({ behavior: "smooth", block: "start" }); setActiveSection(id); };
  const saveSection = (id) => { setSaved(id); setTimeout(() => setSaved(null), 2000); };
  const inp = { width: "100%", padding: "9px 12px", background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 6, fontFamily: SANS, fontSize: 13, color: T.t1, outline: "none" };
  const sel = { ...inp, cursor: "pointer" };
  const used = 18, limit = 20, pct = Math.round((used / limit) * 100);

  const NAV = [
    { id: "general",      label: "General",      Icon: Building2,     locked: false, danger: false },
    { id: "profile",      label: "Profile",      Icon: User,          locked: false, danger: false },
    { id: "billing",      label: "Billing",      Icon: CreditCard,    locked: false, danger: false },
    { id: "integrations", label: "Integrations", Icon: Zap,           locked: false, danger: false },
    { id: "team",         label: "Team",         Icon: Users,         locked: true,  danger: false },
    { id: "data",         label: "Export",       Icon: Download,      locked: false, danger: false },
    { id: "danger",       label: "Danger",       Icon: AlertTriangle, locked: false, danger: true  },
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
    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
      <button onClick={() => saveSection(id)} style={{ padding: "7px 16px", background: T.indigo, border: "none", borderRadius: 6, fontFamily: SANS, fontWeight: 600, fontSize: 12, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
        {saved === id ? <><Check size={12} />Saved</> : "Save changes"}
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
        <Section id="general" title="General" desc="Basic settings for your business.">
          <Row label="Business name"><input value={bizName} onChange={e => setBizName(e.target.value)} style={inp} /></Row>
          <Row label="Currency" hint="Used for all amounts">
            <select value={currency} onChange={e => setCurrency(e.target.value)} style={sel}>
              <option value="ILS">₪ Israeli New Shekel (ILS)</option>
              <option value="USD">$ US Dollar (USD)</option>
              <option value="EUR">€ Euro (EUR)</option>
              <option value="GBP">£ British Pound (GBP)</option>
            </select>
          </Row>
          <Row label="Timezone">
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

        <Section id="profile" title="Profile & Account" desc="Your personal information and login credentials.">
          <Row label="Full name"><input value={fullName} onChange={e => setFullName(e.target.value)} style={inp} /></Row>
          <Row label="Email" hint="Via Google OAuth"><input value="alex@apollotrading.co" disabled style={{ ...inp, opacity: 0.5, cursor: "not-allowed" }} /></Row>
          <Row label="Password">
            {!changingPw ? (
              <button onClick={() => setChangingPw(true)} style={{ padding: "8px 14px", background: "transparent", border: `1px solid ${T.bdr}`, borderRadius: 6, fontFamily: SANS, fontSize: 13, color: T.t1, cursor: "pointer" }}>Change password</button>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input type="password" placeholder="Current password" style={inp} />
                <input type="password" placeholder="New password" style={inp} />
                <input type="password" placeholder="Confirm new password" style={inp} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={{ flex: 1, padding: "8px 0", background: T.indigo, border: "none", borderRadius: 6, fontFamily: SANS, fontWeight: 600, fontSize: 13, color: "#fff", cursor: "pointer" }}>Update</button>
                  <button onClick={() => setChangingPw(false)} style={{ padding: "8px 14px", background: "transparent", border: `1px solid ${T.bdr}`, borderRadius: 6, fontFamily: SANS, fontSize: 13, color: T.t2, cursor: "pointer" }}>Cancel</button>
                </div>
              </div>
            )}
          </Row>
          <SaveBtn id="profile" />
        </Section>

        <Section id="billing" title="Billing & Plan" desc="Your current plan and usage.">
          <div style={{ background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 10, padding: 16, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, gap: 10 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 14, color: T.t1 }}>Free Plan</span>
                  <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 3, background: T.surf3, color: T.t3, border: `1px solid ${T.bdr}` }}>FREE</span>
                </div>
                <div style={{ fontFamily: SANS, fontSize: 12, color: T.t2 }}>Up to 20 invoices/month</div>
              </div>
              <button onClick={onUpgrade} style={{ padding: "7px 12px", background: T.indigo, border: "none", borderRadius: 6, fontFamily: SANS, fontWeight: 600, fontSize: 12, color: "#fff", cursor: "pointer", flexShrink: 0 }}>Upgrade</button>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: SANS, fontSize: 12, color: T.t3, marginBottom: 6 }}>
              <span>Usage this month</span><span style={{ fontFamily: MONO }}>{used} / {limit}</span>
            </div>
            <div style={{ height: 4, background: T.surf3, borderRadius: 2 }}><div style={{ height: "100%", width: `${pct}%`, background: pct >= 90 ? T.red : T.indigo, borderRadius: 2 }} /></div>
          </div>
          <div style={{ fontFamily: SANS, fontSize: 13, color: T.t3 }}>Billing status: <span style={{ color: T.t2 }}>No active subscription</span></div>
        </Section>

        <Section id="integrations" title="Integrations" desc="Connect invoice sources.">
          {[
            { label: "Google Drive",      color: "#4285F4", connected: true,  comingSoon: false },
            { label: "Gmail",             color: "#EA4335", connected: false, comingSoon: false },
            { label: "WhatsApp",          color: "#25D366", connected: false, comingSoon: false },
            { label: "Green Invoice",     color: "#16A34A", connected: true,  comingSoon: false },
            { label: "Bank / Accounting", color: T.t3,     connected: false, comingSoon: true  },
          ].map(intg => (
            <div key={intg.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: T.surf2, border: `1px solid ${intg.connected ? intg.color + "40" : T.bdr}`, borderLeft: `3px solid ${intg.connected ? intg.color : T.bdr}`, borderRadius: 8, marginBottom: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: `${intg.color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {intg.connected ? <Wifi size={12} color={intg.color} /> : <WifiOff size={12} color={T.t3} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: intg.comingSoon ? T.t3 : T.t1 }}>{intg.label}</div>
                <div style={{ fontFamily: SANS, fontSize: 11, color: T.t3 }}>{intg.comingSoon ? "Coming soon" : intg.connected ? "Connected" : "Not connected"}</div>
              </div>
              {intg.comingSoon ? (
                <span style={{ fontFamily: SANS, fontSize: 11, fontWeight: 600, color: T.t3, background: T.surf3, border: `1px solid ${T.bdr}`, borderRadius: 3, padding: "2px 7px", flexShrink: 0 }}>Soon</span>
              ) : (
                <button style={{ padding: "4px 10px", background: intg.connected ? T.redTint : T.indigoTint, border: `1px solid ${intg.connected ? T.redBdr : T.indigoBdr}`, borderRadius: 4, color: intg.connected ? T.red : T.indigo, cursor: "pointer", fontFamily: SANS, fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                  {intg.connected ? "Disconnect" : "Connect"}
                </button>
              )}
            </div>
          ))}
        </Section>

        <Section id="team" title="Team & Access" desc="Invite members and manage roles.">
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

        <Section id="data" title="Data & Export" desc="Download your data or reset the demo.">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { label: "Export invoices",        hint: "All records as CSV" },
              { label: "Export suppliers",        hint: "With payment terms" },
              { label: "Export financial report", hint: "Monthly summary as PDF" },
            ].map(item => (
              <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 8 }}>
                <Download size={14} color={T.t2} strokeWidth={1.75} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: T.t1 }}>{item.label}</div>
                  {!isMobile && <div style={{ fontFamily: SANS, fontSize: 11, color: T.t3 }}>{item.hint}</div>}
                </div>
                <button style={{ padding: "6px 12px", background: "transparent", border: `1px solid ${T.bdr}`, borderRadius: 5, fontFamily: SANS, fontSize: 12, fontWeight: 600, color: T.t1, cursor: "pointer", flexShrink: 0 }}>Export</button>
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
function UpgradeModal({ onClose }) {
  const T = useT();
  const { isMobile } = useLayout();
  const [billing, setBilling] = useState("monthly");
  const [loading, setLoading] = useState(null);
  const used = 18, limit = 20, pct = Math.round((used / limit) * 100);
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
            <button onClick={() => setLoading("basic")} disabled={!!loading} style={{ width: "100%", padding: "9px 0", borderRadius: 6, background: T.surf, border: `1px solid ${T.bdr}`, color: T.t1, fontFamily: SANS, fontSize: 13, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", opacity: loading === "basic" ? 0.7 : 1 }}>{loading === "basic" ? "…" : "Get Basic"}</button>
          </div>
          <div style={{ background: T.indigoTint, border: `2px solid ${T.indigo}`, borderRadius: 10, padding: 14, position: "relative" }}>
            <div style={{ position: "absolute", top: -11, left: "50%", transform: "translateX(-50%)", background: T.indigo, color: "#fff", fontFamily: SANS, fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 100, whiteSpace: "nowrap" }}>Popular</div>
            <div style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: T.indigo, marginBottom: 5 }}>PRO</div>
            <div style={{ marginBottom: 10 }}><span style={{ fontFamily: MONO, fontSize: 22, fontWeight: 500, color: T.t1 }}>₪{PLANS.pro[billing]}</span><span style={{ fontFamily: SANS, fontSize: 11, color: T.t3 }}>/mo</span></div>
            <button onClick={() => setLoading("pro")} disabled={!!loading} style={{ width: "100%", padding: "9px 0", borderRadius: 6, background: T.indigo, border: "none", color: "#fff", fontFamily: SANS, fontSize: 13, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", opacity: loading === "pro" ? 0.7 : 1 }}>{loading === "pro" ? "…" : "Get Pro"}</button>
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
        <button onClick={onClose} style={{ display: "block", width: "100%", background: "none", border: "none", color: T.t3, fontFamily: SANS, fontSize: 13, cursor: "pointer", padding: "6px 0", textDecoration: "underline", textDecorationStyle: "dotted" }}>Continue viewing (read-only)</button>
      </div>
    </div>
  );
}

// ── App root ──────────────────────────────────────────────────────────────────
export default function App() {
  const { user, signOut } = useAuth();
  const isLoggedIn = !!user;

  const [isDark, setIsDark] = useState(true);
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
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [windowWidth, setWindowWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1280);
  const [editInvoice, setEditInvoice] = useState(null);
  const [showMissingModal, setShowMissingModal] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const fileRef = useRef();

  // Real invoice data
  const {
    suppliers, computed: invoices, monthlyData, allNames, color,
    missingSuppliers, addInvoice, updateInvoice, deleteInvoice,
    addSupplier, updateSupplier, deleteSupplier, getSupplier,
  } = useInvoiceData();

  // Real plan data
  const { plan, used: planUsed, limit: planLimit, pct: planPct, isAtLimit, refresh: refreshPlan } = usePlan();

  useEffect(() => {
    const h = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  useEffect(() => { if (windowWidth >= 1024) setMobileMenuOpen(false); }, [windowWidth]);

  const isMobile = windowWidth < 640;
  const isTablet = windowWidth >= 640 && windowWidth < 1024;
  const T = isDark ? DARK : LIGHT;

  // Derive chart data from real invoices
  const getSupplierColor = useCallback((name) => {
    const idx = allNames.indexOf(name);
    return PALETTE[idx >= 0 ? idx % PALETTE.length : 0];
  }, [allNames]);

  const chartData = (() => {
    const map = {};
    invoices.forEach(inv => {
      if (!inv.dueDate) return;
      const d = new Date(inv.dueDate);
      const month = d.toLocaleDateString("en-US", { month: "short" });
      if (!map[month]) map[month] = { month };
      map[month][inv.supplier] = (map[month][inv.supplier] || 0) + Number(inv.amount);
    });
    return Object.values(map);
  })();

  const handlePayAll = () => { setSelectedMonth(selectedMonth); setPreSelectAll(true); setView("invoices"); };
  const handleMarkPaid = useCallback((id) => { updateInvoice(id, { status: "Paid" }); }, [updateInvoice]);
  const handleBulkPaid = useCallback((ids) => { ids.forEach(id => updateInvoice(id, { status: "Paid" })); }, [updateInvoice]);
  useEffect(() => { if (preSelectAll) { const t = setTimeout(() => setPreSelectAll(false), 100); return () => clearTimeout(t); } }, [preSelectAll]);

  // Upload handler
  const handleUpload = useCallback(async (e) => {
    const files = Array.from(e?.target?.files || []);
    if (!files.length) return;
    setExtracting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/extract", {
          method: "POST",
          headers: { Authorization: `Bearer ${session?.access_token}` },
          body: formData,
        });
        if (res.ok) {
          const inv = await res.json();
          await addInvoice(inv);
        }
      }
    } catch (err) {
      console.error("upload error:", err);
    } finally {
      setExtracting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [addInvoice]);

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
        <div style={{ display: "flex", minHeight: "100vh", background: T.bg, fontFamily: SANS, color: T.t1 }}>
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

          {/* Hidden file input for upload */}
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" multiple style={{ display: "none" }} onChange={handleUpload} />

          <Sidebar view={view} setView={setView} suppliersCount={suppliers.length}
            onUpgrade={() => setShowUpgrade(true)} onUpload={() => fileRef.current?.click()}
            mobileOpen={mobileMenuOpen} setMobileOpen={setMobileMenuOpen} />

          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
            <GlobalHeader view={view} isDark={isDark} onToggleTheme={() => setIsDark(v => !v)} onMenuOpen={() => setMobileMenuOpen(true)} />
            <main style={{ flex: 1, overflowY: "auto", padding: isMobile ? "20px 16px 100px" : "28px clamp(20px,3vw,36px) 80px" }}>
              {view === "dashboard"    && <Dashboard invoices={invoices} onPayAllJuly={handlePayAll} />}
              {view === "invoices"     && <InvoicesView invoices={invoices} selectedMonth={selectedMonth} onMonthChange={setSelectedMonth} onMarkPaid={handleMarkPaid} onBulkPaid={handleBulkPaid} preSelectAll={preSelectAll} onEditInvoice={setEditInvoice} />}
              {view === "calendar"     && <CalendarView computed={invoices} calMonth={calMonth} setCalMonth={setCalMonth} color={getSupplierColor} />}
              {view === "integrations" && <IntegrationsView />}
              {view === "suppliers"    && <SuppliersView suppliers={suppliers} />}
              {view === "settings"     && <SettingsScreen onUpgrade={() => setShowUpgrade(true)} onSignOut={signOut} />}
            </main>
          </div>

          {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
          {editInvoice && (
            <EditInvoiceModal
              editInvoice={editInvoice}
              setEditInvoice={setEditInvoice}
              suppliers={suppliers}
              addInvoice={addInvoice}
              updateInvoice={updateInvoice}
              getSupplier={getSupplier}
            />
          )}
          {showMissingModal && missingSuppliers?.length > 0 && (
            <MissingSuppliersModal
              missingSuppliers={missingSuppliers}
              invoices={invoices}
              suppliers={suppliers}
              onClose={() => setShowMissingModal(false)}
            />
          )}
        </div>
      </LayoutCtx.Provider>
    </ThemeCtx.Provider>
  );
}
