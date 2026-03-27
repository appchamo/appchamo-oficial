-- Corrige "column reference slug is ambiguous" (OUT columns da função colidem com colunas da tabela).

CREATE OR REPLACE FUNCTION public.get_my_seal_missions()
RETURNS TABLE (
  seal_id uuid,
  slug text,
  title text,
  description text,
  icon_variant text,
  sort_order integer,
  is_special boolean,
  awarded boolean,
  progress_ratio numeric,
  detail_label text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_pro_id uuid;
  v_calls integer;
  v_revenue numeric;
  v_month_revenue numeric;
  v_month_start date;
  v_need_defs integer;
  v_awarded_other integer;
  d record;
  v_awarded boolean;
  v_prog numeric;
  v_detail text;
  v_streak integer;
  v_need integer;
  v_min_calls integer;
  v_need_rev numeric;
  v_prog_selos numeric;
  v_prog_month numeric;
BEGIN
  SELECT p.id INTO v_pro_id FROM public.professionals p WHERE p.user_id = auth.uid() LIMIT 1;
  IF v_pro_id IS NULL THEN
    RETURN;
  END IF;

  SELECT count(*)::integer INTO v_calls FROM public.service_requests sr WHERE sr.professional_id = v_pro_id;

  SELECT COALESCE(sum(t.professional_net), 0) INTO v_revenue
  FROM public.transactions t
  WHERE t.professional_id = v_pro_id AND t.status = 'completed';

  v_month_start := date_trunc('month', timezone('utc', now()))::date;

  SELECT COALESCE(sum(t.professional_net), 0) INTO v_month_revenue
  FROM public.transactions t
  WHERE t.professional_id = v_pro_id
    AND t.status = 'completed'
    AND (t.created_at AT TIME ZONE 'UTC')::date >= v_month_start;

  SELECT count(*)::integer INTO v_need_defs
  FROM public.professional_seal_definitions def_cnt
  WHERE def_cnt.is_active IS TRUE AND def_cnt.slug <> 'chamo_master';

  SELECT count(DISTINCT a.seal_id)::integer INTO v_awarded_other
  FROM public.professional_seals_awarded a
  INNER JOIN public.professional_seal_definitions sd ON sd.id = a.seal_id
  WHERE a.professional_id = v_pro_id
    AND sd.slug <> 'chamo_master'
    AND sd.is_active IS TRUE;

  FOR d IN
    SELECT def.*
    FROM public.professional_seal_definitions def
    WHERE def.is_active IS TRUE
    ORDER BY def.sort_order
  LOOP
    v_awarded := EXISTS (
      SELECT 1 FROM public.professional_seals_awarded a
      WHERE a.professional_id = v_pro_id AND a.seal_id = d.id
    );
    v_prog := 0;
    v_detail := '';

    IF v_awarded THEN
      v_prog := 1;
      v_detail := 'Conquistado';
    ELSIF d.requirement_kind = 'calls' THEN
      v_min_calls := COALESCE((d.config->>'min_calls')::integer, 0);
      IF v_min_calls > 0 THEN
        v_prog := LEAST(1::numeric, v_calls::numeric / v_min_calls::numeric);
      END IF;
      v_detail := format('%s de %s chamadas', v_calls, v_min_calls);
    ELSIF d.requirement_kind = 'rating_streak' THEN
      v_need := COALESCE((d.config->>'streak_days')::integer, 30);
      SELECT COALESCE(s.streak_days, 0) INTO v_streak
      FROM public.professional_seal_streaks s
      WHERE s.professional_id = v_pro_id AND s.metric = 'rating';
      IF v_need > 0 THEN
        v_prog := LEAST(1::numeric, COALESCE(v_streak, 0)::numeric / v_need::numeric);
      END IF;
      v_detail := format('%s de %s dias com nota alta', COALESCE(v_streak, 0), v_need);
    ELSIF d.requirement_kind = 'response_streak' THEN
      v_need := COALESCE((d.config->>'streak_days')::integer, 30);
      SELECT COALESCE(s.streak_days, 0) INTO v_streak
      FROM public.professional_seal_streaks s
      WHERE s.professional_id = v_pro_id AND s.metric = 'response';
      IF v_need > 0 THEN
        v_prog := LEAST(1::numeric, COALESCE(v_streak, 0)::numeric / v_need::numeric);
      END IF;
      v_detail := format('%s de %s dias com resposta rápida', COALESCE(v_streak, 0), v_need);
    ELSIF d.requirement_kind = 'revenue_lifetime' THEN
      v_need_rev := COALESCE((d.config->>'min_revenue_brl')::numeric, 0);
      IF v_need_rev > 0 THEN
        v_prog := LEAST(1::numeric, v_revenue / NULLIF(v_need_rev, 0));
      END IF;
      v_detail := format(
        'R$ %s de R$ %s em vendas',
        trim(to_char(round(v_revenue, 2), 'FM999999990.00')),
        trim(to_char(round(v_need_rev, 2), 'FM999999990.00'))
      );
    ELSIF d.requirement_kind = 'chamo_master' THEN
      v_need_rev := COALESCE((d.config->>'min_monthly_brl')::numeric, 30000);
      IF v_need_defs > 0 THEN
        v_prog_selos := LEAST(1::numeric, v_awarded_other::numeric / v_need_defs::numeric);
      ELSE
        v_prog_selos := 1;
      END IF;
      IF v_need_rev > 0 THEN
        v_prog_month := LEAST(1::numeric, v_month_revenue / NULLIF(v_need_rev, 0));
      ELSE
        v_prog_month := 1;
      END IF;
      v_prog := LEAST(v_prog_selos, v_prog_month);
      v_detail := format(
        '%s/%s selos · mês R$ %s / R$ %s',
        v_awarded_other,
        v_need_defs,
        trim(to_char(round(v_month_revenue, 2), 'FM999999990.00')),
        trim(to_char(round(v_need_rev, 2), 'FM999999990.00'))
      );
    END IF;

    seal_id := d.id;
    slug := d.slug;
    title := d.title;
    description := d.description;
    icon_variant := d.icon_variant;
    sort_order := d.sort_order;
    is_special := d.is_special;
    awarded := v_awarded;
    progress_ratio := round(v_prog, 4);
    detail_label := v_detail;
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.get_my_seal_missions() IS 'Lista selos ativos com progresso para o profissional do JWT; uso na home e Programa de recompensas.';

NOTIFY pgrst, 'reload schema';
