import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { usePlan } from "../hooks/usePlan";
import { useT, useLayout, useLang } from "../contexts/AppContexts";
import { FONT_UI as SANS, FONT_DISPLAY as DISPLAY, FONT_MONO as MONO } from "../theme";
import {
  Building2, User, CreditCard, Zap, Users, Download, AlertTriangle, Lock, Check,
} from "lucide-react";

export default function SettingsView({ onUpgrade, onSignOut, user, invoices, suppliers, onNavigateToIntegrations }) {
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
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  // Actually deletes the account server-side (all rows + auth user), then signs out.
  const handleDeleteAccount = async () => {
    setDeleting(true); setDeleteError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed to delete account");
      }
      await onSignOut();
    } catch (err) {
      setDeleteError(err.message);
      setDeleting(false);
    }
  };

  const SETTINGS_KEY = "urban_cashflow_settings";
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      if (!user?.user_metadata?.business_name && s.bizName !== undefined) setBizName(s.bizName);
      if (s.currency) setCurrency(s.currency);
      if (s.timezone) setTimezone(s.timezone);
    } catch { /* corrupted local settings — ignore */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const fd = new FormData();
      fd.append("logo", file);
      const res = await fetch("/api/profile/logo", { method: "POST", headers: { Authorization: `Bearer ${session?.access_token}` }, body: fd });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || "Upload failed"); }
      const { logo_url } = await res.json();
      setLogoUrl(logo_url);
      await supabase.auth.updateUser({ data: { logo_url } });
    } catch (err) { setSaveError(err.message); }
    setLogoUploading(false);
    e.target.value = "";
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

  const exportInvoices = () => downloadCSV("invoices.csv", invoices || [], ["supplier", "invoice_no", "invoice_date", "due_date", "amount", "status", "notes"]);
  const exportSuppliers = () => downloadCSV("suppliers.csv", suppliers || [], ["name", "terms", "notes"]);
  const exportReport = () => {
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const groups = {};
    (invoices || []).forEach(inv => {
      const d = new Date((inv.invoice_date || inv.invoiceDate || inv.dueDate || "") + "T12:00:00");
      if (isNaN(d)) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
      if (!groups[key]) groups[key] = { month: label, total: 0, paid: 0, unpaid: 0, overdue: 0 };
      const amt = Number(inv.amount || 0);
      groups[key].total += amt;
      if (inv.status === "Paid" || inv.status === "paid") groups[key].paid += amt;
      else if (inv.status === "Overdue" || inv.status === "overdue") groups[key].overdue += amt;
      else groups[key].unpaid += amt;
    });
    const rows = Object.keys(groups).sort().map(k => groups[k]);
    downloadCSV("financial-report.csv", rows, ["month", "total", "paid", "unpaid", "overdue"]);
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
        <h2 style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 15, color: T.t1, letterSpacing: "-0.02em" }}>{title}</h2>
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
      <button className="btn btn-accent" style={{ padding: "7px 16px", fontSize: 12 }} onClick={() => saveSection(id)}>
        {saved === id ? <><Check size={12} aria-hidden="true" />{t("set_saved")}</> : t("set_save")}
      </button>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: isCompact ? "column" : "row", gap: 0, animation: "slideUp 0.35s cubic-bezier(.16,1,.3,1)" }}>
      {isCompact ? (
        <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 12, marginBottom: 24, borderBottom: `1px solid ${T.bdr}` }}>
          {NAV.map(({ id, label, Icon, locked, danger }) => (
            <button key={id} onClick={() => scrollTo(id)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 6, border: `1px solid ${activeSection === id ? T.accentBdr : T.bdr}`, background: activeSection === id ? T.accentTint : "transparent", color: danger ? T.red : activeSection === id ? T.accent : T.t2, cursor: "pointer", fontFamily: SANS, fontSize: 12, fontWeight: activeSection === id ? 600 : 400, whiteSpace: "nowrap", flexShrink: 0 }}>
              <Icon size={12} strokeWidth={1.75} aria-hidden="true" />{label}{locked && <Lock size={9} color={T.t3} aria-hidden="true" />}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ width: 192, flexShrink: 0, marginInlineEnd: 44 }}>
          <div style={{ position: "sticky", top: 20 }}>
            {NAV.map(({ id, label, Icon, locked, danger }) => (
              <button key={id} onClick={() => scrollTo(id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 6, border: "none", background: activeSection === id ? T.accentTint : "transparent", color: danger ? T.red : activeSection === id ? T.accent : T.t2, cursor: "pointer", fontFamily: SANS, fontSize: 13, fontWeight: activeSection === id ? 600 : 400, marginBottom: 1, textAlign: "start" }}
                onMouseEnter={e => { if (activeSection !== id) e.currentTarget.style.background = T.surf2; }}
                onMouseLeave={e => { if (activeSection !== id) e.currentTarget.style.background = "transparent"; }}>
                <Icon size={13} strokeWidth={1.75} style={{ flexShrink: 0 }} aria-hidden="true" />
                <span style={{ flex: 1 }}>{label}</span>
                {locked && <Lock size={10} color={T.t3} aria-hidden="true" />}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0, maxWidth: isCompact ? "100%" : 560 }}>
        <Section id="general" title={t("set_general")} desc="">
          <Row label={t("set_logo")}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {logoUrl
                ? <img src={logoUrl} alt="Business logo" style={{ width: 48, height: 48, borderRadius: 8, objectFit: "contain", border: `1px solid ${T.bdr}`, background: T.surf2 }} />
                : <div aria-hidden="true" style={{ width: 48, height: 48, borderRadius: 8, background: T.surf2, border: `1px solid ${T.bdr}`, display: "flex", alignItems: "center", justifyContent: "center" }}><Building2 size={20} color={T.t3} strokeWidth={1.5} /></div>
              }
              <input ref={logoInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: "none" }} onChange={handleLogoUpload} />
              <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => logoInputRef.current?.click()} disabled={logoUploading}>
                {logoUploading ? t("set_uploading") : t("set_upload_logo")}
              </button>
              {logoUrl && <button onClick={() => { setLogoUrl(null); supabase.auth.updateUser({ data: { logo_url: null } }); }} style={{ background: "none", border: "none", color: T.t3, cursor: "pointer", fontSize: 12, fontFamily: SANS }}>{t("set_remove")}</button>}
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
              <button className="btn btn-ghost" onClick={() => setChangingPw(true)}>{t("set_change_pw")}</button>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input type="password" value={pwCurrent} onChange={e => setPwCurrent(e.target.value)} placeholder={t("set_current_pw")} style={inp} />
                <input type="password" value={pwNew} onChange={e => setPwNew(e.target.value)} placeholder={t("set_new_pw")} style={inp} />
                <input type="password" value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} placeholder={t("set_confirm_pw")} style={inp} />
                {pwError && <div role="alert" style={{ fontFamily: SANS, fontSize: 12, color: T.red }}>{pwError}</div>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-accent" style={{ flex: 1 }} onClick={handlePasswordChange}>{t("set_update_pw")}</button>
                  <button className="btn btn-ghost" onClick={() => { setChangingPw(false); setPwError(""); setPwCurrent(""); setPwNew(""); setPwConfirm(""); }}>{t("set_cancel")}</button>
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
                  <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 14, color: T.t1 }}>{(settingsPlan || "free").charAt(0).toUpperCase() + (settingsPlan || "free").slice(1)} {t("plan_label")}</span>
                  <span style={{ fontFamily: SANS, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 3, background: T.surf3, color: T.brass, border: `1px solid ${T.bdr}` }}>{(settingsPlan || "FREE").toUpperCase()}</span>
                </div>
                <div style={{ fontFamily: SANS, fontSize: 12, color: T.t2 }}>{t("set_plan_limit", { limit: limit === Infinity ? "∞" : limit })}</div>
              </div>
              <button className="btn btn-accent" style={{ padding: "7px 12px", fontSize: 12, flexShrink: 0 }} onClick={onUpgrade}>{t("set_upgrade")}</button>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: SANS, fontSize: 12, color: T.t3, marginBottom: 6 }}>
              <span>{t("set_usage_month")}</span><span className="num">{used} / {limit === Infinity ? "∞" : limit}</span>
            </div>
            <div style={{ height: 4, background: T.surf3, borderRadius: 2 }}><div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: pct >= 90 ? T.red : T.accent, borderRadius: 2 }} /></div>
          </div>
        </Section>

        <Section id="integrations" title={t("set_integrations")} desc="">
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 8 }}>
            <Zap size={15} color={T.t3} strokeWidth={1.5} style={{ flexShrink: 0 }} aria-hidden="true" />
            <span style={{ fontFamily: SANS, fontSize: 13, color: T.t2 }}>
              {t("set_manage_int")}{" "}
              <button onClick={onNavigateToIntegrations}
                style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: T.accent, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
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
                  <button className="btn btn-accent" style={{ flexShrink: 0 }}>Invite</button>
                </div>
              </div>
            </div>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: T.surf2, border: `1px solid ${T.bdr}`, display: "flex", alignItems: "center", justifyContent: "center" }}><Lock size={18} color={T.t3} strokeWidth={1.5} aria-hidden="true" /></div>
              <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 14, color: T.t1 }}>{t("int_coming_soon")}</div>
              <div style={{ fontFamily: SANS, fontSize: 12, color: T.t3, textAlign: "center", maxWidth: 220 }}>{t("set_team_soon")}</div>
            </div>
          </div>
        </Section>

        <Section id="data" title={t("set_export")} desc="">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { label: t("set_export_invoices"), fn: exportInvoices },
              { label: t("set_export_suppliers"), fn: exportSuppliers },
              { label: t("set_export_report"), fn: exportReport },
            ].map(item => (
              <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 8 }}>
                <Download size={14} color={T.t2} strokeWidth={1.75} aria-hidden="true" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: T.t1 }}>{item.label}</div>
                </div>
                <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 12, flexShrink: 0 }} onClick={item.fn}>{t("set_export_btn")}</button>
              </div>
            ))}
          </div>
        </Section>

        <div ref={dangerRef} style={{ scrollMarginTop: 20 }}>
          <div style={{ background: T.redTint, border: `1px solid ${T.redBdr}`, borderRadius: 10, padding: "18px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
              <AlertTriangle size={13} color={T.red} strokeWidth={2} aria-hidden="true" />
              <h2 style={{ fontFamily: SANS, fontWeight: 700, fontSize: 13, color: T.red }}>{t("set_danger_zone")}</h2>
            </div>
            <p style={{ fontFamily: SANS, fontSize: 13, color: T.t2, marginBottom: 14, lineHeight: 1.5 }}>{t("set_danger_desc")}</p>
            {!showDeleteConfirm ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "12px 13px", background: T.surf, border: `1px solid ${T.redBdr}`, borderRadius: 8 }}>
                <div>
                  <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: T.t1 }}>{t("set_delete_account")}</div>
                  {!isMobile && <div style={{ fontFamily: SANS, fontSize: 11, color: T.t3 }}>{t("set_delete_warning")}</div>}
                </div>
                <button className="btn btn-danger" style={{ padding: "6px 12px", fontSize: 12, flexShrink: 0 }} onClick={() => setShowDeleteConfirm(true)}>{t("delete")}</button>
              </div>
            ) : (
              <div style={{ padding: 14, background: T.surf, border: `1px solid ${T.redBdr}`, borderRadius: 8 }}>
                <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, color: T.t1, marginBottom: 4 }}>{t("set_delete_sure")}</div>
                <p style={{ fontFamily: SANS, fontSize: 13, color: T.t2, marginBottom: 12, lineHeight: 1.5 }}>{t("set_delete_perm")} <strong style={{ color: T.red }}>{t("set_delete_undone")}</strong></p>
                <label style={{ fontFamily: SANS, fontSize: 12, color: T.t3, display: "block", marginBottom: 6 }}>{t("set_delete_type")} <strong style={{ fontFamily: MONO, color: T.red }}>DELETE</strong></label>
                <input value={deleteInput} onChange={e => setDeleteInput(e.target.value)} placeholder="DELETE" style={{ ...inp, marginBottom: 10, border: `1px solid ${T.redBdr}` }} />
                {deleteError && <div role="alert" style={{ fontFamily: SANS, fontSize: 12, color: T.red, marginBottom: 10 }}>{deleteError}</div>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-ghost" style={{ flex: 1 }} disabled={deleting} onClick={() => { setShowDeleteConfirm(false); setDeleteInput(""); setDeleteError(null); }}>{t("cancel")}</button>
                  <button disabled={deleteInput !== "DELETE" || deleting} onClick={handleDeleteAccount} style={{ flex: 2, padding: "9px 0", background: deleteInput === "DELETE" && !deleting ? T.red : T.redTint, border: `1px solid ${T.redBdr}`, borderRadius: 6, fontFamily: SANS, fontWeight: 700, fontSize: 13, color: deleteInput === "DELETE" && !deleting ? "#fff" : T.redBdr, cursor: deleteInput === "DELETE" && !deleting ? "pointer" : "not-allowed" }}>
                    {deleting ? t("set_deleting") : t("set_delete_perm_btn")}
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
