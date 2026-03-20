-- Storage policies for the 'uploads' bucket
-- Users can upload to their own documents folder
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Users can upload own documents'
  ) THEN
    CREATE POLICY "Users can upload own documents"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'uploads' AND
        name LIKE 'documents/' || auth.uid()::text || '/%'
      );
  END IF;
END $$;

-- Users can read their own documents (needed for signed URLs)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Users can read own documents'
  ) THEN
    CREATE POLICY "Users can read own documents"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'uploads' AND
        name LIKE 'documents/' || auth.uid()::text || '/%'
      );
  END IF;
END $$;

-- Admins and support can read all documents in the uploads bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admins can read all uploads'
  ) THEN
    CREATE POLICY "Admins can read all uploads"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'uploads' AND
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE user_id = auth.uid()
            AND user_type IN ('admin', 'support')
        )
      );
  END IF;
END $$;
