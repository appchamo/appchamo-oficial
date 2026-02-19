
-- Add protocol number column to service_requests
ALTER TABLE public.service_requests ADD COLUMN IF NOT EXISTS protocol TEXT;

-- Create function to generate protocol numbers
CREATE OR REPLACE FUNCTION public.generate_protocol()
RETURNS TRIGGER AS $$
BEGIN
  NEW.protocol := 'CHM-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 99999 + 1)::TEXT, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger to auto-generate protocol on insert
CREATE TRIGGER set_protocol_on_insert
BEFORE INSERT ON public.service_requests
FOR EACH ROW
EXECUTE FUNCTION public.generate_protocol();

-- Generate protocols for existing requests that don't have one
UPDATE public.service_requests 
SET protocol = 'CHM-' || TO_CHAR(created_at, 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 99999 + 1)::TEXT, 5, '0')
WHERE protocol IS NULL;
