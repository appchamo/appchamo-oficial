
CREATE TABLE public.platform_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  icon_name text NOT NULL DEFAULT 'Briefcase',
  label text NOT NULL DEFAULT '',
  value_mode text NOT NULL DEFAULT 'manual',
  manual_value integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);

ALTER TABLE public.platform_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active stats"
  ON public.platform_stats FOR SELECT
  USING (active = true);

CREATE POLICY "Admins can manage stats"
  ON public.platform_stats FOR ALL
  USING (is_admin(auth.uid()));

INSERT INTO public.platform_stats (icon_name, label, value_mode, sort_order) VALUES
  ('Users', 'Profissionais', 'auto_professionals', 1),
  ('CheckCircle2', 'Serviços feitos', 'auto_services', 2),
  ('Trophy', 'Cupons emitidos', 'auto_coupons', 3);
