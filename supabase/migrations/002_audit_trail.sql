-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New query)
-- after running 001_integrations.sql

-- Sync event log (one row per file processed per sync)
create table if not exists sync_events (
  id              uuid primary key default gen_random_uuid(),
  integration_id  uuid references integrations(id) on delete cascade not null,
  user_id         uuid references auth.users(id) on delete cascade not null,
  event_type      text not null,  -- 'saved' | 'dedup_skipped' | 'ocr_failed' | 'download_failed'
  source_file     text,
  file_hash       text,
  invoice_id      uuid,           -- set when event_type = 'saved'
  error_message   text,
  created_at      timestamptz default now()
);

alter table sync_events enable row level security;

create policy "Users see own sync events"
  on sync_events for select
  using (auth.uid() = user_id);

-- Add sync source metadata to invoices table
alter table invoices
  add column if not exists sync_source      text,       -- 'google_drive' | 'gmail' | 'whatsapp' | 'manual'
  add column if not exists sync_source_meta jsonb,      -- { folder_id, message_id, wa_message_id, filename }
  add column if not exists sync_timestamp   timestamptz;

-- Add auto-sync and error-tracking fields to integrations table
alter table integrations
  add column if not exists auto_sync_enabled  boolean default false,
  add column if not exists sync_frequency_min integer default 60,
  add column if not exists error_count        integer default 0,
  add column if not exists last_error_at      timestamptz;
