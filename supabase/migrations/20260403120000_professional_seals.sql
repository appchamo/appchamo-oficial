-- Selos de premiação para profissionais: definições editáveis no admin, conquistas e job de avaliação.

CREATE TABLE IF NOT EXISTS public.professional_seal_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  icon_variant text NOT NULL DEFAULT 'seal_default',
  requirement_kind text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_special boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.professional_seal_definitions IS 'Selos configuráveis. requirement_kind: calls, rating_streak, response_streak, revenue_lifetime, chamo_master';

CREATE TABLE IF NOT EXISTS public.professional_seal_streaks (
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  metric text NOT NULL,
  streak_days int NOT NULL DEFAULT 0,
  last_ok_date date,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (professional_id, metric)
);

CREATE TABLE IF NOT EXISTS public.professional_seals_awarded (
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  seal_id uuid NOT NULL REFERENCES public.professional_seal_definitions(id) ON DELETE CASCADE,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (professional_id, seal_id)
);

CREATE INDEX IF NOT EXISTS idx_seals_awarded_pro ON public.professional_seals_awarded (professional_id);
CREATE INDEX IF NOT EXISTS idx_seal_definitions_active ON public.professional_seal_definitions (is_active, sort_order);

ALTER TABLE public.professional_seal_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_seal_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_seals_awarded ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "seal_defs_admin_all" ON public.professional_seal_definitions;
DROP POLICY IF EXISTS "seal_defs_authenticated_read" ON public.professional_seal_definitions;
DROP POLICY IF EXISTS "seal_defs_select" ON public.professional_seal_definitions;
DROP POLICY IF EXISTS "seal_defs_insert" ON public.professional_seal_definitions;
DROP POLICY IF EXISTS "seal_defs_update" ON public.professional_seal_definitions;
DROP POLICY IF EXISTS "seal_defs_delete" ON public.professional_seal_definitions;

CREATE POLICY "seal_defs_select"
  ON public.professional_seal_definitions FOR SELECT TO authenticated
  USING (is_active IS TRUE OR public.is_admin(auth.uid()));

CREATE POLICY "seal_defs_insert"
  ON public.professional_seal_definitions FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "seal_defs_update"
  ON public.professional_seal_definitions FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "seal_defs_delete"
  ON public.professional_seal_definitions FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "seal_awards_own_read" ON public.professional_seals_awarded;
CREATE POLICY "seal_awards_own_read"
  ON public.professional_seals_awarded FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = professional_id AND p.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "seal_awards_admin_all" ON public.professional_seals_awarded;
CREATE POLICY "seal_awards_admin_all"
  ON public.professional_seals_awarded FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "seal_streaks_no_direct" ON public.professional_seal_streaks;
DROP POLICY IF EXISTS "seal_streaks_service" ON public.professional_seal_streaks;
CREATE POLICY "seal_streaks_no_direct"
  ON public.professional_seal_streaks FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

INSERT INTO public.professional_seal_definitions (slug, title, description, icon_variant, requirement_kind, config, is_special, sort_order)
VALUES
  ('calls_iniciante', 'Selo Iniciante', 'Conquiste com 1 chamada recebida na plataforma.', 'seal_iniciante', 'calls', '{"min_calls": 1}'::jsonb, false, 1),
  ('calls_pro', 'Selo Pro', 'Conquiste com 10 chamadas.', 'seal_pro', 'calls', '{"min_calls": 10}'::jsonb, false, 2),
  ('calls_vip', 'Selo VIP', 'Conquiste com 50 chamadas.', 'seal_vip', 'calls', '{"min_calls": 50}'::jsonb, false, 3),
  ('calls_business', 'Selo Business', 'Conquiste com 100 chamadas.', 'seal_business', 'calls', '{"min_calls": 100}'::jsonb, false, 4),
  ('rating_elite', 'Selo Rating', 'Mantenha avaliação média acima de 4,5 por 30 dias seguidos.', 'seal_rating', 'rating_streak', '{"min_rating": 4.5, "min_reviews": 3, "streak_days": 30}'::jsonb, false, 5),
  ('response_time', 'Selo Time', 'Mantenha tempo médio de resposta abaixo de 30 minutos por 30 dias seguidos.', 'seal_time', 'response_streak', '{"max_avg_response_seconds": 1800, "streak_days": 30}'::jsonb, false, 6),
  ('revenue_start', 'Selo Start', 'Total vendido (pagamentos concluídos) acima de R$ 5.000.', 'seal_start', 'revenue_lifetime', '{"min_revenue_brl": 5000}'::jsonb, false, 7),
  ('revenue_lobo', 'Selo Lobo', 'Total vendido acima de R$ 15.000.', 'seal_lobo', 'revenue_lifetime', '{"min_revenue_brl": 15000}'::jsonb, false, 8),
  ('chamo_master', 'Selo Chamô', 'Todos os outros selos ativos + mais de R$ 30.000 vendidos no mês corrente. Premiação especial, placa física e destaque nas redes.', 'seal_chamo', 'chamo_master', '{"min_monthly_brl": 30000}'::jsonb, true, 9),
  ('community_star', 'Selo Lenda', 'Marco de 200 chamadas na plataforma (ajuste o valor no painel se quiser).', 'seal_star', 'calls', '{"min_calls": 200}'::jsonb, false, 10)
ON CONFLICT (slug) DO NOTHING;

CREATE OR REPLACE FUNCTION public.refresh_professional_seal_streaks(p_today date DEFAULT (timezone('utc', now()))::date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  r record;
  v_rating_ok boolean;
  v_resp_ok boolean;
  v_min_rating numeric := 4.5;
  v_min_rev int := 3;
  v_max_sec int := 1800;
BEGIN
  FOR r IN
    SELECT p.id AS pro_id, p.rating, p.total_reviews, p.avg_response_seconds
    FROM public.professionals p
    WHERE p.profile_status = 'approved'
  LOOP
    v_rating_ok := r.rating IS NOT NULL AND r.rating >= v_min_rating
      AND COALESCE(r.total_reviews, 0) >= v_min_rev;
    v_resp_ok := r.avg_response_seconds IS NOT NULL
      AND r.avg_response_seconds > 0
      AND r.avg_response_seconds <= v_max_sec;

    IF v_rating_ok THEN
      INSERT INTO public.professional_seal_streaks (professional_id, metric, streak_days, last_ok_date)
      VALUES (r.pro_id, 'rating', 1, p_today)
      ON CONFLICT (professional_id, metric) DO UPDATE SET
        streak_days = CASE
          WHEN professional_seal_streaks.last_ok_date = p_today THEN professional_seal_streaks.streak_days
          WHEN professional_seal_streaks.last_ok_date = p_today - 1 THEN professional_seal_streaks.streak_days + 1
          ELSE 1
        END,
        last_ok_date = p_today,
        updated_at = now();
    ELSE
      UPDATE public.professional_seal_streaks
      SET streak_days = 0, last_ok_date = NULL, updated_at = now()
      WHERE professional_id = r.pro_id AND metric = 'rating';
    END IF;

    IF v_resp_ok THEN
      INSERT INTO public.professional_seal_streaks (professional_id, metric, streak_days, last_ok_date)
      VALUES (r.pro_id, 'response', 1, p_today)
      ON CONFLICT (professional_id, metric) DO UPDATE SET
        streak_days = CASE
          WHEN professional_seal_streaks.last_ok_date = p_today THEN professional_seal_streaks.streak_days
          WHEN professional_seal_streaks.last_ok_date = p_today - 1 THEN professional_seal_streaks.streak_days + 1
          ELSE 1
        END,
        last_ok_date = p_today,
        updated_at = now();
    ELSE
      UPDATE public.professional_seal_streaks
      SET streak_days = 0, last_ok_date = NULL, updated_at = now()
      WHERE professional_id = r.pro_id AND metric = 'response';
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.evaluate_professional_seals()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  d record;
  r record;
  v_calls int;
  v_revenue numeric;
  v_month_revenue numeric;
  v_month_start date;
  v_streak int;
  v_need int;
  v_need_defs int;
  v_awarded_other int;
  v_min_calls int;
  v_need_rev numeric;
  v_inserted int := 0;
BEGIN
  PERFORM public.refresh_professional_seal_streaks((timezone('utc', now()))::date);

  v_month_start := date_trunc('month', timezone('utc', now()))::date;

  SELECT count(*)::int INTO v_need_defs
  FROM public.professional_seal_definitions
  WHERE is_active IS TRUE AND slug <> 'chamo_master';

  FOR r IN
    SELECT p.id AS pro_id
    FROM public.professionals p
    WHERE p.profile_status = 'approved'
  LOOP
    SELECT count(*)::int INTO v_calls FROM public.service_requests sr WHERE sr.professional_id = r.pro_id;

    SELECT COALESCE(sum(t.professional_net), 0) INTO v_revenue
    FROM public.transactions t
    WHERE t.professional_id = r.pro_id AND t.status = 'completed';

    SELECT COALESCE(sum(t.professional_net), 0) INTO v_month_revenue
    FROM public.transactions t
    WHERE t.professional_id = r.pro_id AND t.status = 'completed'
      AND (t.created_at AT TIME ZONE 'UTC')::date >= v_month_start;

    FOR d IN
      SELECT * FROM public.professional_seal_definitions WHERE is_active IS TRUE ORDER BY sort_order
    LOOP
      IF EXISTS (
        SELECT 1 FROM public.professional_seals_awarded a WHERE a.professional_id = r.pro_id AND a.seal_id = d.id
      ) THEN
        CONTINUE;
      END IF;

      IF d.requirement_kind = 'calls' THEN
        v_min_calls := COALESCE((d.config->>'min_calls')::int, 0);
        IF v_calls >= v_min_calls THEN
          INSERT INTO public.professional_seals_awarded (professional_id, seal_id) VALUES (r.pro_id, d.id);
          v_inserted := v_inserted + 1;
        END IF;

      ELSIF d.requirement_kind = 'rating_streak' THEN
        v_need := COALESCE((d.config->>'streak_days')::int, 30);
        SELECT COALESCE(s.streak_days, 0) INTO v_streak
        FROM public.professional_seal_streaks s
        WHERE s.professional_id = r.pro_id AND s.metric = 'rating';
        IF COALESCE(v_streak, 0) >= v_need THEN
          INSERT INTO public.professional_seals_awarded (professional_id, seal_id) VALUES (r.pro_id, d.id);
          v_inserted := v_inserted + 1;
        END IF;

      ELSIF d.requirement_kind = 'response_streak' THEN
        v_need := COALESCE((d.config->>'streak_days')::int, 30);
        SELECT COALESCE(s.streak_days, 0) INTO v_streak
        FROM public.professional_seal_streaks s
        WHERE s.professional_id = r.pro_id AND s.metric = 'response';
        IF COALESCE(v_streak, 0) >= v_need THEN
          INSERT INTO public.professional_seals_awarded (professional_id, seal_id) VALUES (r.pro_id, d.id);
          v_inserted := v_inserted + 1;
        END IF;

      ELSIF d.requirement_kind = 'revenue_lifetime' THEN
        v_need_rev := COALESCE((d.config->>'min_revenue_brl')::numeric, 0);
        IF v_revenue >= v_need_rev THEN
          INSERT INTO public.professional_seals_awarded (professional_id, seal_id) VALUES (r.pro_id, d.id);
          v_inserted := v_inserted + 1;
        END IF;

      ELSIF d.requirement_kind = 'chamo_master' THEN
        v_need_rev := COALESCE((d.config->>'min_monthly_brl')::numeric, 30000);

        SELECT count(DISTINCT a.seal_id)::int INTO v_awarded_other
        FROM public.professional_seals_awarded a
        JOIN public.professional_seal_definitions sd ON sd.id = a.seal_id
        WHERE a.professional_id = r.pro_id
          AND sd.slug <> 'chamo_master'
          AND sd.is_active IS TRUE;

        IF v_awarded_other >= v_need_defs AND v_month_revenue >= v_need_rev THEN
          INSERT INTO public.professional_seals_awarded (professional_id, seal_id) VALUES (r.pro_id, d.id);
          v_inserted := v_inserted + 1;
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'awards_inserted', v_inserted);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_evaluate_professional_seals()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  RETURN public.evaluate_professional_seals();
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_professional_seal_streaks(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.evaluate_professional_seals() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_evaluate_professional_seals() TO authenticated;

COMMENT ON FUNCTION public.evaluate_professional_seals() IS 'Concede selos; agendar diariamente (cron) + botão admin.';
COMMENT ON FUNCTION public.admin_evaluate_professional_seals() IS 'Apenas admin: roda evaluate_professional_seals.';

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'professional-seals-evaluate-daily') THEN
    PERFORM cron.unschedule('professional-seals-evaluate-daily');
  END IF;
END
$$;

-- 03:30 UTC = 00:30 BRT — após refresh de tempo médio de resposta
SELECT cron.schedule(
  'professional-seals-evaluate-daily',
  '30 3 * * *',
  'SELECT public.evaluate_professional_seals();'
);

NOTIFY pgrst, 'reload schema';
