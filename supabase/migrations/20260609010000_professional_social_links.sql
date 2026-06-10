-- Redes sociais do profissional (exibidas no perfil; só plano pago usa, gating no app).
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS social_whatsapp text,
  ADD COLUMN IF NOT EXISTS social_instagram text,
  ADD COLUMN IF NOT EXISTS social_link text;
