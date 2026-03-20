-- Permite que o próprio usuário veja seu registro em professionals,
-- independente do profile_status (pending, approved, rejected).
-- Sem isso, o fluxo "tornar-se profissional" não encontra a linha criada
-- pelo trigger e tenta um INSERT que viola a unique constraint (user_id_key).
CREATE POLICY "Users can view own professional row"
  ON public.professionals
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
