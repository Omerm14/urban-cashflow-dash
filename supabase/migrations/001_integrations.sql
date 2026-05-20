-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New query)

create table if not exists integrations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade not null,
  type          text not null,  -- 'google_drive' | 'gmail' | 'green_invoice' | 'whatsapp'
  status        text not null default 'disconnected',  -- 'connected' | 'disconnected' | 'error'
  credentials   jsonb,          -- oauth tokens or api keys (stored server-side only)
  config        jsonb default '{}',  -- folder_id, label_filter, etc.
  last_sync     timestamptz,
  sync_count    integer default 0,
  error_message text,
  created_at    timestamptz default now(),
  unique (user_id, type)
);

alter table integrations enable row level security;

create policy "Users manage own integrations"
  on integrations for all
  using (auth.uid() = user_id);
