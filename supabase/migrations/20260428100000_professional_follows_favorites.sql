-- Seguir e favoritar profissionais (utilizadores autenticados, exceto o próprio perfil)

CREATE TABLE IF NOT EXISTS public.professional_follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.professionals (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, professional_id)
);

CREATE TABLE IF NOT EXISTS public.professional_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.professionals (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, professional_id)
);

CREATE INDEX IF NOT EXISTS idx_professional_follows_user ON public.professional_follows (user_id);
CREATE INDEX IF NOT EXISTS idx_professional_follows_pro ON public.professional_follows (professional_id);
CREATE INDEX IF NOT EXISTS idx_professional_favorites_user ON public.professional_favorites (user_id);
CREATE INDEX IF NOT EXISTS idx_professional_favorites_pro ON public.professional_favorites (professional_id);

ALTER TABLE public.professional_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY professional_follows_select_own
  ON public.professional_follows FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY professional_favorites_select_own
  ON public.professional_favorites FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY professional_follows_insert
  ON public.professional_follows FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = professional_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY professional_favorites_insert
  ON public.professional_favorites FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = professional_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY professional_follows_delete_own
  ON public.professional_follows FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY professional_favorites_delete_own
  ON public.professional_favorites FOR DELETE TO authenticated
  USING (user_id = auth.uid());
