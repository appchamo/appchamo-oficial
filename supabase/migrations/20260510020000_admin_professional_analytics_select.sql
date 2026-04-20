-- Permite que admins leiam os contadores e eventos de analytics dos profissionais
-- para alimentar o ranking em Admin > Relatórios > Profissionais.

DROP POLICY IF EXISTS "admins_select_professional_analytics_counters"
  ON public.professional_analytics_counters;

CREATE POLICY "admins_select_professional_analytics_counters"
  ON public.professional_analytics_counters
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admins_select_professional_analytics_events"
  ON public.professional_analytics_events;

CREATE POLICY "admins_select_professional_analytics_events"
  ON public.professional_analytics_events
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));
