
-- Function to auto-deactivate free-plan professionals when they reach call limit
CREATE OR REPLACE FUNCTION public.check_professional_call_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  pro_user_id uuid;
  pro_plan_id text;
  call_count integer;
  max_calls_allowed integer;
BEGIN
  SELECT user_id INTO pro_user_id FROM professionals WHERE id = NEW.professional_id;
  IF pro_user_id IS NULL THEN RETURN NEW; END IF;
  
  SELECT plan_id INTO pro_plan_id FROM subscriptions WHERE user_id = pro_user_id;
  IF pro_plan_id IS NULL THEN pro_plan_id := 'free'; END IF;
  
  SELECT max_calls INTO max_calls_allowed FROM plans WHERE id = pro_plan_id;
  IF max_calls_allowed IS NULL OR max_calls_allowed = -1 THEN RETURN NEW; END IF;
  
  SELECT count(*) INTO call_count FROM service_requests WHERE professional_id = NEW.professional_id;
  
  IF call_count >= max_calls_allowed THEN
    UPDATE professionals SET availability_status = 'unavailable' WHERE id = NEW.professional_id;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_call_limit_after_request
AFTER INSERT ON public.service_requests
FOR EACH ROW
EXECUTE FUNCTION public.check_professional_call_limit();

-- Chat read status tracking
CREATE TABLE public.chat_read_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  last_read_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(request_id, user_id)
);

ALTER TABLE public.chat_read_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own read status"
ON public.chat_read_status FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own read status"
ON public.chat_read_status FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own read status"
ON public.chat_read_status FOR UPDATE
USING (auth.uid() = user_id);
