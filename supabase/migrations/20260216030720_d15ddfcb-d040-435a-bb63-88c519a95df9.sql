
-- =============================================
-- 1. Update app_role enum to include 'company'
-- =============================================
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'company';

-- =============================================
-- 2. Add CPF/CNPJ/phone/terms fields to profiles
-- =============================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cpf text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cnpj text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS accepted_terms_version text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS accepted_terms_at timestamptz;

-- Unique constraints for CPF and CNPJ (excluding nulls/empty)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_cpf_unique ON public.profiles (cpf) WHERE cpf IS NOT NULL AND cpf <> '';
CREATE UNIQUE INDEX IF NOT EXISTS profiles_cnpj_unique ON public.profiles (cnpj) WHERE cnpj IS NOT NULL AND cnpj <> '';

-- =============================================
-- 3. Add profile_status to professionals (pending/approved/rejected)
-- =============================================
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS profile_status text NOT NULL DEFAULT 'pending';

-- =============================================
-- 4. Create service_requests table
-- =============================================
CREATE TABLE IF NOT EXISTS public.service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  professional_id uuid NOT NULL REFERENCES public.professionals(id),
  status text NOT NULL DEFAULT 'pending',
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own requests" ON public.service_requests FOR SELECT
  USING (auth.uid() = client_id OR auth.uid() IN (SELECT user_id FROM professionals WHERE id = professional_id));
CREATE POLICY "Clients can create requests" ON public.service_requests FOR INSERT
  WITH CHECK (auth.uid() = client_id);
CREATE POLICY "Parties can update request" ON public.service_requests FOR UPDATE
  USING (auth.uid() = client_id OR auth.uid() IN (SELECT user_id FROM professionals WHERE id = professional_id));
CREATE POLICY "Admins manage requests" ON public.service_requests FOR ALL
  USING (is_admin(auth.uid()));

CREATE TRIGGER update_service_requests_updated_at
  BEFORE UPDATE ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 5. Create chat_messages table
-- =============================================
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view messages" ON public.chat_messages FOR SELECT
  USING (
    auth.uid() = sender_id OR
    EXISTS (
      SELECT 1 FROM service_requests sr
      WHERE sr.id = request_id AND (sr.client_id = auth.uid() OR sr.professional_id IN (SELECT p.id FROM professionals p WHERE p.user_id = auth.uid()))
    )
  );
CREATE POLICY "Participants can send messages" ON public.chat_messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM service_requests sr
      WHERE sr.id = request_id AND (sr.client_id = auth.uid() OR sr.professional_id IN (SELECT p.id FROM professionals p WHERE p.user_id = auth.uid()))
    )
  );
CREATE POLICY "Admins manage messages" ON public.chat_messages FOR ALL
  USING (is_admin(auth.uid()));

-- Enable realtime for chat
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

-- =============================================
-- 6. Seed more platform_settings (remove cashback, add fees, terms, hero)
-- =============================================
DELETE FROM public.platform_settings WHERE key = 'cashback_pct';

INSERT INTO public.platform_settings (key, value) VALUES
  ('hero_image_url', '""'::jsonb),
  ('logo_url', '""'::jsonb),
  ('landing_headline', '"Encontre profissionais de confiança perto de você"'::jsonb),
  ('landing_subheadline', '"Contrate com segurança e concorra a prêmios mensais."'::jsonb),
  ('terms_of_use', '""'::jsonb),
  ('terms_version', '"1.0"'::jsonb),
  ('privacy_policy', '""'::jsonb),
  ('pix_fee_pct', '"0"'::jsonb),
  ('pix_fee_fixed', '"0"'::jsonb),
  ('card_fee_pct', '"0"'::jsonb),
  ('card_fee_fixed', '"0"'::jsonb),
  ('card_installment_fee_pct', '"0"'::jsonb),
  ('card_installment_fee_fixed', '"0"'::jsonb),
  ('card_installment_increment', '"0"'::jsonb),
  ('raffle_prize_title', '"Prêmio Mensal"'::jsonb),
  ('raffle_draw_date', '""'::jsonb),
  ('raffle_rules', '""'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- =============================================
-- 7. Allow public SELECT on active professionals with profile join
-- =============================================
-- Already exists via "Anyone can view active professionals" policy

-- =============================================
-- 8. Add foreign key from profiles.user_id -> auth.users 
-- =============================================
-- Already implied. Add a profile view policy for public professional profiles
CREATE POLICY "Anyone can view professional profiles" ON public.profiles FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM professionals p WHERE p.user_id = profiles.user_id AND p.active = true)
  );
