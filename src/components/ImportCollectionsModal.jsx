import { useState, useEffect, useMemo, useRef } from "react";
import { useT, useLang, useLayout } from "../contexts/AppContexts";
import { FONT_UI as SANS, FONT_DISPLAY as DISPLAY, FONT_MONO as MONO } from "../theme";
import { supabase } from "../lib/supabase";
import { fmt } from "../utils/format";
import { chunkText, buildReviewRows, validateRow, rematchRow, newCustomerNames } from "../utils/collectionsImport";
import { X, Upload, Sparkles, AlertTriangle } from "lucide-react";

const CHUNK = 6000;

// Sends one chunk to the parse endpoint (Claude). Parse only — nothing is saved server-side.
async function parseChunk(text) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch("/api/collections/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`parse ${res.status}`);
  return (await res.json()).items || [];
}

// One-time history import: paste SMS / notes → Claude extracts → user reviews → import.
export default function ImportCollectionsModal({ customers, receivables, onImport, onClose, onDone }) {
  const T = useT();
  const { t } = useLang();
  const { isMobile } = useLayout();
  const [step, setStep] = useState("paste"); // paste | reading | review | saving
  const [text, setText] = useState("");
  const [progress, setProgress] = useState({ n: 0, m: 0 });
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);
  const busy = step === "reading" || step === "saving";

  useEffect(() => {
    const onKey = e => { if (e.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  const read = async () => {
    const chunks = chunkText(text, CHUNK);
    if (!chunks.length) return setError(t("imp_err_empty"));
    setError(null);
    setStep("reading");
    const items = [];
    try {
      for (let i = 0; i < chunks.length; i++) {
        setProgress({ n: i + 1, m: chunks.length });
        items.push(...await parseChunk(chunks[i]));
      }
    } catch {
      setError(t("imp_err_read"));
      setStep("paste");
      return;
    }
    if (!items.length) { setError(t("imp_err_none")); setStep("paste"); return; }
    setRows(buildReviewRows(items, customers, receivables));
    setStep("review");
  };

  const onFile = async e => {
    const f = e.target.files?.[0];
    if (f) { const content = await f.text(); setText(prev => (prev ? prev + "\n\n" : "") + content); }
    e.target.value = "";
  };

  const update = (key, patch) => setRows(rs => rs.map(r => {
    if (r.key !== key) return r;
    const next = { ...r, ...patch };
    return "customer" in patch ? rematchRow(next, customers) : next;
  }));

  const included = rows.filter(r => r.include);
  const invalid = included.filter(r => validateRow(r));
  const newNames = useMemo(() => newCustomerNames(rows), [rows]);
  const total = included.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const doImport = async () => {
    if (!included.length || invalid.length) return;
    setStep("saving");
    setError(null);
    try {
      const res = await onImport(included);
      const latest = included.map(r => r.expected_date).sort().pop();
      onDone?.(res, latest);
      onClose();
    } catch {
      setError(t("imp_err_save"));
      setStep("review");
    }
  };

  const cell = { height: 30, padding: "0 7px", background: T.surf2, border: `1px solid ${T.bdr}`, borderRadius: 6, fontFamily: SANS, fontSize: 12, color: T.t1, minWidth: 0, width: "100%", outline: "none" };
  const headCell = { fontFamily: SANS, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: T.t3, padding: "0 4px" };
  const COLS = "28px minmax(140px,1.4fr) 100px 128px 128px minmax(120px,1fr)";

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={t("imp_title")}
        style={{ width: step === "review" ? "min(980px, 96vw)" : undefined, maxWidth: "96vw", maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 17, color: T.t1 }}>{t("imp_title")}</div>
            <div style={{ fontFamily: SANS, fontSize: 12, color: T.t3, marginTop: 2 }}>{step === "review" ? t("imp_review_sub") : t("imp_sub")}</div>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label={t("close")}
            style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 8, background: T.surf2, border: `1px solid ${T.bdr}`, color: T.t2, cursor: busy ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={16} />
          </button>
        </div>

        {(step === "paste" || step === "reading") && (
          <>
            <textarea id="imp-text" dir="auto" value={text} onChange={e => { setText(e.target.value); setError(null); }} disabled={busy}
              placeholder={t("imp_placeholder")} aria-label={t("imp_title")}
              style={{ width: "100%", minHeight: 240, resize: "vertical", padding: 12, background: T.surf2, border: `1px solid ${T.bdr2}`, borderRadius: 10, fontFamily: SANS, fontSize: 13, lineHeight: 1.6, color: T.t1, outline: "none" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
              <input ref={fileRef} type="file" accept=".txt,text/plain" style={{ display: "none" }} onChange={onFile} />
              <button type="button" className="btn btn-ghost" style={{ height: 30, padding: "0 10px", fontSize: 12 }} disabled={busy} onClick={() => fileRef.current?.click()}>
                <Upload size={12} aria-hidden="true" />{t("imp_upload_txt")}
              </button>
              <span className="num" style={{ fontSize: 11, color: T.t3 }}>{text.length.toLocaleString()} {t("imp_chars")}</span>
              <span style={{ fontFamily: SANS, fontSize: 11, color: T.t3 }}>{t("imp_privacy")}</span>
            </div>
          </>
        )}

        {step === "review" && (
          <>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", marginBottom: 10, fontFamily: SANS, fontSize: 12, color: T.t2 }}>
              <span>{t("imp_summary", { n: included.length, total: fmt(total) })}</span>
              {newNames.length > 0 && <span style={{ color: T.accent }}>{t("imp_new_customers", { n: newNames.length })}</span>}
              {rows.some(r => r.duplicate) && <span style={{ color: T.amber }}>{t("imp_dupes", { n: rows.filter(r => r.duplicate).length })}</span>}
            </div>
            <div style={{ overflow: "auto", border: `1px solid ${T.bdr}`, borderRadius: 10, flex: "1 1 auto", minHeight: 0 }}>
              <div style={{ minWidth: isMobile ? 680 : 0 }}>
                <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 6, alignItems: "center", padding: "0 10px", height: 30, background: T.surf2, position: "sticky", top: 0, zIndex: 1 }}>
                  <span />
                  <span style={headCell}>{t("coll_field_customer")}</span>
                  <span style={headCell}>{t("coll_col_amount")}</span>
                  <span style={headCell}>{t("coll_col_expected")}</span>
                  <span style={headCell}>{t("coll_col_collected_on")}</span>
                  <span style={headCell}>{t("coll_field_desc")}</span>
                </div>
                {rows.map(r => {
                  const err = r.include ? validateRow(r) : null;
                  const tint = err ? T.redTint : r.duplicate ? T.amberTint : "transparent";
                  return (
                    <div key={r.key} style={{ padding: "8px 10px", borderTop: `1px solid ${T.bdr}`, background: tint, opacity: r.include ? 1 : 0.55 }}>
                      <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 6, alignItems: "center" }}>
                        <input type="checkbox" id={`imp-inc-${r.key}`} checked={r.include} onChange={e => update(r.key, { include: e.target.checked })}
                          aria-label={t("imp_include")} style={{ accentColor: T.accent, width: 15, height: 15 }} />
                        <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                          <input id={`imp-cust-${r.key}`} value={r.customer} dir="auto" aria-label={t("coll_field_customer")} onChange={e => update(r.key, { customer: e.target.value })} style={cell} />
                          {r.isNew && <span style={{ flexShrink: 0, fontFamily: SANS, fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 999, background: T.accentTint, color: T.accent, border: `1px solid ${T.accentBdr}` }}>{t("imp_new")}</span>}
                        </div>
                        <input id={`imp-amt-${r.key}`} type="number" min="0.01" step="0.01" value={r.amount} aria-label={t("coll_col_amount")} onChange={e => update(r.key, { amount: e.target.value })} style={{ ...cell, fontFamily: MONO }} />
                        <input id={`imp-exp-${r.key}`} type="date" value={r.expected_date} aria-label={t("coll_col_expected")} onChange={e => update(r.key, { expected_date: e.target.value })} style={{ ...cell, fontFamily: MONO, fontSize: 11 }} />
                        <input id={`imp-col-${r.key}`} type="date" value={r.collected_date} aria-label={t("coll_col_collected_on")} onChange={e => update(r.key, { collected_date: e.target.value })} style={{ ...cell, fontFamily: MONO, fontSize: 11 }} />
                        <input id={`imp-desc-${r.key}`} value={r.description} dir="auto" aria-label={t("coll_field_desc")} onChange={e => update(r.key, { description: e.target.value })} style={cell} />
                      </div>
                      {(r.source || err || r.duplicate) && (
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4, paddingInlineStart: 34, fontFamily: SANS, fontSize: 11, color: T.t3 }}>
                          {r.source && <span dir="auto" style={{ fontStyle: "italic" }}>“{r.source}”</span>}
                          {err && <span style={{ color: T.red, display: "inline-flex", alignItems: "center", gap: 3 }}><AlertTriangle size={10} aria-hidden="true" />{t(err)}</span>}
                          {!err && r.duplicate && <span style={{ color: T.amber }}>{r.duplicate === "existing" ? t("imp_dup_existing") : t("imp_dup_batch")}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {error && (
          <div role="alert" style={{ marginTop: 12, padding: "8px 12px", background: T.redTint, border: `1px solid ${T.redBdr}`, borderRadius: 7, fontFamily: SANS, fontSize: 12, color: T.red }}>{error}</div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap", alignItems: "center" }}>
          {step === "reading" && (
            <span role="status" style={{ fontFamily: SANS, fontSize: 12, color: T.accent, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Sparkles size={13} aria-hidden="true" />{t("imp_reading", { n: progress.n, m: progress.m })}
            </span>
          )}
          {step === "review" && (
            <button type="button" className="btn btn-ghost" onClick={() => { setStep("paste"); setRows([]); }}>{t("imp_back")}</button>
          )}
          <div style={{ flex: 1 }} />
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>{t("cancel")}</button>
          {(step === "paste" || step === "reading") ? (
            <button type="button" className="btn btn-accent" onClick={read} disabled={busy || !text.trim()}>
              <Sparkles size={13} aria-hidden="true" />{t("imp_read")}
            </button>
          ) : (
            <button type="button" className="btn btn-accent" onClick={doImport} disabled={busy || !included.length || invalid.length > 0}>
              {step === "saving" ? t("imp_saving") : t("imp_import", { n: included.length })}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
