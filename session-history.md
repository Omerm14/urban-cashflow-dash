# Session History — Urban Cashflow Dash
**Date:** 2026-05-11  
**Branch:** `claude/fix-ocr-supplier-detection-gXBj2`  
**PR:** [#9 — fix: OCR supplier detection, PDF quality, date logic & text-layer extraction](https://github.com/Omerm14/urban-cashflow-dash/pull/9)

---

## Issue Reported

> "Something is wrong with the invoice details. I assume the OCR process is not working correctly. For example: I uploaded 4 different invoices from 4 different suppliers and the app showed all invoices under the same supplier."

---

## Investigation

Explored the full codebase. The app is a React + Node.js/Express + Supabase invoice management system with Claude-powered OCR extraction.

**Relevant files identified:**
| File | Role |
|---|---|
| `server/routes/extract.js` | Backend OCR endpoint — calls Claude API |
| `src/utils/image.js` | Frontend — PDF/image encoding, API call |
| `src/utils/invoice.js` | Supplier fuzzy matching, duplicate detection |
| `src/utils/dates.js` | Payment term / due date calculations |
| `src/App.jsx` | Upload orchestration |

---

## Bug #1 — OCR Prompt Missing Instructions (Root Cause)

**File:** `server/routes/extract.js`

**Problem:**  
When supplier names were provided, the user message sent to Claude was only:
```
Known suppliers: Supplier A, Supplier B, Supplier C
```
There was no instruction to extract anything from the invoice image. Claude had no task context and was returning the same supplier (likely the first in the list) for every single upload.

**Fix applied:**
```js
// Before
text: supplierNames ? `Known suppliers: ${supplierNames}` : 'Extract the invoice fields.'

// After
const userText = supplierNames
  ? `Extract the invoice fields from this image. For "supplier", read the vendor/supplier name from the invoice. If it matches one of these known suppliers, return that exact name: ${supplierNames}. Otherwise return the name as shown on the invoice.`
  : 'Extract the invoice fields from this image.';
```

**Commit:** `acc51d1`

---

## Gap Analysis — Old Version vs. Production

The user shared a previous single-file version (`cashflow_manager.tsx`) that was working correctly. A comparison was made:

| Area | Old (working) | Current (broken) | Impact |
|---|---|---|---|
| OCR prompt | Full extraction instruction with supplier list | Just `"Known suppliers: ..."` | All invoices get same supplier ✗ |
| PDF render scale | `scale: 2`, quality `0.92` | `scale: 1`, quality `0.75` | Blurry images, misread text ✗ |
| Model | `claude-sonnet-4-20250514` | `claude-haiku-4-5-20251001` | Lower accuracy (kept as-is) |
| `shotef` due date | End of **same** month | End of **following** month | Invoices appear one month late ✗ |
| `shotef_plus(N)` | End of same month + N days | 1st of following month + N days | Wrong due dates ✗ |

---

## Bug #2 — PDF Rendered at Half Resolution

**File:** `src/utils/image.js`

**Problem:**  
`scale: 1` and JPEG quality `0.75` produced small, compressed images. Small invoice text (numbers, dates, supplier names) was blurry and unreadable by the model.

**Fix applied:**
```js
// Before
const vp = page.getViewport({ scale: 1 });
return { b64: canvas.toDataURL("image/jpeg", 0.75).split(",")[1], mediaType: "image/jpeg" };

// After
const vp = page.getViewport({ scale: 2 });
return { b64: canvas.toDataURL("image/jpeg", 0.92).split(",")[1], mediaType: "image/jpeg" };
```

---

## Bug #3 — Wrong `shotef` / `shotef_plus(N)` Date Logic

**File:** `src/utils/dates.js`

**Problem:**  
Payment due dates were being calculated one month (or more) later than the original working version. All invoices appeared in the wrong month on the dashboard and calendar.

**Fix applied — reverted to original logic:**
```js
// Before
if (t === "shotef") return endOfFollowingMonth(invoiceDate);
if (m) return addDays(firstOfFollowingMonth(invoiceDate), parseInt(m[1]));

// After
if (t === "shotef") return endOfMonth(invoiceDate);        // end of same month
if (m) return addDays(endOfMonth(invoiceDate), parseInt(m[1]));  // end of same month + N days
```

**Commit:** `b9ab464`

---

## Enhancement — PDF Text-Layer Extraction

**Goal:** Reduce token consumption for PDF invoice uploads.

**Problem with vision tokens:**  
A PDF rendered at `scale: 2` produces an image of ~1,190×1,684px — approximately 1,500–2,500 Claude vision tokens per invoice. At volume this becomes costly.

**Solution:**  
PDF.js already exposes `getTextContent()`, which returns the embedded text layer without rendering anything. For digitally-generated PDFs (from accounting software, e-commerce platforms, etc.) this text is complete and accurate.

**Token comparison:**

| Invoice type | Before | After | Saving |
|---|---|---|---|
| Digital PDF | ~1,500–2,500 vision tokens | ~300–500 text tokens | **~5–8× cheaper** |
| Scanned PDF | ~1,500–2,500 vision tokens | ~1,500–2,500 vision tokens | No change |
| Image (JPG/PNG) | vision tokens | vision tokens | No change |

**How it works:**

```
PDF uploaded
  └─ getTextContent() → text.length > 50?
       ├─ YES → send as plain text to Claude  ← no vision tokens
       └─ NO  → canvas render (scale:2, 0.92) → send as image
```

**Files changed:**

`src/utils/image.js` — `pdfToBase64` replaced by `processPdf`:
```js
export const processPdf = async file => {
  const lib  = await loadPdfJs();
  const pdf  = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  const page = await pdf.getPage(1);

  const content = await page.getTextContent();
  const text = content.items.map(item => item.str).join(' ').replace(/\s+/g, ' ').trim();
  if (text.length > 50) return { text };  // text path — no vision

  // fallback: scanned PDF
  const vp     = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = vp.width; canvas.height = vp.height;
  await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
  return { b64: canvas.toDataURL("image/jpeg", 0.92).split(",")[1], mediaType: "image/jpeg" };
};
```

`extractInvoice` updated to accept a unified payload (`{ text }` or `{ b64, mediaType }`):
```js
export const extractInvoice = async (payload, suppliers) => {
  // ...
  body: JSON.stringify({ ...payload, supplierNames: suppliers.map(s => s.name).join(", ") }),
};
```

`server/routes/extract.js` — handles both paths:
```js
const messageContent = text
  ? [{ type: 'text', text: `Extract invoice fields from the following invoice text.${supplierHint} Return ONLY valid JSON.\n\n${text}` }]
  : [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
      { type: 'text',  text: `Extract the invoice fields from this image. For "supplier", read the vendor/supplier name from the invoice.${supplierHint}` },
    ];
```

`src/App.jsx` — updated import and call:
```js
// Before
import { pdfToBase64, fileToBase64, extractInvoice } from "./utils/image";
toExtract.map(f => f.type === "application/pdf" ? pdfToBase64(f) : fileToBase64(f))
extractInvoice(r.value.b64, r.value.mediaType, suppliers)

// After
import { processPdf, fileToBase64, extractInvoice } from "./utils/image";
toExtract.map(f => f.type === "application/pdf" ? processPdf(f) : fileToBase64(f))
extractInvoice(r.value, suppliers)
```

**Commit:** `227315d`

---

## All Commits on This Branch

| Hash | Description |
|---|---|
| `acc51d1` | fix: repair OCR supplier detection by providing explicit extraction instructions |
| `b9ab464` | fix: restore PDF render quality and revert shotef date logic to original |
| `227315d` | feat: extract PDF text layer to reduce vision token consumption by ~5–8× |

---

## Summary of All Changes

| # | File | Change | Type |
|---|---|---|---|
| 1 | `server/routes/extract.js` | Prompt now instructs Claude to read invoice, match to known suppliers | Bug fix |
| 2 | `server/routes/extract.js` | Accepts `{ text }` payload and builds text-only Claude message | Enhancement |
| 3 | `src/utils/image.js` | PDF render: `scale 1→2`, quality `0.75→0.92` | Bug fix |
| 4 | `src/utils/image.js` | `pdfToBase64` replaced by `processPdf` (text-first, image fallback) | Enhancement |
| 5 | `src/utils/image.js` | `extractInvoice` accepts unified `payload` object | Enhancement |
| 6 | `src/utils/dates.js` | `shotef`: end of following month → end of same month | Bug fix |
| 7 | `src/utils/dates.js` | `shotef_plus(N)`: 1st following month + N → end of same month + N | Bug fix |
| 8 | `src/App.jsx` | Use `processPdf`, pass `r.value` directly to `extractInvoice` | Enhancement |
