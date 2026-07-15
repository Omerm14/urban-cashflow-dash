import { useState, useEffect, useCallback, useRef } from "react";
import { useT, useLang } from "../contexts/AppContexts";
import { FONT_UI as SANS, FONT_MONO as MONO } from "../theme";
import { apiFetch } from "../lib/api";
import { Ban, Trash2, Pencil, Check, X, AlertTriangle } from "lucide-react";

// `basic` is retired from sale but kept here so admins can still view/manage legacy accounts.
const PLAN_KEYS = ["free", "basic", "starter", "pro", "enterprise"];
const STATUS_KEYS = ["active", "canceled", "past_due", "trialing"];
const TABS = ["usage", "users", "subscriptions"];

const th = { padding: "10px 14px", textAlign: "start", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" };
const td = { padding: "10px 14px", fontSize: 13 };

export default function AdminPage() {
  const T = useT();
  const { t } = useLang();
  const [tab, setTab] = useState("usage");

  return (
    <div>
      <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 20, color: T.t1, marginBottom: 4 }}>{t("admin_title")}</div>
      <div style={{ fontFamily: SANS, fontSize: 13, color: T.t3, marginBottom: 20 }}>{t("admin_sub")}</div>

      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: `1px solid ${T.bdr}` }}>
        {TABS.map(tb => (
          <button key={tb} onClick={() => setTab(tb)} style={{
            padding: "9px 16px", background: "none", border: "none", cursor: "pointer",
            fontFamily: SANS, fontSize: 13, fontWeight: 600,
            color: tab === tb ? T.accent : T.t3,
            borderBottom: `2px solid ${tab === tb ? T.accent : "transparent"}`,
            marginBottom: -1,
          }}>
            {t(`admin_tab_${tb}`)}
          </button>
        ))}
      </div>

      {tab === "usage" && <UsageTab />}
      {tab === "users" && <UsersTab />}
      {tab === "subscriptions" && <SubscriptionsTab />}
    </div>
  );
}

// ─── Usage (Claude API cost dashboard) ───────────────────────────────────────

function UsageTab() {
  const T = useT();
  const { t } = useLang();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch("/api/admin/usage").then(setData).catch(e => setError(e.message));
  }, []);

  if (error) return <div role="alert" style={{ padding: 40, color: T.red, textAlign: "center", fontFamily: SANS }}>{error}</div>;
  if (!data) return <div style={{ padding: 40, color: T.t3, textAlign: "center", fontFamily: SANS }}>{t("loading")}</div>;

  const { totals, byUser, timeline } = data;
  const maxBar = Math.max(...(timeline?.map(d => d.calls) ?? [1]), 1);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 24 }}>
        {[
          [t("admin_usage_calls"), totals.calls],
          [t("admin_usage_input_tokens"), totals.inputTokens.toLocaleString()],
          [t("admin_usage_output_tokens"), totals.outputTokens.toLocaleString()],
          [t("admin_usage_est_cost"), `$${totals.estimatedCostUSD.toFixed(4)}`],
        ].map(([label, val]) => (
          <div key={label} className="card" style={{ padding: "18px 20px" }}>
            <div style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 700, color: T.t3, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{label}</div>
            <div className="num" style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: T.t1 }}>{val}</div>
          </div>
        ))}
      </div>

      {timeline?.length > 0 && (
        <div className="card" style={{ padding: 20, marginBottom: 24 }}>
          <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 700, color: T.t3, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>{t("admin_usage_daily")}</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 80 }}>
            {timeline.map(d => (
              <div key={d.date} style={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end" }}>
                <div style={{ width: "100%", background: T.accent, borderRadius: 3, height: `${(d.calls / maxBar) * 100}%`, minHeight: 2 }} title={`${d.date}: ${d.calls}`} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: SANS }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${T.bdr}` }}>
              {[t("admin_col_email"), t("admin_usage_calls"), t("admin_usage_input_tokens"), t("admin_usage_output_tokens"), t("admin_usage_est_cost")].map(h => (
                <th key={h} style={{ ...th, color: T.t3 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {byUser.length === 0 && (
              <tr><td colSpan={5} style={{ padding: "32px 0", textAlign: "center", color: T.t3, fontFamily: SANS, fontSize: 13 }}>{t("admin_usage_empty")}</td></tr>
            )}
            {byUser.map(u => (
              <tr key={u.email} className="row-hover" style={{ borderTop: `1px solid ${T.bdr}` }}>
                <td style={{ ...td, color: T.t1, fontWeight: 500 }}>{u.email}</td>
                <td className="num" style={{ ...td, color: T.t2 }}>{u.calls}</td>
                <td className="num" style={{ ...td, color: T.t2 }}>{u.inputTokens.toLocaleString()}</td>
                <td className="num" style={{ ...td, color: T.t2 }}>{u.outputTokens.toLocaleString()}</td>
                <td className="num" style={{ ...td, color: T.accent, fontWeight: 600 }}>${u.estimatedCostUSD.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Users ────────────────────────────────────────────────────────────────────

function UsersTab() {
  const T = useT();
  const { t, lang } = useLang();
  const locale = lang === "he" ? "he-IL" : "en-GB";
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const debounceRef = useRef(null);

  const showToast = (text, ok) => { setToast({ text, ok }); setTimeout(() => setToast(null), 4000); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, perPage: 20, ...(query ? { query } : {}) });
      setData(await apiFetch(`/api/admin/users?${params}`));
    } catch (e) { showToast(e.message, false); }
    finally { setLoading(false); }
  }, [page, query]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setPage(1), 400);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const handleBan = async (u) => {
    setBusyId(u.id);
    try {
      await apiFetch(`/api/admin/users/${u.id}/${u.bannedUntil ? "unban" : "ban"}`, { method: "POST" });
      showToast(u.bannedUntil ? t("admin_unbanned_ok") : t("admin_banned_ok"), true);
      load();
    } catch (e) { showToast(e.message, false); }
    finally { setBusyId(null); }
  };

  const handleDelete = async (u) => {
    if (!confirm(t("admin_delete_user_confirm", { email: u.email }))) return;
    setBusyId(u.id);
    try {
      await apiFetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
      showToast(t("admin_deleted_ok"), true);
      load();
    } catch (e) { showToast(e.message, false); }
    finally { setBusyId(null); }
  };

  return (
    <div>
      {toast && (
        <div role="status" style={{ marginBottom: 14, padding: "8px 14px", borderRadius: 8, fontFamily: SANS, fontSize: 13, background: toast.ok ? T.greenTint : T.redTint, border: `1px solid ${toast.ok ? T.greenBdr : T.redBdr}`, color: toast.ok ? T.green : T.red }}>
          {toast.text}
        </div>
      )}
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder={t("admin_search_users")}
        aria-label={t("admin_search_users")}
        className="input"
        style={{ marginBottom: 14, maxWidth: 320 }}
      />
      {loading ? (
        <div style={{ padding: 32, textAlign: "center", color: T.t3, fontFamily: SANS, fontSize: 13 }}>{t("loading")}</div>
      ) : (
        <>
          <div className="card" style={{ overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: SANS }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.bdr}` }}>
                  {[t("admin_col_email"), t("admin_col_signup"), t("admin_col_plan"), t("admin_col_status"), t("admin_col_usage"), t("admin_col_actions")].map(h => (
                    <th key={h} style={{ ...th, color: T.t3 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(!data?.users || data.users.length === 0) && (
                  <tr><td colSpan={6} style={{ padding: "32px 0", textAlign: "center", color: T.t3, fontSize: 13 }}>{t("admin_no_users")}</td></tr>
                )}
                {data?.users.map(u => (
                  <tr key={u.id} className="row-hover" style={{ borderTop: `1px solid ${T.bdr}` }}>
                    <td style={{ ...td, color: T.t1, fontWeight: 500 }}>
                      {u.email}
                      {u.bannedUntil && <span style={{ marginInlineStart: 8, fontSize: 10, fontWeight: 700, color: T.red, background: T.redTint, border: `1px solid ${T.redBdr}`, borderRadius: 10, padding: "2px 7px" }}>{t("admin_banned")}</span>}
                    </td>
                    <td className="num" style={{ ...td, color: T.t3 }}>{new Date(u.createdAt).toLocaleDateString(locale)}</td>
                    <td style={{ ...td, color: T.t2, textTransform: "capitalize" }}>{u.plan}</td>
                    <td style={{ ...td, color: T.t2, textTransform: "capitalize" }}>{u.status}</td>
                    <td className="num" style={{ ...td, color: T.t2 }}>{u.invoicesThisMonth}</td>
                    <td style={{ ...td, display: "flex", gap: 6 }}>
                      <button onClick={() => handleBan(u)} disabled={busyId === u.id} aria-label={u.bannedUntil ? t("admin_unban") : t("admin_ban")}
                        title={u.bannedUntil ? t("admin_unban") : t("admin_ban")}
                        style={{ padding: "4px 8px", background: "transparent", border: `1px solid ${T.bdr}`, borderRadius: 5, color: u.bannedUntil ? T.green : T.amber, cursor: "pointer", display: "flex", alignItems: "center" }}>
                        <Ban size={12} />
                      </button>
                      <button onClick={() => handleDelete(u)} disabled={busyId === u.id} aria-label={t("admin_delete_user")} title={t("admin_delete_user")}
                        style={{ padding: "4px 8px", background: "transparent", border: `1px solid ${T.redBdr}`, borderRadius: 5, color: T.red, cursor: "pointer", display: "flex", alignItems: "center" }}>
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data?.total > data?.perPage && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", marginTop: 14, fontFamily: SANS, fontSize: 12, color: T.t3 }}>
              <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t("admin_prev_page")}</button>
              <span>{t("admin_page_of", { page, total: Math.ceil(data.total / data.perPage) })}</span>
              <button className="btn btn-ghost" disabled={page >= Math.ceil(data.total / data.perPage)} onClick={() => setPage(p => p + 1)}>{t("admin_next_page")}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

function SubscriptionsTab() {
  const T = useT();
  const { t } = useLang();
  const [subs, setSubs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [editId, setEditId] = useState(null);
  const [editData, setEditData] = useState({});
  const [saving, setSaving] = useState(false);

  const showToast = (text, ok) => { setToast({ text, ok }); setTimeout(() => setToast(null), 4000); };

  const load = useCallback(async () => {
    setLoading(true);
    try { setSubs((await apiFetch("/api/admin/subscriptions")).subscriptions); }
    catch (e) { showToast(e.message, false); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const startEdit = s => { setEditId(s.userId); setEditData({ plan: s.plan, status: s.status }); };

  const saveOverride = async (userId) => {
    setSaving(true);
    try {
      await apiFetch(`/api/admin/subscriptions/${userId}`, { method: "PATCH", body: editData });
      showToast(t("admin_override_saved"), true);
      setEditId(null);
      load();
    } catch (e) { showToast(e.message, false); }
    finally { setSaving(false); }
  };

  if (loading) return <div style={{ padding: 32, textAlign: "center", color: T.t3, fontFamily: SANS, fontSize: 13 }}>{t("loading")}</div>;

  return (
    <div>
      {toast && (
        <div role="status" style={{ marginBottom: 14, padding: "8px 14px", borderRadius: 8, fontFamily: SANS, fontSize: 13, background: toast.ok ? T.greenTint : T.redTint, border: `1px solid ${toast.ok ? T.greenBdr : T.redBdr}`, color: toast.ok ? T.green : T.red }}>
          {toast.text}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 16, padding: "10px 14px", background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 8, fontFamily: SANS, fontSize: 12, color: T.t2 }}>
        <AlertTriangle size={14} color={T.amber} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>{t("admin_override_note")}</span>
      </div>
      <div className="card" style={{ overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: SANS }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${T.bdr}` }}>
              {[t("admin_col_email"), t("admin_col_plan"), t("admin_col_status"), t("admin_col_provider"), t("admin_col_actions")].map(h => (
                <th key={h} style={{ ...th, color: T.t3 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(!subs || subs.length === 0) && (
              <tr><td colSpan={5} style={{ padding: "32px 0", textAlign: "center", color: T.t3, fontSize: 13 }}>{t("admin_no_subscriptions")}</td></tr>
            )}
            {subs?.map(s => (
              <tr key={s.userId} className="row-hover" style={{ borderTop: `1px solid ${T.bdr}` }}>
                <td style={{ ...td, color: T.t1, fontWeight: 500 }}>{s.email}</td>
                {editId === s.userId ? (
                  <>
                    <td style={td}>
                      <select value={editData.plan} onChange={e => setEditData(d => ({ ...d, plan: e.target.value }))} className="input" style={{ fontSize: 12, padding: "4px 8px" }}>
                        {PLAN_KEYS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </td>
                    <td style={td}>
                      <select value={editData.status} onChange={e => setEditData(d => ({ ...d, status: e.target.value }))} className="input" style={{ fontSize: 12, padding: "4px 8px" }}>
                        {STATUS_KEYS.map(s2 => <option key={s2} value={s2}>{s2}</option>)}
                      </select>
                    </td>
                    <td style={td} />
                    <td style={{ ...td, display: "flex", gap: 6 }}>
                      <button onClick={() => saveOverride(s.userId)} disabled={saving} aria-label={t("save")} style={{ padding: "4px 8px", background: T.greenTint, border: `1px solid ${T.greenBdr}`, borderRadius: 5, color: T.green, cursor: "pointer", display: "flex", alignItems: "center" }}><Check size={12} /></button>
                      <button onClick={() => setEditId(null)} aria-label={t("cancel")} style={{ padding: "4px 8px", background: "transparent", border: `1px solid ${T.bdr}`, borderRadius: 5, color: T.t2, cursor: "pointer", display: "flex", alignItems: "center" }}><X size={12} /></button>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{ ...td, color: T.t2, textTransform: "capitalize" }}>{s.plan}</td>
                    <td style={{ ...td, color: T.t2, textTransform: "capitalize" }}>{s.status}</td>
                    <td style={td}>
                      {s.providerConflict ? (
                        <span title={`Stripe: ${s.stripeSubscriptionId || "—"} / Meshulam: ${s.meshulamSubscriptionRef || "—"}`}
                          style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: T.amber, background: T.amberTint, border: `1px solid ${T.amberBdr}`, borderRadius: 10, padding: "2px 8px" }}>
                          <AlertTriangle size={10} /> {t("admin_conflict")}
                        </span>
                      ) : (s.stripeSubscriptionId ? "Stripe" : s.meshulamSubscriptionRef ? "Meshulam" : "—")}
                    </td>
                    <td style={td}>
                      <button onClick={() => startEdit(s)} aria-label={t("admin_override")} title={t("admin_override")}
                        style={{ padding: "4px 8px", background: "transparent", border: `1px solid ${T.bdr}`, borderRadius: 5, color: T.t2, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
                        <Pencil size={11} /> {t("admin_override")}
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
