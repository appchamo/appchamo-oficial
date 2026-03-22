-- =====================================================================
-- Tabela para sessões de login via QR Code
-- O app escaneia o QR, autentica e entrega o token para a web logar
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.qr_login_sessions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token       TEXT        UNIQUE NOT NULL,          -- conteúdo do QR code
  status      TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'completed', 'expired')),
  user_id     UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  -- tokens do supabase auth (armazenados brevemente para transferência web)
  access_token  TEXT,
  refresh_token TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  expires_at  TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '5 minutes') NOT NULL
);

-- Índices para buscas rápidas por token e limpeza de expirados
CREATE INDEX IF NOT EXISTS idx_qr_sessions_token    ON public.qr_login_sessions(token);
CREATE INDEX IF NOT EXISTS idx_qr_sessions_expires  ON public.qr_login_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_qr_sessions_status   ON public.qr_login_sessions(status);

-- Apenas service_role pode ler/escrever (edge function usa service_role_key)
ALTER TABLE public.qr_login_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only" ON public.qr_login_sessions
  USING (false);  -- bloqueia qualquer acesso anon/authenticated; edge function usa service_role
