-- Pedido aberto: notificar só profissionais da mesma categoria na MESMA CIDADE + UF
-- (cliente: city/state vindos do CEP/ViaCEP em open_service_requests;
--  profissional: profiles.address_* com fallback em profile_private).

CREATE OR REPLACE FUNCTION public.trg_notify_professionals_on_open_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cat_name text;
BEGIN
  SELECT c.name INTO v_cat_name
  FROM public.categories c
  WHERE c.id = NEW.category_id
  LIMIT 1;

  INSERT INTO public.notifications (user_id, title, message, type, link, read)
  SELECT
    pr.user_id,
    'Novo serviço disponível',
    'Confira pedidos abertos na sua categoria'
      || CASE
           WHEN v_cat_name IS NOT NULL AND length(trim(v_cat_name)) > 0
             THEN ' (' || trim(v_cat_name) || ')'
           ELSE ''
         END
      || ' em '
      || trim(NEW.city)
      || '/'
      || upper(trim(NEW.state))
      || '. '
      || left(trim(NEW.description), 120),
    'open_request_new',
    '/pro/pedidos-abertos',
    false
  FROM public.professionals p
  INNER JOIN public.profiles pr ON pr.user_id = p.user_id
  LEFT JOIN public.profile_private pp ON pp.user_id = p.user_id
  WHERE
    (
      p.category_id = NEW.category_id
      OR EXISTS (
        SELECT 1
        FROM public.professions pf
        WHERE pf.id = p.profession_id
          AND pf.category_id = NEW.category_id
      )
    )
    AND p.active = true
    AND p.profile_status = 'approved'
    AND pr.user_id IS DISTINCT FROM NEW.client_id
    AND length(trim(NEW.city)) > 0
    AND length(trim(NEW.state)) > 0
    AND upper(
          trim(
            COALESCE(nullif(trim(pr.address_state), ''), nullif(trim(pp.address_state), ''), '')
          )
        ) = upper(trim(NEW.state))
    AND length(
          trim(
            COALESCE(nullif(trim(pr.address_city), ''), nullif(trim(pp.address_city), ''), '')
          )
        ) > 0
    AND lower(
          trim(
            COALESCE(nullif(trim(pr.address_city), ''), nullif(trim(pp.address_city), ''), '')
          )
        ) = lower(trim(NEW.city));

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_notify_professionals_on_open_request() IS
  'Após INSERT em open_service_requests: notifica profissionais aprovados da mesma categoria na mesma cidade e UF (profiles ou profile_private).';

DROP TRIGGER IF EXISTS trg_open_service_request_notify_pros ON public.open_service_requests;
CREATE TRIGGER trg_open_service_request_notify_pros
  AFTER INSERT ON public.open_service_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notify_professionals_on_open_request();

-- Lista "Pedidos abertos" no app: mesmo critério cidade + UF (antes só UF).
DROP POLICY IF EXISTS open_service_requests_select_pro_region ON public.open_service_requests;
CREATE POLICY open_service_requests_select_pro_region
  ON public.open_service_requests FOR SELECT TO authenticated
  USING (
    status = 'open'
    AND public.is_professional_or_company_user(auth.uid())
    AND length(trim(open_service_requests.city)) > 0
    AND length(trim(open_service_requests.state)) > 0
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      LEFT JOIN public.profile_private pp ON pp.user_id = p.user_id
      WHERE p.user_id = auth.uid()
        AND upper(
              trim(
                COALESCE(nullif(trim(p.address_state), ''), nullif(trim(pp.address_state), ''), '')
              )
            ) = upper(trim(open_service_requests.state))
        AND length(
              trim(
                COALESCE(nullif(trim(p.address_city), ''), nullif(trim(pp.address_city), ''), '')
              )
            ) > 0
        AND lower(
              trim(
                COALESCE(nullif(trim(p.address_city), ''), nullif(trim(pp.address_city), ''), '')
              )
            ) = lower(trim(open_service_requests.city))
    )
  );
