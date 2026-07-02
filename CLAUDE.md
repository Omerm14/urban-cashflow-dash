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
```

No test runner or linter is currently configured. For any new logic, add a minimal test alongside
it (propose the test setup if none exists) rather than assuming a test gate.

## Architecture

### Dual Server Entrypoints
- `server/index.js` — local dev Express server
- `api/index.js` — Vercel serverless entrypoint (same routes, exported as handler)
- Vite proxies `/api/*` to `http://localhost:3001` in dev
- These differ in cold-start behavior; changes to server bootstrap must work in both.

### Frontend (`src/`)
- `src/App.jsx` — ~2400-line monolith; owns most app state, theme, language (HE/EN), layout detection
- `src/hooks/useInvoiceData.js` — primary data-fetching hook (invoices + suppliers from Supabase)
- `src/contexts/AuthContext.jsx` — Supabase auth via React context
- `src/i18n/en.js` + `src/i18n/he.js` — all UI strings; ALWAYS add keys to both, verify RTL for Hebrew
- `src/constants.js` — `PALETTE`; `src/constants/plans.js` — plan tiers

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
- **Migrations:** `supabase/migrations/`, numbered sequentially (001–010), run via Supabase CLI/dashboard.

### External Services
| Service | Purpose |
|---|---|
| Supabase | PostgreSQL DB, auth, RLS, file metadata |
| ⚠️ Object storage | Invoice files (presigned URLs). **VERIFY: audit read this as Supabase Storage / R2; /init read it as AWS S3. Confirm which is real and correct this line before any storage ticket.** |
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
