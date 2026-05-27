-- Add attachment storage column to invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS attachment_path text;

-- Create private storage bucket for invoice attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'invoice-attachments',
  'invoice-attachments',
  false,
  52428800,  -- 50 MB limit
  ARRAY['image/jpeg','image/png','image/webp','image/gif','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- RLS: authenticated users can upload to their own folder
CREATE POLICY "Users upload own invoice attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'invoice-attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS: authenticated users can read from their own folder
CREATE POLICY "Users read own invoice attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'invoice-attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS: authenticated users can delete from their own folder
CREATE POLICY "Users delete own invoice attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'invoice-attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
