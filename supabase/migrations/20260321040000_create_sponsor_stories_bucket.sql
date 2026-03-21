-- Cria o bucket sponsor-stories (público) para imagens de novidades
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sponsor-stories',
  'sponsor-stories',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- Política: qualquer autenticado pode fazer upload
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'sponsor_stories_upload'
  ) THEN
    CREATE POLICY "sponsor_stories_upload"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'sponsor-stories');
  END IF;
END $$;

-- Política: leitura pública
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'sponsor_stories_public_read'
  ) THEN
    CREATE POLICY "sponsor_stories_public_read"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'sponsor-stories');
  END IF;
END $$;
