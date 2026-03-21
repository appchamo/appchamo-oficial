-- Política de upload para patrocinadores autenticados
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

-- Política de atualização
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'sponsor_stories_update'
  ) THEN
    CREATE POLICY "sponsor_stories_update"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (bucket_id = 'sponsor-stories');
  END IF;
END $$;

-- Política de leitura pública
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

-- Política de deleção para o dono
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'sponsor_stories_delete'
  ) THEN
    CREATE POLICY "sponsor_stories_delete"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = 'sponsor-stories');
  END IF;
END $$;
