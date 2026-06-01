-- Belt-and-suspenders dedup guard: prevent inserting two invoices with the same
-- invoice_no, date, and amount for the same user (only when invoice_no is set).
-- The in-memory isDuplicate check catches most cases; this index is the last resort.
CREATE UNIQUE INDEX IF NOT EXISTS invoices_dedup_key
  ON invoices (user_id, invoice_no, invoice_date, amount)
  WHERE invoice_no IS NOT NULL AND invoice_no != '';
