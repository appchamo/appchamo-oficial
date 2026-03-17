-- Permite que qualquer um leia o plan_id de assinaturas de profissionais aprovados,
-- para exibir corretamente a seção Serviços/Catálogo no perfil público (quem vê não é o dono).
DROP POLICY IF EXISTS "Public can view subscription plan of approved professionals" ON "public"."subscriptions";
CREATE POLICY "Public can view subscription plan of approved professionals"
  ON "public"."subscriptions" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "public"."professionals" p
      WHERE p.user_id = subscriptions.user_id
        AND p.active = true
        AND p.profile_status = 'approved'
    )
  );
