
-- Drop existing insert policy and recreate with audio folder
DROP POLICY IF EXISTS "Users can upload to allowed folders" ON storage.objects;

CREATE POLICY "Users can upload to allowed folders"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'uploads'
  AND (storage.foldername(name))[1] = ANY (ARRAY['avatars', 'documents', 'branding', 'products', 'general', 'audio'])
);
