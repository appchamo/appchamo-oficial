
-- Create product catalog table
CREATE TABLE public.product_catalog (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  image_url TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.product_catalog ENABLE ROW LEVEL SECURITY;

-- Anyone can view active products of active professionals
CREATE POLICY "Anyone can view active products"
ON public.product_catalog FOR SELECT
USING (active = true AND EXISTS (
  SELECT 1 FROM professionals p WHERE p.id = product_catalog.professional_id AND p.active = true
));

-- Owner can manage own products
CREATE POLICY "Owner can insert products"
ON public.product_catalog FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM professionals p WHERE p.id = product_catalog.professional_id AND p.user_id = auth.uid()
));

CREATE POLICY "Owner can update own products"
ON public.product_catalog FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM professionals p WHERE p.id = product_catalog.professional_id AND p.user_id = auth.uid()
));

CREATE POLICY "Owner can delete own products"
ON public.product_catalog FOR DELETE
USING (EXISTS (
  SELECT 1 FROM professionals p WHERE p.id = product_catalog.professional_id AND p.user_id = auth.uid()
));

-- Admins can manage all
CREATE POLICY "Admins can manage products"
ON public.product_catalog FOR ALL
USING (is_admin(auth.uid()));
