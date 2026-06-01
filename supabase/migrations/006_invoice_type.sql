-- Support credit notes (זיכוי): track whether a document is an invoice or credit note.
-- Credits are stored with negative amounts so KPI calculations (outstanding balance)
-- automatically subtract them without any formula changes.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_type text NOT NULL DEFAULT 'invoice';
