-- Permitir leitura dos termos e privacidade do profissional (app/signup profissional)
CREATE POLICY "Anyone can view professional terms settings"
  ON "public"."platform_settings"
  FOR SELECT
  USING (
    "key" = ANY (ARRAY[
      'terms_of_use_professional'::text,
      'privacy_policy_professional'::text,
      'terms_version_professional'::text
    ])
  );
