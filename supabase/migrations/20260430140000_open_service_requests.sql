-- Pedido aberto: cliente publica necessidade; profissionais podem registrar interesse (até N por pedido).

CREATE TABLE IF NOT EXISTS public.open_service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories (id) ON DELETE RESTRICT,
  description text NOT NULL,
  neighborhood text,
  city text NOT NULL,
  state text NOT NULL,
  urgency text NOT NULL CHECK (urgency IN ('now', 'today', 'flexible')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'filled')),
  max_professional_interests integer NOT NULL DEFAULT 5
    CHECK (max_professional_interests > 0 AND max_professional_interests <= 20),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT open_service_requests_description_len CHECK (length(trim(description)) >= 3),
  CONSTRAINT open_service_requests_city_len CHECK (length(trim(city)) >= 1),
  CONSTRAINT open_service_requests_state_len CHECK (length(trim(state)) >= 1)
);

CREATE TABLE IF NOT EXISTS public.open_service_request_interests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  open_request_id uuid NOT NULL REFERENCES public.open_service_requests (id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.professionals (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (open_request_id, professional_id)
);

CREATE INDEX IF NOT EXISTS idx_open_service_requests_client ON public.open_service_requests (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_open_service_requests_open_region
  ON public.open_service_requests (status, state, category_id)
  WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_open_service_request_interests_request
  ON public.open_service_request_interests (open_request_id);

CREATE OR REPLACE FUNCTION public.trg_open_service_request_interests_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m int;
  c int;
BEGIN
  SELECT max_professional_interests INTO m
  FROM public.open_service_requests
  WHERE id = NEW.open_request_id;
  IF m IS NULL THEN
    m := 5;
  END IF;

  SELECT count(*)::int INTO c
  FROM public.open_service_request_interests
  WHERE open_request_id = NEW.open_request_id;

  IF c >= m THEN
    RAISE EXCEPTION 'Limite de interessados atingido para este pedido'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_open_service_request_interests_limit ON public.open_service_request_interests;
CREATE TRIGGER trg_open_service_request_interests_limit
  BEFORE INSERT ON public.open_service_request_interests
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_open_service_request_interests_limit();

CREATE TRIGGER update_open_service_requests_updated_at
  BEFORE UPDATE ON public.open_service_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.open_service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.open_service_request_interests ENABLE ROW LEVEL SECURITY;

-- Pedidos: dono vê os seus
CREATE POLICY open_service_requests_select_own
  ON public.open_service_requests FOR SELECT TO authenticated
  USING (client_id = auth.uid());

-- Profissionais/empresas: pedidos abertos na mesma UF do perfil (para descoberta regional)
CREATE POLICY open_service_requests_select_pro_region
  ON public.open_service_requests FOR SELECT TO authenticated
  USING (
    status = 'open'
    AND public.is_professional_or_company_user(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND upper(trim(p.address_state)) = upper(trim(open_service_requests.state))
    )
  );

CREATE POLICY open_service_requests_select_admin
  ON public.open_service_requests FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY open_service_requests_insert_client
  ON public.open_service_requests FOR INSERT TO authenticated
  WITH CHECK (client_id = auth.uid());

CREATE POLICY open_service_requests_update_own
  ON public.open_service_requests FOR UPDATE TO authenticated
  USING (client_id = auth.uid())
  WITH CHECK (client_id = auth.uid());

CREATE POLICY open_service_requests_update_admin
  ON public.open_service_requests FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (true);

-- Interesses: cliente vê interesses no seu pedido
CREATE POLICY open_service_request_interests_select_client
  ON public.open_service_request_interests FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.open_service_requests r
      WHERE r.id = open_request_id AND r.client_id = auth.uid()
    )
  );

-- Profissional vê o próprio interesse
CREATE POLICY open_service_request_interests_select_pro
  ON public.open_service_request_interests FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals pr
      WHERE pr.id = professional_id AND pr.user_id = auth.uid()
    )
  );

CREATE POLICY open_service_request_interests_select_admin
  ON public.open_service_request_interests FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY open_service_request_interests_insert_pro
  ON public.open_service_request_interests FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.professionals pr
      WHERE pr.id = professional_id AND pr.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.open_service_requests r
      WHERE r.id = open_request_id AND r.status = 'open'
    )
  );

CREATE POLICY open_service_request_interests_delete_pro
  ON public.open_service_request_interests FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals pr
      WHERE pr.id = professional_id AND pr.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.open_service_requests TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.open_service_request_interests TO authenticated;

COMMENT ON TABLE public.open_service_requests IS
  'Pedido aberto: cliente descreve necessidade; até N profissionais podem manifestar interesse.';
COMMENT ON TABLE public.open_service_request_interests IS
  'Manifestação de interesse de um profissional em um pedido aberto (único por par pedido+pro).';
