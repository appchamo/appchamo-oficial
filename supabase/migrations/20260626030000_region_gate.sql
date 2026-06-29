-- Trava de região (cadastro + uso). Config em platform_settings (chaves region_*),
-- DESLIGADA por padrão. Leitura pública das chaves region_* (não sensíveis).
INSERT INTO public.platform_settings (key, value) VALUES
  ('region_gate_enabled', 'false'::jsonb),
  ('region_block_signup', 'true'::jsonb),
  ('region_block_app', 'true'::jsonb),
  ('region_allowed_cities', '"Patrocínio"'::jsonb),
  ('region_center_lat', '-18.9441'::jsonb),
  ('region_center_lng', '-46.9925'::jsonb),
  ('region_radius_km', '40'::jsonb)
ON CONFLICT (key) DO NOTHING;

DROP POLICY IF EXISTS "Anyone can view region gate settings" ON public.platform_settings;
CREATE POLICY "Anyone can view region gate settings"
  ON public.platform_settings FOR SELECT
  TO anon, authenticated
  USING (key LIKE 'region\_%');
