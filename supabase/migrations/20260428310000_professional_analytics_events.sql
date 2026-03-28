-- Eventos por timestamp para relatórios por período + atualização em tempo quase real.

CREATE TABLE IF NOT EXISTS public.professional_analytics_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  target_user_id uuid NOT NULL REFERENCES public.profiles (user_id) ON DELETE CASCADE,
  event_kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT professional_analytics_events_kind_chk CHECK (
    event_kind IN (
      'profile_view',
      'profile_click',
      'call_click',
      'appointment_booking',
      'name_search'
    )
  )
);

CREATE INDEX IF NOT EXISTS professional_analytics_events_target_created_idx
  ON public.professional_analytics_events (target_user_id, created_at DESC);

ALTER TABLE public.professional_analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "professional_analytics_events_select_own"
  ON public.professional_analytics_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = target_user_id);

COMMENT ON TABLE public.professional_analytics_events IS 'Histórico de métricas (uma linha por evento); agregação por intervalo via RPC.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'professional_analytics_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.professional_analytics_events;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'professional_analytics_counters'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.professional_analytics_counters;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.increment_professional_analytics(
  p_target_user_id uuid,
  p_event text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind text := lower(trim(p_event));
BEGIN
  IF p_target_user_id IS NULL OR v_kind IS NULL OR v_kind = '' THEN
    RETURN;
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() = p_target_user_id THEN
    RETURN;
  END IF;

  IF v_kind NOT IN (
    'profile_view',
    'profile_click',
    'call_click',
    'appointment_booking',
    'name_search'
  ) THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.professionals pr
    WHERE pr.user_id = p_target_user_id
      AND pr.active IS TRUE
      AND pr.profile_status = 'approved'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.professional_analytics_counters (
    user_id,
    profile_views,
    profile_clicks,
    call_clicks,
    appointment_bookings,
    name_searches
  )
  VALUES (
    p_target_user_id,
    CASE WHEN v_kind = 'profile_view' THEN 1 ELSE 0 END,
    CASE WHEN v_kind = 'profile_click' THEN 1 ELSE 0 END,
    CASE WHEN v_kind = 'call_click' THEN 1 ELSE 0 END,
    CASE WHEN v_kind = 'appointment_booking' THEN 1 ELSE 0 END,
    CASE WHEN v_kind = 'name_search' THEN 1 ELSE 0 END
  )
  ON CONFLICT (user_id) DO UPDATE SET
    profile_views = professional_analytics_counters.profile_views
      + CASE WHEN v_kind = 'profile_view' THEN 1 ELSE 0 END,
    profile_clicks = professional_analytics_counters.profile_clicks
      + CASE WHEN v_kind = 'profile_click' THEN 1 ELSE 0 END,
    call_clicks = professional_analytics_counters.call_clicks
      + CASE WHEN v_kind = 'call_click' THEN 1 ELSE 0 END,
    appointment_bookings = professional_analytics_counters.appointment_bookings
      + CASE WHEN v_kind = 'appointment_booking' THEN 1 ELSE 0 END,
    name_searches = professional_analytics_counters.name_searches
      + CASE WHEN v_kind = 'name_search' THEN 1 ELSE 0 END,
    updated_at = now();

  INSERT INTO public.professional_analytics_events (target_user_id, event_kind)
  VALUES (p_target_user_id, v_kind);
END;
$$;

DROP FUNCTION IF EXISTS public.get_my_professional_analytics();

CREATE OR REPLACE FUNCTION public.get_my_professional_analytics(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  uid uuid := auth.uid();
  r public.professional_analytics_counters%ROWTYPE;
  pv bigint;
  pc bigint;
  cc bigint;
  ab bigint;
  ns bigint;
BEGIN
  IF uid IS NULL THEN
    RETURN json_build_object(
      'profile_views', 0,
      'profile_clicks', 0,
      'call_clicks', 0,
      'appointment_bookings', 0,
      'name_searches', 0
    );
  END IF;

  IF p_from IS NULL AND p_to IS NULL THEN
    SELECT * INTO r FROM public.professional_analytics_counters WHERE user_id = uid;
    IF NOT FOUND THEN
      RETURN json_build_object(
        'profile_views', 0,
        'profile_clicks', 0,
        'call_clicks', 0,
        'appointment_bookings', 0,
        'name_searches', 0
      );
    END IF;

    RETURN json_build_object(
      'profile_views', r.profile_views,
      'profile_clicks', r.profile_clicks,
      'call_clicks', r.call_clicks,
      'appointment_bookings', r.appointment_bookings,
      'name_searches', r.name_searches
    );
  END IF;

  IF p_from IS NULL OR p_to IS NULL THEN
    RETURN json_build_object(
      'profile_views', 0,
      'profile_clicks', 0,
      'call_clicks', 0,
      'appointment_bookings', 0,
      'name_searches', 0
    );
  END IF;

  SELECT
    count(*) FILTER (WHERE event_kind = 'profile_view'),
    count(*) FILTER (WHERE event_kind = 'profile_click'),
    count(*) FILTER (WHERE event_kind = 'call_click'),
    count(*) FILTER (WHERE event_kind = 'appointment_booking'),
    count(*) FILTER (WHERE event_kind = 'name_search')
  INTO pv, pc, cc, ab, ns
  FROM public.professional_analytics_events
  WHERE target_user_id = uid
    AND created_at >= p_from
    AND created_at < p_to;

  RETURN json_build_object(
    'profile_views', coalesce(pv, 0),
    'profile_clicks', coalesce(pc, 0),
    'call_clicks', coalesce(cc, 0),
    'appointment_bookings', coalesce(ab, 0),
    'name_searches', coalesce(ns, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_professional_analytics(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_professional_analytics(timestamptz, timestamptz) TO authenticated;
