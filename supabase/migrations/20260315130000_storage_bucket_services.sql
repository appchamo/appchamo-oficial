-- Bucket "services" para fotos de serviços (planos Pro/VIP)
-- Rode no SQL Editor do Supabase se o bucket ainda não existir.

INSERT INTO storage.buckets (id, name, public)
VALUES ('services', 'services', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas: usuários autenticados podem fazer upload e gerenciar arquivos no bucket services
DROP POLICY IF EXISTS "Authenticated can upload to services" ON storage.objects;
CREATE POLICY "Authenticated can upload to services"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'services');

DROP POLICY IF EXISTS "Public read services" ON storage.objects;
CREATE POLICY "Public read services"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'services');

DROP POLICY IF EXISTS "Authenticated can update own in services" ON storage.objects;
CREATE POLICY "Authenticated can update own in services"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'services');

DROP POLICY IF EXISTS "Authenticated can delete from services" ON storage.objects;
CREATE POLICY "Authenticated can delete from services"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'services');
