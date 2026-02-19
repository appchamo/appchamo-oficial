-- Add 'support' to the allowed upload folders for storage
DROP POLICY IF EXISTS "Users can upload to allowed folders" ON storage.objects;
CREATE POLICY "Users can upload to allowed folders" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'uploads' AND
  (storage.foldername(name))[1] = ANY (ARRAY['avatars', 'documents', 'branding', 'products', 'general', 'audio', 'support'])
);