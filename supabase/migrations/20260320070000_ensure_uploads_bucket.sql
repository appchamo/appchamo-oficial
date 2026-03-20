-- Ensure the 'uploads' storage bucket exists and is properly configured
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'uploads',
  'uploads',
  false,
  10485760,  -- 10 MB limit per file
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
