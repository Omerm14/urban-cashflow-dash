-- GIN index on invoices.sync_source_meta so the WhatsApp idempotency check in
-- processWhatsAppMedia() (JSONB `@>` containment on wa_message_id) uses an
-- index scan instead of a sequential scan of all of a user's invoices.
CREATE INDEX IF NOT EXISTS idx_invoices_sync_source_meta
  ON invoices USING gin (sync_source_meta);

-- Reversible: DROP INDEX IF EXISTS idx_invoices_sync_source_meta;
