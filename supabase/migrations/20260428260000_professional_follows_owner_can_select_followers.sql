-- O dono do perfil profissional precisa de ler as linhas em que outros seguem o seu `professional_id`.
-- Sem isto, o cliente não consegue calcular seguimento mútuo via `professional_follows` (só vê as próprias linhas como seguidor).

DROP POLICY IF EXISTS professional_follows_select_as_owner ON public.professional_follows;

CREATE POLICY professional_follows_select_as_owner
  ON public.professional_follows FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.professionals pr
      WHERE pr.id = professional_follows.professional_id
        AND pr.user_id = auth.uid()
    )
  );
