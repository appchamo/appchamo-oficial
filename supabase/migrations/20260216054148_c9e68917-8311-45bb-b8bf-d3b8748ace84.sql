-- Allow avatar uploads during signup (unconfirmed users)
CREATE POLICY "Anyone can upload avatars"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'uploads' AND
  (storage.foldername(name))[1] = 'avatars'
);