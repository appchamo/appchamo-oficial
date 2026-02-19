-- Add external link field to product_catalog
ALTER TABLE public.product_catalog ADD COLUMN IF NOT EXISTS external_url text DEFAULT NULL;