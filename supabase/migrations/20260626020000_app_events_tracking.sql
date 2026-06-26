-- Rastreamento de uso por usuário (alimenta o Analytics do admin).
CREATE TABLE IF NOT EXISTS public.app_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id text,
  type text NOT NULL,            -- page_view | heartbeat | session_start | error | reached_home | login | action
  path text,
  label text,
  meta jsonb,
  platform text,                 -- web | ios | android
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_events_user_created_idx ON public.app_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS app_events_type_idx ON public.app_events (type);

ALTER TABLE public.app_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_events_insert_own ON public.app_events;
CREATE POLICY app_events_insert_own ON public.app_events
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS app_events_admin_select ON public.app_events;
CREATE POLICY app_events_admin_select ON public.app_events
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.email IN ('admin@appchamo.com','suporte@appchamo.com'))
  );
