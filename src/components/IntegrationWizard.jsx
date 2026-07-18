import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../lib/api";
import { useT, useLang } from "../contexts/AppContexts";
import { FONT_UI as SANS, FONT_DISPLAY as DISPLAY, FONT_MONO as MONO } from "../theme";
import { PROVIDERS, ICONS, DriveNavigator } from "./IntegrationsPage";
import { friendlyErrorCode as sharedFriendlyErrorCode } from "../utils/integrationErrors";
import { X, Check, ArrowRight, Eye, SlidersHorizontal, Unlink } from "lucide-react";

// Per-provider intro copy — what happens and what permissions are requested,
// shown BEFORE the OAuth redirect (or before entering credentials) so
// "Connect" is never a bare button with zero context. Bullets are paired
// with BULLET_ICONS by position: [scope/read-only, what you control, reversibility].
const INTRO_COPY = {
  google_drive: { introKey: "wiz_drive_intro", bullets: ["wiz_drive_b1", "wiz_drive_b2", "wiz_drive_b3"] },
  gmail:        { introKey: "wiz_gmail_intro", bullets: ["wiz_gmail_b1", "wiz_gmail_b2", "wiz_gmail_b3"] },
  green_invoice:{ introKey: "wiz_green_intro", bullets: ["wiz_green_b1", "wiz_green_b2", "wiz_green_b3"] },
  whatsapp:     { introKey: "wiz_wa_intro",    bullets: ["wiz_wa_b1", "wiz_wa_b2", "wiz_wa_b3"] },
};

const BULLET_ICONS = [Eye, SlidersHorizontal, Unlink];

// The user-facing step sequence per provider. 'syncing' is automatic (no user
// action) so it's excluded from the progress dots but still a real step.
const SEQUENCES = {
  google_drive:  ["intro", "configure", "syncing", "done"],
  gmail:         ["intro", "configure", "syncing", "done"],
  green_invoice: ["intro", "auth", "syncing", "done"],
  whatsapp:      ["intro", "share"],
};

const FREQ_OPTIONS = [
  { key: "int_freq_hourly", value: 60 },
  { key: "int_freq_4h",     value: 240 },
  { key: "int_freq_daily",  value: 1440 },
];

const AUTOSYNC_NOTE_KEY = { 60: "wiz_done_autosync_hourly", 240: "wiz_done_autosync_4h", 1440: "wiz_done_autosync_daily" };

function StepDots({ sequence, step }) {
  const T = useT();
  const { t } = useLang();
  const dotSteps = sequence.filter(s => s !== "syncing");
  const activeIdx = step === "syncing" ? dotSteps.length - 1 : dotSteps.indexOf(step);
  if (dotSteps.length < 2) return null;
  return (
    <div style={{ textAlign: "center", marginBottom: 22 }}>
      <div style={{ fontFamily: SANS, fontSize: 11, color: T.t3, marginBottom: 8 }}>
        {t("wiz_step_of", { n: activeIdx + 1, total: dotSteps.length })}
      </div>
      <div style={{ display: "flex", gap: 6, justifyContent: "center" }} aria-hidden="true">
        {dotSteps.map((s, i) => (
          <span key={s} style={{
            width: i === activeIdx ? 18 : 6, height: 6, borderRadius: 3,
            background: i <= activeIdx ? T.accent : T.surf3,
            transition: "all .25s ease",
          }} />
        ))}
      </div>
    </div>
  );
}

export default function IntegrationWizard({ type, initialStep, integration, onClose, onRefresh, onInvoicesRefresh, onStartSync, syncJobs, showToast }) {
  const T = useT();
  const { t } = useLang();
  const cfg = PROVIDERS[type];
  const Icon = ICONS[type];
  const intro = INTRO_COPY[type];
  const sequence = SEQUENCES[type];
  const friendlyErrorCode = (msg) => sharedFriendlyErrorCode(msg, t);
  const friendlyError = (e) => friendlyErrorCode(e.message);

  const [step, setStep] = useState(initialStep || "intro");
  const [liveIntegration, setLiveIntegration] = useState(integration || null);
  useEffect(() => { if (integration) setLiveIntegration(integration); }, [integration]);

  const refreshSelf = useCallback(async () => {
    try {
      const { integrations } = await apiFetch("/api/integrations");
      const fresh = integrations.find(i => i.type === type);
      setLiveIntegration(fresh || null);
      onRefresh?.();
      return fresh;
    } catch { return null; }
  }, [type, onRefresh]);

  // ── Configure-step local state (Drive / Gmail) ──────────────────────────────
  const [selectedFolder, setSelectedFolder] = useState(liveIntegration?.config?.folder_id || "");
  const [selectedFolderName, setSelectedFolderName] = useState(liveIntegration?.config?.folder_name || "");
  const [labels, setLabels] = useState(null);
  const [labelsLoading, setLabelsLoading] = useState(false);
  const [selectedLabels, setSelectedLabels] = useState([]);
  const [fromFilter, setFromFilter] = useState("");
  const [subjFilter, setSubjFilter] = useState("");
  const [lookbackDays, setLookbackDays] = useState(0);
  const [autoSync, setAutoSync] = useState(true);
  const [syncFreq, setSyncFreq] = useState(60);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (step === "configure" && type === "gmail" && labels === null && !labelsLoading) {
      setLabelsLoading(true);
      apiFetch("/api/integrations/google/labels")
        .then(d => setLabels(d.labels || []))
        .catch(() => setLabels([]))
        .finally(() => setLabelsLoading(false));
    }
  }, [step, type, labels, labelsLoading]);

  const toggleLabel = id => setSelectedLabels(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  // ── Green Invoice auth-step local state ─────────────────────────────────────
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [authErr, setAuthErr] = useState(null);
  const [connecting, setConnecting] = useState(false);

  // ── Sync-step state ──────────────────────────────────────────────────────────
  const [syncResult, setSyncResult] = useState(null);
  const activeJob = liveIntegration ? syncJobs?.[liveIntegration.id] : null;

  useEffect(() => {
    if (step !== "syncing" || type !== "google_drive" || !activeJob) return;
    if (activeJob.done) {
      setSyncResult({ added: activeJob.added || 0, dupes: activeJob.dupes || 0, totalFiles: activeJob.totalFiles || 0 });
      if (activeJob.added > 0) onInvoicesRefresh?.();
      setStep("done");
    } else if (activeJob.error) {
      setSyncResult({ error: friendlyErrorCode(activeJob.error) });
      setStep("done");
    }
  }, [activeJob, step, type, onInvoicesRefresh]);

  const triggerFirstSync = async (integrationId) => {
    setStep("syncing");
    setSyncResult(null);
    if (type === "google_drive") {
      try {
        const res = await onStartSync(integrationId, `/api/integrations/${integrationId}/sync`);
        if (!res.jobId) { setSyncResult({ added: 0, totalFiles: res.totalFiles || 0 }); setStep("done"); }
        // else: job running — the useEffect above watches syncJobs and transitions to 'done'
      } catch (e) { setSyncResult({ error: e.message }); setStep("done"); }
    } else {
      try {
        const res = await apiFetch(`/api/integrations/${integrationId}/sync`, { method: "POST" });
        setSyncResult({ added: res.added || 0, dupes: res.skipped || 0, totalFiles: res.filesFound || 0 });
        if (res.added > 0) onInvoicesRefresh?.();
      } catch (e) { setSyncResult({ error: e.message }); }
      setStep("done");
    }
  };

  const handleIntroContinue = async () => {
    if (type === "whatsapp") {
      setConnecting(true);
      try {
        await apiFetch("/api/integrations/whatsapp", { method: "POST" });
        await refreshSelf();
        setStep("share");
      } catch (e) { showToast(friendlyError(e), false); }
      finally { setConnecting(false); }
      return;
    }
    if (type === "green_invoice") { setStep("auth"); return; }
    // OAuth (Drive / Gmail) — leaves the app
    setConnecting(true);
    try {
      const { url } = await apiFetch(
        `/api/integrations/google/auth-url?type=${type}&returnUrl=${encodeURIComponent(window.location.origin + "/app")}`
      );
      window.location.href = url;
    } catch (e) { showToast(friendlyError(e), false); setConnecting(false); }
  };

  const handleGreenInvoiceConnect = async () => {
    if (!apiKey || !apiSecret) { setAuthErr(t("int_gi_both_required")); return; }
    setConnecting(true); setAuthErr(null);
    try {
      await apiFetch("/api/integrations/green-invoice", { method: "POST", body: { apiKey, apiSecret } });
      const fresh = await refreshSelf();
      await triggerFirstSync(fresh?.id);
    } catch (e) { setAuthErr(friendlyError(e)); setConnecting(false); }
  };

  const handleFinishConfigure = async () => {
    setSaving(true);
    try {
      const config = type === "google_drive"
        ? { folder_id: selectedFolder, folder_name: selectedFolderName, lookback_days: lookbackDays }
        : { label_ids: selectedLabels, label_names: selectedLabels.map(id => labels?.find(l => l.id === id)?.name).filter(Boolean), filters: { from: fromFilter, subject: subjFilter }, lookback_days: lookbackDays };
      await apiFetch(`/api/integrations/${liveIntegration.id}/config`, { method: "PATCH", body: { config } });
      await apiFetch(`/api/integrations/${liveIntegration.id}/auto-sync`, { method: "PATCH", body: { auto_sync_enabled: autoSync, sync_frequency_min: syncFreq } });
      const fresh = await refreshSelf();
      await triggerFirstSync(fresh?.id || liveIntegration.id);
    } catch (e) { showToast(e.message, false); }
    finally { setSaving(false); }
  };

  const titleForStep = {
    intro: t("wiz_connect_title", { label: cfg.label }),
    configure: t("wiz_configure_title", { label: cfg.label }),
    auth: t("wiz_configure_title", { label: cfg.label }),
    syncing: t("wiz_syncing_title"),
    done: t("wiz_done_title"),
    share: t("wiz_wa_share_title"),
  }[step];

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && step !== "syncing" && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={titleForStep} style={{ maxWidth: step === "configure" ? 520 : 460 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 11, background: cfg.accent, boxShadow: `0 0 0 1px ${cfg.color}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon size={20} />
            </span>
            <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 16, color: T.t1 }}>{titleForStep}</span>
          </div>
          {step !== "syncing" && (
            <button onClick={onClose} aria-label={t("close")} style={{ width: 30, height: 30, borderRadius: 8, background: T.surf2, border: `1px solid ${T.bdr}`, color: T.t2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <X size={15} />
            </button>
          )}
        </div>

        <StepDots sequence={sequence} step={step} />

        <div key={step} style={{ animation: "slideUp .28s cubic-bezier(.16,1,.3,1)" }}>

        {/* ── intro ── */}
        {step === "intro" && (
          <>
            <p style={{ fontFamily: SANS, fontSize: 13.5, color: T.t2, lineHeight: 1.6, marginBottom: 16 }}>{t(intro.introKey)}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
              {intro.bullets.map((k, i) => {
                const BulletIcon = BULLET_ICONS[i] || Eye;
                return (
                  <div key={k} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                    <BulletIcon size={14} color={T.accent} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
                    <span style={{ fontFamily: SANS, fontSize: 12.5, color: T.t2, lineHeight: 1.5 }}>{t(k)}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" onClick={onClose}>{t("cancel")}</button>
              <button className="btn btn-accent" disabled={connecting} onClick={handleIntroContinue}>
                {connecting ? t("int_connecting") : cfg.authType === "oauth" ? t("wiz_continue_google") : cfg.authType === "apikey" ? t("wiz_get_started") : t("int_connect")}
                {!connecting && <ArrowRight size={12} aria-hidden="true" />}
              </button>
            </div>
          </>
        )}

        {/* ── auth (Green Invoice) ── */}
        {step === "auth" && (
          <>
            <p style={{ fontFamily: SANS, fontSize: 13, color: T.t2, marginBottom: 16 }}>{t("int_gi_instructions")}</p>
            {[["int_gi_api_key", apiKey, setApiKey], ["int_gi_api_secret", apiSecret, setApiSecret]].map(([labelKey, val, setter]) => (
              <div key={labelKey} style={{ marginBottom: 14 }}>
                <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 600, color: T.t3, marginBottom: 6, textTransform: "uppercase", letterSpacing: ".5px" }}>{t(labelKey)}</div>
                <input type="text" value={val} className="input" aria-label={t(labelKey)} onChange={e => setter(e.target.value)} />
              </div>
            ))}
            {authErr && <div role="alert" style={{ color: T.red, fontFamily: SANS, fontSize: 12, marginBottom: 12 }}>{authErr}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
              <button className="btn btn-ghost" onClick={() => setStep("intro")}>{t("back")}</button>
              <button className="btn btn-accent" disabled={connecting} onClick={handleGreenInvoiceConnect}>
                {connecting ? t("int_connecting") : t("int_connect")}
              </button>
            </div>
          </>
        )}

        {/* ── configure (Drive / Gmail) ── */}
        {step === "configure" && (
          <>
            {type === "google_drive" && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 600, color: T.t3, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 10 }}>{t("int_sync_folder")}</div>
                <DriveNavigator selectedFolder={selectedFolder} selectedFolderName={selectedFolderName}
                  onSelect={(id, name) => { setSelectedFolder(id); setSelectedFolderName(name || ""); }} />
              </div>
            )}
            {type === "gmail" && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 600, color: T.t3, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 8 }}>{t("int_labels_to_scan")}</div>
                {labelsLoading ? (
                  <div style={{ color: T.t3, fontFamily: SANS, fontSize: 12 }}>{t("int_loading_labels")}</div>
                ) : !labels?.length ? (
                  <div style={{ color: T.t3, fontFamily: SANS, fontSize: 12 }}>{t("int_no_labels")}</div>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                    {labels.map(l => (
                      <label key={l.id} style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", padding: "5px 12px", borderRadius: 20, fontFamily: SANS, fontSize: 12, background: selectedLabels.includes(l.id) ? T.accentTint : T.surf2, border: `1px solid ${selectedLabels.includes(l.id) ? T.accent : T.surf3}`, color: selectedLabels.includes(l.id) ? T.accent : T.t2 }}>
                        <input type="checkbox" checked={selectedLabels.includes(l.id)} onChange={() => toggleLabel(l.id)} style={{ accentColor: T.accent, width: 12, height: 12 }} />
                        {l.name}
                      </label>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div>
                    <div style={{ fontFamily: SANS, fontSize: 11, color: T.t3, marginBottom: 4 }}>{t("int_filter_from")}</div>
                    <input type="text" className="input" placeholder={t("int_filter_from_placeholder")} aria-label={t("int_filter_from")} value={fromFilter} onChange={e => setFromFilter(e.target.value)} style={{ fontSize: 12 }} />
                  </div>
                  <div>
                    <div style={{ fontFamily: SANS, fontSize: 11, color: T.t3, marginBottom: 4 }}>{t("int_filter_subject")}</div>
                    <input type="text" className="input" placeholder={t("int_filter_subject_placeholder")} aria-label={t("int_filter_subject")} value={subjFilter} onChange={e => setSubjFilter(e.target.value)} style={{ fontSize: 12 }} />
                  </div>
                </div>
              </div>
            )}

            {/* Sync preferences — grouped separately from the source picker above so
                the primary decision (what to sync) isn't visually flattened together
                with secondary, sensibly-defaulted options. */}
            <div style={{ border: `1px solid ${T.bdr}`, borderRadius: 10, padding: "14px 14px 16px", marginBottom: 20, background: T.surf2 }}>
              <div style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 700, color: T.t3, textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 12 }}>
                {t("wiz_sync_prefs")}
              </div>

              <div style={{ marginBottom: 14 }}>
                <div style={{ fontFamily: SANS, fontSize: 12, color: T.t2, marginBottom: 6 }}>{t("int_lookback_title")}</div>
                <select value={lookbackDays} onChange={e => setLookbackDays(Number(e.target.value))} className="input" aria-label={t("int_lookback_title")} style={{ fontSize: 12, padding: "6px 10px" }}>
                  <option value={0}>{t("int_lookback_smart")}</option>
                  <option value={7}>{t("int_lookback_7")}</option>
                  <option value={30}>{t("int_lookback_30")}</option>
                  <option value={90}>{t("int_lookback_90")}</option>
                </select>
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontFamily: SANS, fontSize: 13, color: T.t2, marginBottom: autoSync ? 10 : 0 }}>
                <input type="checkbox" checked={autoSync} onChange={e => setAutoSync(e.target.checked)} style={{ accentColor: T.accent, width: 14, height: 14 }} />
                {t("int_auto_sync_enabled")}
              </label>
              {autoSync && (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontFamily: SANS, fontSize: 12, color: T.t3 }}>{t("int_frequency")}:</span>
                  <select value={syncFreq} onChange={e => setSyncFreq(Number(e.target.value))} className="input" aria-label={t("int_frequency")} style={{ width: "auto", fontSize: 12, padding: "5px 10px" }}>
                    {FREQ_OPTIONS.map(o => <option key={o.value} value={o.value}>{t(o.key)}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
              <button onClick={onClose} style={{ background: "none", border: "none", color: T.t3, cursor: "pointer", fontFamily: SANS, fontSize: 12, textDecoration: "underline", padding: 0 }}>{t("wiz_skip_for_now")}</button>
              <button className="btn btn-accent" disabled={saving} onClick={handleFinishConfigure}>
                {saving ? t("int_saving") : t("wiz_save_sync")}
              </button>
            </div>
          </>
        )}

        {/* ── syncing (automatic) ── */}
        {step === "syncing" && (
          <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
              <span className="scanline" aria-hidden="true" style={{ width: 44, height: 56, borderRadius: 8, background: T.surf3, border: `1px solid ${T.bdr2}`, display: "block" }} />
            </div>
            <p style={{ fontFamily: SANS, fontSize: 13, color: T.t2, marginBottom: 4 }}>
              {type === "google_drive" ? t("wiz_syncing_sub_drive") : type === "gmail" ? t("wiz_syncing_sub_gmail") : t("wiz_syncing_sub_green")}
              {activeJob?.totalFiles > 0 && <span className="num"> · {Math.min(activeJob.cursor || 0, activeJob.totalFiles)}/{activeJob.totalFiles}</span>}
            </p>
            <p style={{ fontFamily: SANS, fontSize: 11.5, color: T.t3 }}>{t("wiz_syncing_hint")}</p>
          </div>
        )}

        {/* ── done ── */}
        {step === "done" && (
          <div style={{ textAlign: "center", padding: "4px 0" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: syncResult?.error ? T.amberTint : T.greenTint, border: `1px solid ${syncResult?.error ? T.amberBdr : T.greenBdr}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <Check size={24} color={syncResult?.error ? T.amber : T.green} strokeWidth={2} aria-hidden="true" />
            </div>
            {!syncResult?.error && syncResult?.added > 0 && (
              <div className="num" style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 34, color: T.t1, lineHeight: 1.1 }}>
                {syncResult.added}
              </div>
            )}
            <p style={{ fontFamily: SANS, fontSize: 13.5, color: T.t2, marginBottom: syncResult?.error || !(autoSync && (type === "google_drive" || type === "gmail")) ? 22 : 12, lineHeight: 1.6 }}>
              {syncResult?.error
                ? t("wiz_done_error", { error: syncResult.error })
                : syncResult?.added > 0
                  ? t("wiz_done_added")
                  : t("wiz_done_none")}
            </p>
            {!syncResult?.error && autoSync && (type === "google_drive" || type === "gmail") && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 20, background: T.surf2, border: `1px solid ${T.bdr}`, fontFamily: SANS, fontSize: 11.5, color: T.t2, marginBottom: 22 }}>
                ↻ {t(AUTOSYNC_NOTE_KEY[syncFreq] || "wiz_done_autosync_hourly")}
              </div>
            )}
            <button className="btn btn-accent" onClick={onClose} style={{ width: "100%" }}>{t("wiz_finish")}</button>
          </div>
        )}

        {/* ── share (WhatsApp) ── */}
        {step === "share" && liveIntegration?.config?.wa_link && (
          <div>
            <div style={{ fontFamily: SANS, fontSize: 11, fontWeight: 600, color: T.t3, marginBottom: 8, textTransform: "uppercase", letterSpacing: ".5px" }}>{t("int_inbox_code")}</div>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
              <span className="num" style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, letterSpacing: 4, color: "#25d366", background: "rgba(37,211,102,0.08)", border: "1px solid rgba(37,211,102,0.25)", borderRadius: 10, padding: "8px 18px" }}>
                {liveIntegration.config.inbox_code}
              </span>
            </div>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap" }}>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=110x110&color=25d366&bgcolor=${T.isDark ? "0d1626" : "ffffff"}&data=${encodeURIComponent(liveIntegration.config.wa_link)}`}
                alt={t("int_wa_qr_alt")} width={110} height={110}
                style={{ borderRadius: 10, border: `1px solid ${T.bdr}`, flexShrink: 0 }} />
              <div style={{ fontFamily: SANS, fontSize: 12, color: T.t2, lineHeight: 1.6, flex: 1, minWidth: 180 }}>
                <div style={{ color: T.t1, fontWeight: 600, marginBottom: 4 }}>{t("int_wa_how_to")}</div>
                <ol style={{ margin: 0, paddingInlineStart: 16 }}>
                  <li>{t("int_wa_step1")}</li>
                  <li>{t("int_wa_step2")}</li>
                  <li>{t("int_wa_step3")}</li>
                </ol>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", background: T.surf2, borderRadius: 8, padding: "8px 12px", border: `1px solid ${T.bdr}`, marginBottom: 20 }}>
              <code style={{ fontFamily: MONO, fontSize: 11, color: T.accent, flex: 1, wordBreak: "break-all" }}>{liveIntegration.config.wa_link}</code>
              <button onClick={() => navigator.clipboard.writeText(liveIntegration.config.wa_link)} style={{ padding: "3px 10px", background: T.surf3, border: "none", borderRadius: 6, color: T.t2, cursor: "pointer", fontFamily: SANS, fontSize: 11, flexShrink: 0 }}>{t("int_copy")}</button>
            </div>
            <button className="btn btn-accent" onClick={onClose} style={{ width: "100%" }}>{t("wiz_finish")}</button>
          </div>
        )}

        </div>
      </div>
    </div>
  );
}
