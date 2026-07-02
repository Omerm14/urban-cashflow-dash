import { useState, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";

// Manual upload pipeline (extracted from App.jsx):
// PDF/image → Claude extraction → dedup → R2/Supabase storage → addInvoice.
export function useUpload({ invoices, user, addInvoice, getSupplier, refreshPlan, onNotify }) {
  const [extracting, setExtracting] = useState(false);
  const [extractMsg, setExtractMsg] = useState(null);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const fileRef = useRef();

  const handleUpload = useCallback(async (e) => {
    const files = Array.from(e?.target?.files || []);
    if (!files.length) return;
    setExtracting(true);
    setUploadProgress({ done: 0, total: files.length });
    setExtractMsg({ text: `Processing ${files.length} file${files.length > 1 ? "s" : ""}…`, ok: null });
    try {
      const { processPdf, fileToBase64, extractInvoice, translateSupplierName } = await import("../utils/image");
      const { findDuplicates, isLatinOnly } = await import("../utils/invoice");
      const { calcDueDate, correctSwappedDate } = await import("../utils/dates");
      const { STATUS } = await import("../constants");
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
            const ext = (file.name.split(".").pop() || "bin").toLowerCase();
            const presignRes = await fetch("/api/attachments/presign", {
              method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
              body: JSON.stringify({ filename: file.name, contentType: file.type }),
            });
            if (presignRes.ok) {
              const presign = await presignRes.json();
              if (presign.backend === "r2" && presign.uploadUrl) {
                await fetch(presign.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
                attachment = { attachment_path: presign.key, attachment_backend: "r2", attachment_status: "present" };
              } else {
                const key = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
                await supabase.storage.from("invoice-attachments").upload(key, file, { contentType: file.type, upsert: true });
                attachment = { attachment_path: key, attachment_backend: "supabase", attachment_status: "present" };
              }
            }
          } catch { attachment = { attachment_status: "missing" }; attachmentIssues++; }
          await addInvoice({ ...candidate, ...attachment });
          added++;
        } catch (err) { errors.push(`${file.name}: ${err.message}`); }
        setUploadProgress(p => ({ ...p, done: p.done + 1 }));
      }));

      if (added > 0) { refreshPlan(); onNotify?.({ type: "upload", icon: "📄", text: `${added} invoice${added !== 1 ? "s" : ""} uploaded from ${files.length === 1 ? files[0].name : `${files.length} files`}`, ts: Date.now() }); }
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
  }, [invoices, user, addInvoice, getSupplier, refreshPlan, onNotify]);

  const showTransientError = useCallback((text) => {
    setExtractMsg({ text, ok: false });
    setTimeout(() => setExtractMsg(null), 4000);
  }, []);

  return { extracting, extractMsg, uploadProgress, fileRef, handleUpload, showTransientError };
}
