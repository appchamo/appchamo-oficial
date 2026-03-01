-- Permitir leitura pública do texto do rodapé da Home (Layout Home no admin)
CREATE POLICY "Anyone can view home footer text"
  ON "public"."platform_settings"
  FOR SELECT
  USING (key = 'home_footer_text');
