-- Selos por chamadas: conceder na hora (notificação via trigger em professional_seals_awarded),
-- em vez de esperar só pelo cron diário de evaluate_professional_seals().

CREATE OR REPLACE FUNCTION public.try_award_call_seals_for_professional(p_professional_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_calls int;
  d record;
  v_min int;
  v_inserted int := 0;
  v_rowcount int;
BEGIN
  IF p_professional_id IS NULL THEN
    RETURN 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = p_professional_id) THEN
    RETURN 0;
  END IF;

  SELECT count(*)::int INTO v_calls
  FROM public.service_requests sr
  WHERE sr.professional_id = p_professional_id;

  FOR d IN
    SELECT def.*
    FROM public.professional_seal_definitions def
    WHERE def.is_active IS TRUE AND def.requirement_kind = 'calls'
    ORDER BY def.sort_order
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.professional_seals_awarded a
      WHERE a.professional_id = p_professional_id AND a.seal_id = d.id
    ) THEN
      CONTINUE;
    END IF;

    v_min := COALESCE((d.config->>'min_calls')::int, 0);
    IF v_min > 0 AND v_calls >= v_min THEN
      INSERT INTO public.professional_seals_awarded (professional_id, seal_id)
      VALUES (p_professional_id, d.id)
      ON CONFLICT (professional_id, seal_id) DO NOTHING;

      GET DIAGNOSTICS v_rowcount = ROW_COUNT;
      IF v_rowcount > 0 THEN
        v_inserted := v_inserted + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION public.try_award_call_seals_for_professional(uuid) IS
  'Concede selos requirement_kind=calls conforme contagem de service_requests; dispara notificação seal_award.';

REVOKE ALL ON FUNCTION public.try_award_call_seals_for_professional(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_award_call_seals_for_professional(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_service_requests_try_call_seals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF NEW.professional_id IS NOT NULL THEN
    PERFORM public.try_award_call_seals_for_professional(NEW.professional_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_service_requests_try_call_seals ON public.service_requests;
CREATE TRIGGER trg_service_requests_try_call_seals
  AFTER INSERT ON public.service_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_service_requests_try_call_seals();

COMMENT ON FUNCTION public.trg_service_requests_try_call_seals() IS
  'Após nova linha em service_requests, reavalia selos por chamadas e cria notificação se houver conquista.';

-- Profissional logado: sincronizar selos (útil se já tinha chamadas antes desta migration).
CREATE OR REPLACE FUNCTION public.try_award_my_call_seals()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_pro uuid;
  v_n int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  SELECT p.id INTO v_pro FROM public.professionals p WHERE p.user_id = auth.uid() LIMIT 1;
  IF v_pro IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_professional');
  END IF;

  v_n := public.try_award_call_seals_for_professional(v_pro);
  RETURN jsonb_build_object('ok', true, 'awards_inserted', v_n);
END;
$$;

REVOKE ALL ON FUNCTION public.try_award_my_call_seals() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_award_my_call_seals() TO authenticated;

COMMENT ON FUNCTION public.try_award_my_call_seals() IS
  'Concede selos por chamadas pendentes para o profissional do JWT (ex.: abrir Programa de recompensas).';

-- Backfill: quem já tinha chamadas suficientes mas só o cron concederia o selo.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.professionals LOOP
    PERFORM public.try_award_call_seals_for_professional(r.id);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
