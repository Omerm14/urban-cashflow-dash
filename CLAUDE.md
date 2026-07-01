# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Urban Cashflow Dash ("Cashflow") is a B2B invoice management SaaS for Israeli small businesses. It auto-ingests invoices from Gmail, Google Drive, WhatsApp Business, and Green Invoice (חשבונית ירוקה), uses Claude AI for OCR/extraction, and displays results in a React dashboard with Hebrew/English RTL support.

## Commands

```bash
npm run dev      # Start both Vite (port 5173) + Express backend (port 3001) concurrently
npm run build    # Vite build — produces dual HTML entry points (index.html + app.html)
npm run preview  # Preview production build
```

No test runner or linter is configured.

## Architecture

### Dual Server Entrypoints
- `server/index.js` — local dev Express server
- `api/index.js` — Vercel serverless entrypoint (same Express routes, exported as handler)
- Vite proxies `/api/*` to `http://localhost:3001` in dev

### Frontend (`src/`)
- `src/App.jsx` — ~2400-line monolithic component; owns most app state, theme (dark/light), language (HE/EN), and mobile/tablet layout detection
- `src/hooks/useInvoiceData.js` — primary data-fetching hook (invoices + suppliers from Supabase)
- `src/contexts/AuthContext.jsx` — Supabase auth via React context
- `src/i18n/en.js` + `src/i18n/he.js` — all UI strings; always add keys to both files
- `src/constants.js` — `PALETTE` and shared constants; `src/constants/plans.js` — plan tier definitions

### Backend (`server/`)
- `server/middleware/auth.js` — Supabase JWT validation applied to all routes except the WhatsApp webhook
- `server/routes/extract.js` → `server/lib/extraction.js` — Claude OCR pipeline; invoices passed as image/PDF buffers; supplier names in Latin script are translated to Hebrew before DB matching
- `server/services/syncProcessor.js` — core sync loop: download → OCR → dedup → save
- `server/lib/plans.js` — enforces per-plan invoice limits (mirrors `src/constants/plans.js`)

### Key Patterns
- **Invoice deduplication:** MD5 file hash stored in `sync_events.file_hash`; checked before processing any synced file
- **WhatsApp webhook auth:** HMAC-SHA256 signature verification (no JWT); all other endpoints require Supabase Bearer token
- **Billing:** Stripe subscriptions tracked in `subscriptions` table; plan limits enforced server-side in `server/lib/plans.js`
- **Database migrations:** `supabase/migrations/` — numbered sequentially (001–010); run via Supabase CLI or dashboard

### External Services
| Service | Purpose |
|---|---|
| Supabase | PostgreSQL DB, auth, RLS, file metadata |
| AWS S3 | Invoice file storage (presigned URLs) |
| Anthropic Claude | OCR and invoice data extraction |
| Google Drive / Gmail | Invoice source integrations |
| WhatsApp Business (Meta) | Invoice source via webhooks |
| Green Invoice (חשבונית ירוקה) | Israeli invoice platform integration |
| Stripe | Subscription billing |

### Deployment
Vercel with dual HTML entries: `index.html` (marketing landing page) and `app.html` (React SPA). See `vercel.json` and `vite.config.js` for build configuration.
