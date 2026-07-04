# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Urban Cashflow Dash ("Cashflow") is a B2B invoice management SaaS for Israeli small businesses. It
auto-ingests invoices from Gmail, Google Drive, WhatsApp Business, and Green Invoice (חשבונית ירוקה),
uses Claude AI for OCR/extraction, and displays results in a React dashboard with Hebrew/English RTL
support. Live product with real users — every change follows the workflow and safety rules below.

## Commands

```bash
npm run dev      # Vite (5173) + Express backend (3001) concurrently
npm run build    # Vite build — dual HTML entry points (index.html + app.html)
npm run preview  # Preview production build
npm test         # Vitest (tests/ — plans, dedup, OAuth token merge, trust proxy, i18n parity, theme sync)
```

No linter is configured. For any new logic, add a minimal vitest test alongside it in `tests/`.

## Architecture

### Dual Server Entrypoints
- `server/index.js` — local dev Express server
- `api/index.js` — Vercel serverless entrypoint (same routes, exported as handler)
- Vite proxies `/api/*` to `http://localhost:3001` in dev
- These differ in cold-start behavior; changes to server bootstrap must work in both.

### Frontend (`src/`) — "Night Ledger" design system
- `src/theme.js` — design tokens (NIGHT/DAY themes, fonts, CVD-validated chart palettes). Mirrored as
  CSS custom properties in `src/index.css`; `tests/theme.test.js` enforces the two stay in sync.
- `src/App.jsx` — thin root: state wiring, providers, view switch (no React Router — `view` state string)
- `src/views/` — Login, Dashboard, Invoices, Suppliers, Settings, Onboarding (first-run experience)
- `src/components/layout/` — Sidebar, GlobalHeader; `src/components/` — shared pieces (StatusPill, TermsPicker, SearchOverlay, modals)
- `src/contexts/AppContexts.jsx` — Theme/Layout/Lang contexts (+ `src/contexts/AuthContext.jsx` for Supabase auth)
- `src/hooks/useInvoiceData.js` — primary data hook; `src/hooks/useUpload.js` — manual upload → OCR pipeline
- `src/i18n/en.js` + `src/i18n/he.js` — all UI strings; ALWAYS add keys to both (`tests/i18n.test.js` enforces parity), verify RTL for Hebrew
- Styling: CSS custom properties + classes with **logical properties** (RTL mirrors automatically);
  theme/direction switched via `data-theme` / `dir` on `<html>`. Chart colors come from
  `chartPalette(isDark)` — 8 fixed slots, order is the colorblind-safety mechanism, never reorder.
- `src/constants.js` — `STATUS`; `src/constants/plans.js` — plan tiers

### Backend (`server/`)
- `server/middleware/auth.js` — Supabase JWT validation on all routes except the WhatsApp webhook
- `server/routes/extract.js` → `server/lib/extraction.js` — Claude OCR pipeline; buffers as image/PDF;
  Latin-script supplier names translated to Hebrew before DB matching
- `server/services/syncProcessor.js` — core sync loop: download → OCR → dedup → save.
  `processFile()` is the shared pipeline for Drive/Gmail/WhatsApp; **Green Invoice bypasses it**
  (no file stored) — that path needs its own attachment-state handling.
- `server/lib/plans.js` — per-plan invoice limits (mirrors `src/constants/plans.js`)

### Data access & multi-tenancy  ⚠️ CRITICAL
- Frontend reads invoices/suppliers directly from Supabase via the anon key; **RLS enforces isolation**.
- Server uses the **service-role key, which BYPASSES RLS**. Therefore **every server-side query MUST
  explicitly scope by `user_id`** (`.eq('user_id', req.user.id)`). Omitting this on any new query is a
  cross-tenant data leak. This is the top invariant — never violate it.

### Key Patterns
- **Dedup — two paths, both must be preserved:**
  1. File-level: MD5 hash in `sync_events.file_hash`, checked before processing a synced file.
  2. Content-level: `getExistingInvoices()` + `isDuplicate()`; when `invoice_no` is absent, falls back
     to `{supplier, amount, date}`. (This path is the target of the dedup scale/false-positive work.)
- **Auth:** WhatsApp webhook uses **HMAC-SHA256 signature verification** (no JWT); all other endpoints
  require a Supabase Bearer token. ← Reuse this existing HMAC pattern when adding IPN signature checks.
- **Billing — TWO systems in parallel, both write the `subscriptions` table:**
  - **Stripe** (global) and **Meshulam** (Israeli market). Plan limits enforced server-side in
    `server/lib/plans.js`. Any billing change must account for both, and for the case where both
    fire for one user. Payment code is the highest-scrutiny area in this repo.
- **Migrations:** `supabase/migrations/`, numbered sequentially (001–012), run via Supabase CLI/dashboard.

### External Services
| Service | Purpose |
|---|---|
| Supabase | PostgreSQL DB, auth, RLS, file metadata |
| Object storage | Invoice files via `server/lib/storage.js` — Supabase Storage (default) ⇄ Cloudflare R2 (S3-compatible, via AWS SDK), selected per-row by `STORAGE_BACKEND` env; presigned URLs |
| Anthropic Claude | OCR + invoice extraction |
| Google Drive / Gmail | Invoice source integrations |
| WhatsApp Business (Meta) | Invoice source via webhooks |
| Green Invoice (חשבונית ירוקה) | Israeli invoice platform integration |
| Stripe | Subscription billing (global) |
| Meshulam | Subscription billing (Israel) |

### Deployment
Vercel, dual HTML entries: `index.html` (marketing) + `app.html` (React SPA). See `vercel.json` and
`vite.config.js`. 60s serverless function limit — long syncs are chunked via `sync_jobs` and resumed.

---

## How to work a ticket
When given a `CASH-` issue:
1. Read the ticket, then read the relevant code before writing anything.
2. If ambiguous, ask ONE clarifying question, then proceed.
3. Branch: `[type]/CASH-XX-short-desc` (e.g. `fix/CASH-2-oauth-refresh`).
4. Small, reviewable commits. Add a test for new logic.
5. **Never merge to main. Never push to main.** End at: PR opened + ticket moved to In Review.
6. PR description = what changed, how to test in <1 min, any tradeoffs, and whether it touches
   billing / auth / migrations (flag these explicitly for review).

## Hard rules (do not violate)
- Every server query scopes by `user_id` (service role bypasses RLS — see above).
- Migrations are reversible files only. Never destructive (`DROP`, data-losing column changes)
  without an explicit, reviewed, staging-tested plan. Test all schema changes on staging first.
- Reuse existing models and pipelines. Do not create parallel tables or a second source-of-truth.
- Never overwrite a user's real data as a side effect (see the OAuth refresh_token bug pattern).
- Payments (Stripe + Meshulam) and auth changes: propose, never assume; expect line-by-line review.

## Definition of done
- Builds clean; `npm run build` succeeds.
- New logic has a test; existing behavior not regressed.
- Both Hebrew (RTL) and English render correctly if UI changed.
- No secrets/debug logging left in; no unscoped server queries introduced.
- PR description tells the reviewer how to verify in under a minute.
