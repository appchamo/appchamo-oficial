-- Check-in de clientes no caixa do patrocinador
-- Cliente verificado escaneia o QR do caixa -> patrocinador é notificado e vê os dados básicos do cliente.

-- 1) Token estável por patrocinador (conteúdo do QR impresso)
ALTER TABLE public.sponsors
  ADD COLUMN IF NOT EXISTS checkin_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS sponsors_checkin_token_key
  ON public.sponsors (checkin_token);

-- 2) Consentimento LGPD do cliente (registrado na 1ª validação)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS checkin_consent_at timestamptz;

-- 3) Registro de check-ins
CREATE TABLE IF NOT EXISTS public.sponsor_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_id uuid NOT NULL REFERENCES public.sponsors(id) ON DELETE CASCADE,
  client_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sponsor_checkins_sponsor_created_idx
  ON public.sponsor_checkins (sponsor_id, created_at DESC);

ALTER TABLE public.sponsor_checkins ENABLE ROW LEVEL SECURITY;

-- Patrocinador lê apenas os próprios check-ins (defesa em profundidade;
-- a listagem no app passa pela Edge Function com service role).
-- Inserts só acontecem via service role (sem policy de INSERT = bloqueado para clientes).
DROP POLICY IF EXISTS "sponsor_reads_own_checkins" ON public.sponsor_checkins;
CREATE POLICY "sponsor_reads_own_checkins"
  ON public.sponsor_checkins
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sponsors s
      WHERE s.id = sponsor_checkins.sponsor_id
        AND s.user_id = auth.uid()
    )
  );
