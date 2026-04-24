-- Presença de utilizadores: coluna last_seen_at em profiles + RPC touch_last_seen()
-- - Atualizada por heartbeat do app (web + nativo) a cada ~60s e em logins.
-- - Permite ao painel admin mostrar "Visto pela última vez" e filtros de atividade.
-- - O estado "online agora" é resolvido pelo Supabase Realtime Presence (sem persistência).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

COMMENT ON COLUMN public.profiles.last_seen_at IS
  'Última vez que o utilizador deu sinal de vida no app (heartbeat). Atualizada via RPC touch_last_seen().';

-- Índice descendente para listagens "mais ativos primeiro" e filtros recentes
CREATE INDEX IF NOT EXISTS profiles_last_seen_at_idx
  ON public.profiles (last_seen_at DESC NULLS LAST);

-- RPC SECURITY DEFINER: o utilizador autenticado atualiza o seu próprio last_seen_at
-- sem precisar de policy de UPDATE ampla em profiles.
CREATE OR REPLACE FUNCTION public.touch_last_seen()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.profiles
    SET last_seen_at = v_now
    WHERE user_id = v_uid;

  RETURN v_now;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_last_seen() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_last_seen() TO authenticated;

COMMENT ON FUNCTION public.touch_last_seen() IS
  'Heartbeat do utilizador autenticado: atualiza profiles.last_seen_at = now() para o próprio user.';
