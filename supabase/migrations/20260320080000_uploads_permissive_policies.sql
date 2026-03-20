-- Drop policies anteriores que podem ter conflito
DROP POLICY IF EXISTS "Users can upload own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can read all uploads" ON storage.objects;

-- Política simples: qualquer usuário autenticado pode fazer upload no bucket uploads
CREATE POLICY "authenticated_upload_uploads"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'uploads');

-- Qualquer usuário autenticado pode ler do bucket uploads (para signed URLs)
CREATE POLICY "authenticated_read_uploads"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'uploads');

-- Usuário pode deletar seus próprios uploads
CREATE POLICY "owner_delete_uploads"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'uploads' AND owner::uuid = auth.uid());
