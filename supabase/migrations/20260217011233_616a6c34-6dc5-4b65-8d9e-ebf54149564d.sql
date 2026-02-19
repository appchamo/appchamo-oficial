
-- Allow authenticated users to upload resumes
CREATE POLICY "Users can upload resumes"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'uploads' 
  AND (storage.foldername(name))[1] = 'resumes'
  AND auth.uid() IS NOT NULL
);

-- Allow anyone to read resumes (public bucket)
CREATE POLICY "Anyone can read resumes"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'uploads' 
  AND (storage.foldername(name))[1] = 'resumes'
);
