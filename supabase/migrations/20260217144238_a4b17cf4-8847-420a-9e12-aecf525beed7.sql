-- Add bonus_calls column to professionals table
ALTER TABLE public.professionals ADD COLUMN bonus_calls integer NOT NULL DEFAULT 0;

-- Update the check_professional_call_limit function to consider bonus_calls
CREATE OR REPLACE FUNCTION public.check_professional_call_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  pro_user_id uuid;
  pro_plan_id text;
  call_count integer;
  max_calls_allowed integer;
  bonus integer;
BEGIN
  SELECT user_id, bonus_calls INTO pro_user_id, bonus FROM professionals WHERE id = NEW.professional_id;
  IF pro_user_id IS NULL THEN RETURN NEW; END IF;
  
  SELECT plan_id INTO pro_plan_id FROM subscriptions WHERE user_id = pro_user_id;
  IF pro_plan_id IS NULL THEN pro_plan_id := 'free'; END IF;
  
  SELECT max_calls INTO max_calls_allowed FROM plans WHERE id = pro_plan_id;
  IF max_calls_allowed IS NULL OR max_calls_allowed = -1 THEN RETURN NEW; END IF;
  
  -- Add bonus calls to the limit
  max_calls_allowed := max_calls_allowed + COALESCE(bonus, 0);
  
  SELECT count(*) INTO call_count FROM service_requests WHERE professional_id = NEW.professional_id;
  
  IF call_count >= max_calls_allowed THEN
    UPDATE professionals SET availability_status = 'unavailable' WHERE id = NEW.professional_id;
  END IF;
  
  RETURN NEW;
END;
$function$;