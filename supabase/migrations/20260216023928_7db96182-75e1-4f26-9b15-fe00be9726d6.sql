
-- Enum for admin/user roles
CREATE TYPE public.app_role AS ENUM ('super_admin', 'finance_admin', 'support_admin', 'sponsor_admin', 'moderator', 'client', 'professional');

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  user_type TEXT NOT NULL DEFAULT 'client' CHECK (user_type IN ('client', 'professional')),
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Check if user is any admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('super_admin', 'finance_admin', 'support_admin', 'sponsor_admin', 'moderator')
  )
$$;

-- Categories table
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  icon_name TEXT NOT NULL DEFAULT 'Briefcase',
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Sponsors table
CREATE TABLE public.sponsors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  niche TEXT,
  logo_url TEXT,
  link_url TEXT NOT NULL DEFAULT '#',
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  clicks INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sponsors ENABLE ROW LEVEL SECURITY;

-- Professionals table
CREATE TABLE public.professionals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  category_id UUID REFERENCES public.categories(id),
  bio TEXT,
  verified BOOLEAN NOT NULL DEFAULT false,
  rating NUMERIC(2,1) NOT NULL DEFAULT 0,
  total_services INT NOT NULL DEFAULT 0,
  total_reviews INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;

-- Admin audit log
CREATE TABLE public.admin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

-- Platform settings (key-value)
CREATE TABLE public.platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Transactions table
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES auth.users(id),
  professional_id UUID REFERENCES auth.users(id),
  total_amount NUMERIC(10,2) NOT NULL,
  platform_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  professional_net NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled', 'refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Coupons table
CREATE TABLE public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  source TEXT NOT NULL DEFAULT 'registration' CHECK (source IN ('registration', 'payment', 'bonus')),
  used BOOLEAN NOT NULL DEFAULT false,
  raffle_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- Raffles table
CREATE TABLE public.raffles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  draw_date TIMESTAMPTZ NOT NULL,
  winner_user_id UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'drawn', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.raffles ENABLE ROW LEVEL SECURITY;

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sponsors_updated_at BEFORE UPDATE ON public.sponsors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_professionals_updated_at BEFORE UPDATE ON public.professionals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON public.platform_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (NEW.id, COALESCE(NEW.email, ''), COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS Policies

-- Profiles: users see own, admins see all
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can update any profile" ON public.profiles FOR UPDATE USING (public.is_admin(auth.uid()));
CREATE POLICY "System can insert profiles" ON public.profiles FOR INSERT WITH CHECK (true);

-- User roles: admins manage
CREATE POLICY "Admins can view roles" ON public.user_roles FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Super admins can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));

-- Categories: public read, admin write
CREATE POLICY "Anyone can view active categories" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Admins can manage categories" ON public.categories FOR ALL USING (public.is_admin(auth.uid()));

-- Sponsors: public read active, admin write
CREATE POLICY "Anyone can view active sponsors" ON public.sponsors FOR SELECT USING (active = true);
CREATE POLICY "Admins can view all sponsors" ON public.sponsors FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can manage sponsors" ON public.sponsors FOR ALL USING (public.is_admin(auth.uid()));

-- Professionals: public read active, admin write
CREATE POLICY "Anyone can view active professionals" ON public.professionals FOR SELECT USING (active = true);
CREATE POLICY "Admins can view all professionals" ON public.professionals FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can manage professionals" ON public.professionals FOR ALL USING (public.is_admin(auth.uid()));
CREATE POLICY "Professionals can update own" ON public.professionals FOR UPDATE USING (auth.uid() = user_id);

-- Admin logs: admin only
CREATE POLICY "Admins can view logs" ON public.admin_logs FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can insert logs" ON public.admin_logs FOR INSERT WITH CHECK (public.is_admin(auth.uid()));

-- Platform settings: admin only
CREATE POLICY "Admins can view settings" ON public.platform_settings FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Super admins can manage settings" ON public.platform_settings FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));

-- Transactions: own or admin
CREATE POLICY "Users can view own transactions" ON public.transactions FOR SELECT USING (auth.uid() = client_id OR auth.uid() = professional_id);
CREATE POLICY "Admins can view all transactions" ON public.transactions FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can manage transactions" ON public.transactions FOR ALL USING (public.is_admin(auth.uid()));

-- Coupons: own or admin
CREATE POLICY "Users can view own coupons" ON public.coupons FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all coupons" ON public.coupons FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can manage coupons" ON public.coupons FOR ALL USING (public.is_admin(auth.uid()));

-- Raffles: public read, admin write
CREATE POLICY "Anyone can view raffles" ON public.raffles FOR SELECT USING (true);
CREATE POLICY "Admins can manage raffles" ON public.raffles FOR ALL USING (public.is_admin(auth.uid()));

-- Seed default categories
INSERT INTO public.categories (name, slug, icon_name, sort_order) VALUES
  ('Construção e Reforma', 'construction', 'Hammer', 1),
  ('Serviços para Casa', 'home-services', 'Home', 2),
  ('Beleza e Estética', 'beauty', 'Scissors', 3),
  ('Saúde e Terapias', 'health', 'HeartPulse', 4),
  ('Automotivo', 'automotive', 'Car', 5),
  ('Tecnologia e Informática', 'technology', 'Monitor', 6),
  ('Eventos e Fotografia', 'events', 'Camera', 7),
  ('Consultoria', 'consulting', 'BriefcaseBusiness', 8),
  ('Agro e Rural', 'agro', 'Tractor', 9),
  ('Mudanças e Transporte', 'moving', 'Truck', 10),
  ('Pets', 'pets', 'PawPrint', 11);

-- Seed demo sponsors
INSERT INTO public.sponsors (name, niche, link_url, sort_order) VALUES
  ('Bella Pizza', 'Alimentação', 'https://example.com/bellapizza', 1),
  ('Fratelli Casa', 'Decoração', 'https://example.com/fratelli', 2),
  ('Ferreira Cell', 'Tecnologia', 'https://example.com/ferreiracell', 3),
  ('Primitivo Café', 'Cafeteria', 'https://example.com/primitivo', 4),
  ('Pneumar', 'Automotivo', 'https://example.com/pneumar', 5),
  ('Doradin', 'Saúde', 'https://example.com/doradin', 6);

-- Seed platform settings
INSERT INTO public.platform_settings (key, value) VALUES
  ('commission_percent', '10'),
  ('cashback_percent', '2.5'),
  ('coupon_rules', '{"on_registration": 1, "on_payment": 1}');
