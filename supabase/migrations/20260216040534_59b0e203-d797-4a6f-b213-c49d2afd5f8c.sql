
-- Plans reference table
CREATE TABLE public.plans (
  id text PRIMARY KEY,
  name text NOT NULL,
  price_monthly numeric NOT NULL DEFAULT 0,
  max_calls integer NOT NULL DEFAULT 3,
  max_devices integer NOT NULL DEFAULT 1,
  has_verified_badge boolean NOT NULL DEFAULT false,
  has_featured boolean NOT NULL DEFAULT false,
  has_product_catalog boolean NOT NULL DEFAULT false,
  has_job_postings boolean NOT NULL DEFAULT false,
  has_in_app_support boolean NOT NULL DEFAULT false,
  has_vip_event boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active plans"
ON public.plans FOR SELECT
USING (active = true);

CREATE POLICY "Admins can manage plans"
ON public.plans FOR ALL
USING (is_admin(auth.uid()));

-- Seed default plans
INSERT INTO public.plans (id, name, price_monthly, max_calls, max_devices, has_verified_badge, has_featured, has_product_catalog, has_job_postings, has_in_app_support, has_vip_event, sort_order) VALUES
  ('free',     'Free',     0,      3,  1, false, false, false, false, false, false, 0),
  ('pro',      'Pro',      39.90,  -1, 2, false, false, false, false, true,  false, 1),
  ('vip',      'VIP',      69.90,  -1, 10, true,  true,  false, false, true,  false, 2),
  ('business', 'Business', 249.90, -1, -1, true,  true,  true,  true,  true,  true,  3);

-- Subscriptions table
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id text NOT NULL REFERENCES public.plans(id) DEFAULT 'free',
  status text NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription"
ON public.subscriptions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own subscription"
ON public.subscriptions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own subscription"
ON public.subscriptions FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage subscriptions"
ON public.subscriptions FOR ALL
USING (is_admin(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_subscriptions_updated_at
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create free subscription on profile creation
CREATE OR REPLACE FUNCTION public.handle_new_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id, plan_id)
  VALUES (NEW.user_id, 'free')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_profile_created_subscription
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_subscription();
