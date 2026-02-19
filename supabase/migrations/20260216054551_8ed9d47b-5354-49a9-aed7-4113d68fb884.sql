-- Fix sponsor_clicks: require authentication
DROP POLICY IF EXISTS "Anyone can insert clicks" ON public.sponsor_clicks;
CREATE POLICY "Authenticated users can insert clicks"
ON public.sponsor_clicks
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Restrict storage uploads to specific folders only
DROP POLICY IF EXISTS "Users can upload own files" ON storage.objects;
CREATE POLICY "Users can upload to allowed folders"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'uploads' AND
  auth.uid() IS NOT NULL AND
  (storage.foldername(name))[1] IN ('avatars', 'documents', 'branding', 'products', 'general')
);

-- Update avatars policy to also restrict path
DROP POLICY IF EXISTS "Anyone can upload avatars" ON storage.objects;
CREATE POLICY "Anyone can upload avatars during signup"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'uploads' AND
  (storage.foldername(name))[1] = 'avatars'
);