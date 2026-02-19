
-- 1. Professions table (linked to categories)
CREATE TABLE public.professions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.professions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active professions" ON public.professions FOR SELECT USING (true);
CREATE POLICY "Admins can manage professions" ON public.professions FOR ALL USING (is_admin(auth.uid()));

-- Add profession_id to professionals table
ALTER TABLE public.professionals ADD COLUMN profession_id uuid REFERENCES public.professions(id);

-- 2. Banners table for home page
CREATE TABLE public.banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  image_url text NOT NULL,
  link_url text DEFAULT '#',
  position text NOT NULL DEFAULT 'below_categories',
  sort_order integer NOT NULL DEFAULT 0,
  width text NOT NULL DEFAULT '100%',
  height text NOT NULL DEFAULT '120px',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active banners" ON public.banners FOR SELECT USING (active = true);
CREATE POLICY "Admins can manage banners" ON public.banners FOR ALL USING (is_admin(auth.uid()));

CREATE TRIGGER update_banners_updated_at BEFORE UPDATE ON public.banners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
