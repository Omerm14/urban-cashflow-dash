# Invoice Auto-Sync Integration — Implementation Context

## Overview

This document captures everything implemented in the Invoice Auto-Sync feature (PR #29). It covers architecture, files changed, DB migrations, environment variables, and known issues.

---

## What Was Built

Automatic invoice ingestion from 4 sources:
- **Google Drive** — scans a selected folder for new PDFs/images
- **Gmail** — scans selected labels for invoice attachments
- **Green Invoice** — imports from חשבונית ירוקה account via API key
- **WhatsApp Business** — receives invoice images/PDFs via webhook from vendors

Cross-cutting features:
- Full audit trail (`sync_events` table) logging every file outcome
- Auto-sync scheduling with per-integration frequency control (1h / 4h / daily)
- Folder/label picker UI after OAuth connect
- Sync source column in invoices table + audit section in invoice edit modal
- NavBar error badge when any integration is in error state

---

## PR & Branch

- **Branch:** `claude/zealous-ritchie-Rtb4S`
- **PR:** https://github.com/Omerm14/urban-cashflow-dash/pull/29
- **Base:** `main`

---

## Files Changed

| File | Type | Description |
|------|------|-------------|
| `supabase/migrations/002_audit_trail.sql` | NEW | sync_events table + new columns on invoices & integrations |
| `server/services/syncProcessor.js` | MODIFIED | Audit logging, WhatsApp media processing, sync source metadata |
| `server/routes/integrations.js` | MODIFIED | Folder/label list, events, resync, WhatsApp connect, auto-sync endpoints |
| `server/routes/webhook.js` | NEW | WhatsApp webhook handler with HMAC verification |
| `server/routes/cron.js` | NEW | Auto-sync cron endpoint (requires CRON_SECRET) |
| `api/index.js` | MODIFIED | Register new routes, raw body middleware for WhatsApp |
| `server/index.js` | MODIFIED | Same as api/index.js for local dev |
| `vercel.json` | MODIFIED | Removed cron config (requires Vercel paid plan) |
| `src/components/IntegrationsPage.jsx` | NEW | Full integrations UI |
| `src/App.jsx` | MODIFIED | Integrations view, OAuth redirect handling |
| `src/components/NavBar.jsx` | MODIFIED | Integrations nav item + error badge |
| `src/components/InvoicesTable.jsx` | MODIFIED | Sync source column |
| `src/components/EditInvoiceModal.jsx` | MODIFIED | Sync audit trail section |

---

## Database Migration — MUST RUN

**This is required before the full feature works.** Run in **Supabase Dashboard → SQL Editor**:

```sql
-- File: supabase/migrations/002_audit_trail.sql

create table if not exists sync_events (
  id              uuid primary key default gen_random_uuid(),
  integration_id  uuid references integrations(id) on delete cascade not null,
  user_id         uuid references auth.users(id) on delete cascade not null,
  event_type      text not null,  -- 'saved' | 'dedup_skipped' | 'ocr_failed' | 'download_failed'
  source_file     text,
  file_hash       text,
  invoice_id      uuid,
  error_message   text,
  created_at      timestamptz default now()
);

alter table sync_events enable row level security;

create policy "Users see own sync events"
  on sync_events for select
  using (auth.uid() = user_id);

alter table invoices
  add column if not exists sync_source      text,
  add column if not exists sync_source_meta jsonb,
  add column if not exists sync_timestamp   timestamptz;

alter table integrations
  add column if not exists auto_sync_enabled  boolean default false,
  add column if not exists sync_frequency_min integer default 60,
  add column if not exists error_count        integer default 0,
  add column if not exists last_error_at      timestamptz;
```

**Without this migration:** The Integrations page loads (fixed via `select('*')`) but auto-sync toggle, error tracking, and audit trail won't work.

---

## Environment Variables

Add these to `.env.local` and to **Vercel → Project → Settings → Environment Variables**:

| Variable | Description | Required for |
|----------|-------------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL | All |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key | All |
| `ANTHROPIC_API_KEY` | Claude API key for OCR | All uploads |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | Drive + Gmail |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | Drive + Gmail |
| `GOOGLE_REDIRECT_URI` | OAuth callback URL (e.g. `https://yourdomain.com/api/integrations/google/callback`) | Drive + Gmail |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) | All API routes |
| `WHATSAPP_VERIFY_TOKEN` | Token for WhatsApp webhook verification challenge | WhatsApp |
| `CRON_SECRET` | Bearer token to secure `/api/cron/sync` endpoint | Auto-sync cron |
| `VITE_ADMIN_EMAIL` | Email address that gets Admin nav tab | Admin panel |

---

## API Endpoints Added

### Integrations
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/integrations` | List all integrations for user |
| `DELETE` | `/api/integrations/:id` | Disconnect an integration |
| `POST` | `/api/integrations/:id/sync` | Trigger manual sync |
| `POST` | `/api/integrations/:id/resync` | Full historical resync |
| `GET` | `/api/integrations/:id/events` | Last 50 sync events |
| `PATCH` | `/api/integrations/:id/auto-sync` | Update auto-sync settings |
| `GET` | `/api/integrations/google/auth-url` | Get Google OAuth URL |
| `GET` | `/api/integrations/google/callback` | OAuth callback handler |
| `GET` | `/api/integrations/google/folders` | List user's Drive folders |
| `GET` | `/api/integrations/google/labels` | List user's Gmail labels |
| `POST` | `/api/integrations/green-invoice` | Connect Green Invoice |
| `POST` | `/api/integrations/whatsapp` | Connect WhatsApp Business |

### Webhooks & Cron
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/webhook/whatsapp` | Meta webhook challenge verification |
| `POST` | `/api/webhook/whatsapp` | Receive WhatsApp messages (no auth, HMAC verified) |
| `GET` | `/api/cron/sync` | Trigger auto-sync for due integrations (requires `CRON_SECRET`) |

---

## Auto-Sync Scheduling

Vercel crons require a paid plan, so the cron entry was **removed from `vercel.json`**.

To still get auto-sync, use a free external cron service:

1. Sign up at [cron-job.org](https://cron-job.org) (free)
2. Create a job: `GET https://your-app.vercel.app/api/cron/sync`
3. Add header: `Authorization: Bearer <your CRON_SECRET value>`
4. Schedule: every hour (`0 * * * *`)

---

## WhatsApp Setup

1. Go to [Meta Developer Portal](https://developers.facebook.com) → create an app → add WhatsApp product
2. In the Integrations page, click **Connect** under WhatsApp Business
3. Enter:
   - **API Token** — from Meta developer portal (permanent token or temp token)
   - **Phone Number ID** — from WhatsApp → API Setup
   - **Webhook Secret** — a random string you choose
4. Copy the **Webhook URL** shown (e.g. `https://your-app.vercel.app/api/webhook/whatsapp`)
5. In Meta portal → WhatsApp → Configuration → Webhooks, paste the URL and your `WHATSAPP_VERIFY_TOKEN`
6. Subscribe to the `messages` webhook field

---

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project → Enable **Google Drive API** and **Gmail API**
3. Create OAuth 2.0 credentials (Web Application)
4. Add authorized redirect URI: `https://your-app.vercel.app/api/integrations/google/callback`
5. Copy Client ID and Client Secret → add to environment variables

---

## Known Issues / Pending

1. **NavBar error badge** — currently hardcoded to `false` in `App.jsx:197`. To make it live, integrations state needs to be lifted to App level and passed down. Not yet implemented.

2. **DB migration not run** — until `002_audit_trail.sql` is executed in Supabase, the auto-sync toggle, error_count tracking, and sync event timeline will silently fail.

3. **Vercel cron removed** — auto-sync requires external cron service (see above).

---

## Architecture Notes

- **Auth:** All API routes use Supabase JWT bearer token (`Authorization: Bearer <token>`). The WhatsApp webhook is the only unauthenticated endpoint — it uses HMAC-SHA256 signature verification instead.
- **Deduplication:** File MD5 hash stored in `sync_events.file_hash`. Before processing any file, the hash is checked against existing events to prevent duplicate invoices on re-sync.
- **OCR pipeline:** Files downloaded as buffers → passed to `server/services/syncProcessor.js:extractFromBuffer()` → calls Anthropic Claude API → structured invoice data returned.
- **Supplier matching:** Extracted supplier name matched against existing suppliers. Latin-only names are translated to Hebrew via Claude API before matching.
- **Incremental sync:** Each sync pass only fetches files newer than `integrations.last_sync` timestamp. Full resync clears `last_sync` first.
