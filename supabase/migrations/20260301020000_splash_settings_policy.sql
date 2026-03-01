-- Leitura pública das configurações da tela de carregamento (splash)
CREATE POLICY "Anyone can view splash settings"
  ON "public"."platform_settings"
  FOR SELECT
  USING (key IN (
    'splash_logo_url',
    'splash_bg_color',
    'splash_animation',
    'splash_duration_seconds'
  ));
