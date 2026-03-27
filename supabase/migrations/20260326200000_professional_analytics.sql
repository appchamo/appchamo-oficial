-- Contadores de métricas públicas por profissional (visualizações em listas, cliques no perfil, CHAMAR, agendamentos, busca por nome).

CREATE TABLE IF NOT EXISTS public.professional_analytics_counters (
  user_id uuid PRIMARY KEY REFERENCES public.profiles (user_id) ON DELETE CASCADE,
  profile_views bigint NOT NULL DEFAULT 0,
  profile_clicks bigint NOT NULL DEFAULT 0,
  call_clicks bigint NOT NULL DEFAULT 0,
  appointment_bookings bigint NOT NULL DEFAULT 0,
  name_searches bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.professional_analytics_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "professional_analytics_select_own"
  ON public.professional_analytics_counters
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.professional_analytics_counters IS 'Métricas agregadas para relatório do profissional; escritas só via RPC.';

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

  -- Não contar o próprio profissional interagindo com o próprio perfil/cartão
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
END;
$$;

REVOKE ALL ON FUNCTION public.increment_professional_analytics(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_professional_analytics(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.increment_professional_analytics(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_professional_analytics()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  uid uuid := auth.uid();
  r public.professional_analytics_counters%ROWTYPE;
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
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_professional_analytics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_professional_analytics() TO authenticated;
