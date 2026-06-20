-- Programa de check-in no caixa: flag de ativo + % de desconto por patrocinador.
ALTER TABLE public.sponsors ADD COLUMN IF NOT EXISTS checkin_active boolean NOT NULL DEFAULT false;
ALTER TABLE public.sponsors ADD COLUMN IF NOT EXISTS checkin_discount_percent numeric(5,2) NOT NULL DEFAULT 0;
