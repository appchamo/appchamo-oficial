
-- Allow anyone to read login_bg_url, terms_of_use, privacy_policy, terms_version from platform_settings
CREATE POLICY "Anyone can view login and terms settings"
ON public.platform_settings
FOR SELECT
USING (key IN ('login_bg_url', 'terms_of_use', 'privacy_policy', 'terms_version'));

-- Add protocol to support_tickets
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS protocol text;

-- Create trigger for support ticket protocol
CREATE OR REPLACE FUNCTION public.generate_support_protocol()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.protocol := 'SUP-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 99999 + 1)::TEXT, 5, '0');
  RETURN NEW;
END;
$function$;

CREATE TRIGGER set_support_protocol
BEFORE INSERT ON public.support_tickets
FOR EACH ROW
EXECUTE FUNCTION public.generate_support_protocol();
