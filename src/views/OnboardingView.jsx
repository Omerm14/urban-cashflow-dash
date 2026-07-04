import { useState, useEffect } from "react";
import { useT, useLayout, useLang } from "../contexts/AppContexts";
import { FONT_UI as SANS, FONT_DISPLAY as DISPLAY, FONT_MONO as MONO } from "../theme";
import { fmt, fmtDate } from "../utils/format";
import { apiFetch } from "../lib/api";
import { Upload, ArrowRight, Check } from "lucide-react";

// `type` matches the integrations table; used to show real connection state.
const SOURCES = [
  { id: "gmail", type: "gmail", name: "Gmail", glyph: "M", color: "#EA4335", descKey: "ob_gmail_desc" },
  { id: "drive", type: "google_drive", name: "Google Drive", glyph: "D", color: "#3987E5", descKey: "ob_drive_desc" },
  { id: "whatsapp", type: "whatsapp", name: "WhatsApp", glyph: "W", color: "#25D366", descKey: "ob_wa_desc" },
  { id: "greeninvoice", type: "green_invoice", name: "Green Invoice", glyph: "ח", color: "#3DD6A3", descKey: "ob_gi_desc" },
];

// First-run experience: shown while the account has no invoices, and through the
// first extraction so the user watches their first invoice get read.
export default function OnboardingView({ onUploadClick, onNavigate, extracting, uploadProgress, invoices, onContinue }) {
  const T = useT();
  const { t } = useLang();
  const { isMobile } = useLayout();
  const firstInvoice = invoices.length > 0 ? invoices[invoices.length - 1] : null;
  const phase = firstInvoice ? "done" : extracting ? "reading" : "connect";

  // Show real connection state on the source cards.
  const [connectedTypes, setConnectedTypes] = useState(new Set());
  useEffect(() => {
    let mounted = true;
    apiFetch("/api/integrations")
      .then(({ integrations }) => {
        if (!mounted || !Array.isArray(integrations)) return;
        setConnectedTypes(new Set(integrations.filter(i => i.status !== "disconnected").map(i => i.type)));
      })
      .catch(() => { /* card links still work without status */ });
    return () => { mounted = false; };
  }, []);

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: isMobile ? "24px 0 60px" : "48px 0 80px", animation: "slideUp 0.4s cubic-bezier(.16,1,.3,1)" }}>
      <style>{`
        .ob-field { animation: kpiIn .4s ease both; }
      `}</style>

      {phase !== "done" && (
        <>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <h1 style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: isMobile ? 24 : 32, letterSpacing: "-0.02em", color: T.t1, marginBottom: 10 }}>
              {t("ob_title")}
            </h1>
            <p style={{ fontFamily: SANS, fontSize: 15, color: T.t2, maxWidth: 480, margin: "0 auto", lineHeight: 1.6 }}>
              {t("ob_sub")}
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
            {SOURCES.map(src => (
              <button key={src.id} onClick={() => onNavigate("integrations")}
                className="card"
                style={{ padding: 16, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 9, cursor: "pointer", textAlign: "start", transition: "transform .18s, border-color .18s" }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.borderColor = T.bdr2; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.borderColor = T.bdr; }}>
                <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 9, background: `${src.color}22`, color: src.color, display: "grid", placeItems: "center", fontFamily: DISPLAY, fontWeight: 700, fontSize: 14 }}>{src.glyph}</span>
                <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 13.5, color: T.t1 }}>{src.name}</span>
                <span style={{ fontFamily: SANS, fontSize: 11.5, color: T.t3, lineHeight: 1.45 }}>{t(src.descKey)}</span>
                {connectedTypes.has(src.type) ? (
                  <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 600, color: T.green, display: "inline-flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                    <Check size={11} aria-hidden="true" /> {t("int_connected")}
                  </span>
                ) : (
                  <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 600, color: T.accent, display: "inline-flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                    {t("int_connect")} <ArrowRight size={11} aria-hidden="true" />
                  </span>
                )}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
            <div style={{ flex: 1, height: 1, background: T.bdr }} />
            <span style={{ fontFamily: SANS, fontSize: 12, color: T.t3 }}>{t("ob_or")}</span>
            <div style={{ flex: 1, height: 1, background: T.bdr }} />
          </div>

          {phase === "connect" && (
            <button onClick={onUploadClick}
              style={{ width: "100%", padding: "36px 20px", borderRadius: 14, border: `1.5px dashed ${T.accentBdr}`, background: T.accentTint, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, transition: "background .18s" }}
              onMouseEnter={e => e.currentTarget.style.background = T.accentTint.replace("0.10", "0.16").replace("0.08", "0.13")}
              onMouseLeave={e => e.currentTarget.style.background = T.accentTint}>
              <span style={{ width: 46, height: 46, borderRadius: "50%", background: T.accent, color: T.accentInk, display: "grid", placeItems: "center" }}>
                <Upload size={20} strokeWidth={2} aria-hidden="true" />
              </span>
              <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 17, color: T.t1, letterSpacing: "-0.015em" }}>{t("ob_upload_title")}</span>
              <span style={{ fontFamily: SANS, fontSize: 13, color: T.t2 }}>{t("ob_upload_sub")}</span>
            </button>
          )}

          {phase === "reading" && (
            <div className="card" style={{ padding: "22px 24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span className="scanline" aria-hidden="true" style={{ width: 36, height: 46, borderRadius: 6, background: T.surf3, border: `1px solid ${T.bdr2}`, flexShrink: 0, display: "block" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 15, color: T.t1 }}>{t("ob_reading_title")}</div>
                  <div style={{ fontFamily: SANS, fontSize: 12.5, color: T.t3, marginTop: 3 }}>
                    {t("ob_reading_sub")}
                    {uploadProgress?.total > 1 && <span className="num"> · {uploadProgress.done}/{uploadProgress.total}</span>}
                  </div>
                </div>
              </div>
              {uploadProgress?.total > 0 && (
                <div style={{ marginTop: 16, height: 3, borderRadius: 2, background: T.surf3, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 2, background: T.accent, width: `${Math.round((uploadProgress.done / uploadProgress.total) * 100)}%`, transition: "width 0.4s ease" }} />
                </div>
              )}
            </div>
          )}
        </>
      )}

      {phase === "done" && firstInvoice && (
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: T.greenTint, border: `1px solid ${T.greenBdr}`, display: "grid", placeItems: "center", margin: "0 auto 18px" }}>
            <Check size={26} color={T.green} strokeWidth={2} aria-hidden="true" />
          </div>
          <h1 style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: isMobile ? 22 : 28, letterSpacing: "-0.02em", color: T.t1, marginBottom: 8 }}>
            {t("ob_done_title")}
          </h1>
          <p style={{ fontFamily: SANS, fontSize: 14, color: T.t2, marginBottom: 26 }}>{t("ob_done_sub")}</p>

          <div className="card" style={{ padding: "20px 24px", maxWidth: 520, margin: "0 auto 26px", textAlign: "start" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: isMobile ? 16 : 26 }}>
              {[
                { label: t("inv_col_supplier"), value: firstInvoice.supplier || "—", delay: 0 },
                { label: t("inv_col_amount"), value: fmt(Math.abs(Number(firstInvoice.amount) || 0)), mono: true, delay: 0.12 },
                { label: t("inv_col_invoice"), value: firstInvoice.invoiceNo || firstInvoice.invoice_no || "—", mono: true, delay: 0.24 },
                { label: t("inv_col_due"), value: fmtDate(firstInvoice.dueDate || firstInvoice.due_date), mono: true, delay: 0.36 },
              ].map(f => (
                <div key={f.label} className="ob-field" style={{ animationDelay: `${f.delay}s`, minWidth: 90 }}>
                  <div style={{ fontFamily: SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: T.t3, marginBottom: 3 }}>{f.label}</div>
                  <div style={{ fontFamily: f.mono ? MONO : SANS, fontSize: 14, fontWeight: 600, color: T.t1, fontVariantNumeric: "tabular-nums" }}>{f.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button className="btn btn-ghost" onClick={onUploadClick}>{t("ob_upload_more")}</button>
            <button className="btn btn-accent" onClick={onContinue}>
              {t("ob_continue")} <ArrowRight size={12} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
