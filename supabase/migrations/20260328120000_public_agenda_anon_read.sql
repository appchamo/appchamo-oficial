-- Agenda pública (link /agendar/...): leitura segura para anon + RPC de ocupação de slots

CREATE OR REPLACE FUNCTION public.professional_has_public_agenda(p_pro_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.professionals p
    WHERE p.id = p_pro_id
      AND p.active = true
      AND p.profile_status = 'approved'
      AND p.agenda_enabled = true
      AND (
        COALESCE(p.early_access, false) = true
        OR EXISTS (
          SELECT 1 FROM public.profiles pr
          WHERE pr.user_id = p.user_id AND pr.user_type = 'company'
        )
        OR EXISTS (
          SELECT 1 FROM public.subscriptions s
          WHERE s.user_id = p.user_id AND s.plan_id = 'business'
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.professional_has_public_agenda(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.professional_has_public_agenda(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_agenda_existing_ranges(
  p_professional_id uuid,
  p_date date,
  p_atendente_id uuid DEFAULT NULL
)
RETURNS TABLE(start_time time, end_time time)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT a.start_time, a.end_time::time AS end_time
  FROM public.agenda_appointments a
  WHERE a.professional_id = p_professional_id
    AND a.appointment_date = p_date
    AND a.status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'done'::text])
    AND public.professional_has_public_agenda(p_professional_id)
    AND (
      (p_atendente_id IS NULL AND a.atendente_id IS NULL)
      OR (a.atendente_id IS NOT DISTINCT FROM p_atendente_id)
    );
$$;

REVOKE ALL ON FUNCTION public.public_agenda_existing_ranges(uuid, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_agenda_existing_ranges(uuid, date, uuid) TO anon, authenticated;

-- Políticas de leitura: só agendas realmente públicas (antes: active=true / true expunha tudo)
DROP POLICY IF EXISTS "Clientes podem ver serviços ativos de profissionais" ON public.agenda_services;
CREATE POLICY "Leitura serviços de agenda pública"
  ON public.agenda_services FOR SELECT
  USING (
    active = true
    AND public.professional_has_public_agenda(professional_id)
  );

DROP POLICY IF EXISTS "Clientes podem ver regras de disponibilidade" ON public.agenda_availability_rules;
CREATE POLICY "Leitura regras de agenda pública"
  ON public.agenda_availability_rules FOR SELECT
  USING (public.professional_has_public_agenda(professional_id));

DROP POLICY IF EXISTS "Clientes podem ver bloqueios" ON public.agenda_availability_blocks;
CREATE POLICY "Leitura bloqueios de agenda pública"
  ON public.agenda_availability_blocks FOR SELECT
  USING (public.professional_has_public_agenda(professional_id));

DROP POLICY IF EXISTS "Clientes podem ver atendentes ativos" ON public.agenda_atendentes;
CREATE POLICY "Leitura atendentes de agenda pública"
  ON public.agenda_atendentes FOR SELECT
  USING (
    active = true
    AND public.professional_has_public_agenda(professional_id)
  );

GRANT SELECT ON public.agenda_services TO anon;
GRANT SELECT ON public.agenda_availability_rules TO anon;
GRANT SELECT ON public.agenda_availability_blocks TO anon;
GRANT SELECT ON public.agenda_atendentes TO anon;
