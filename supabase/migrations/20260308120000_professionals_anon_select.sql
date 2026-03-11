-- App Store: permitir que usuários não logados vejam profissionais ativos e aprovados
-- (explorar app sem login; a política existente já restringe a active + profile_status = approved)

CREATE POLICY "Anon can view active approved professionals"
  ON public.professionals
  FOR SELECT
  TO anon
  USING (
    active = true
    AND profile_status = 'approved'
  );
 