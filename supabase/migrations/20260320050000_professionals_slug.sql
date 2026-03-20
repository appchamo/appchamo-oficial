-- Enable unaccent extension for accent-insensitive slug generation
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Add slug column to professionals
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS slug text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_professionals_slug ON public.professionals (slug);

-- Function: generate a URL-safe slug from a display name, handling conflicts
CREATE OR REPLACE FUNCTION public.generate_professional_slug(p_user_id uuid, p_base_name text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  base_slug text;
  candidate  text;
  counter    int := 0;
BEGIN
  -- normalize: remove accents, lowercase, keep only alphanumeric, remove spaces
  base_slug := lower(
    regexp_replace(
      unaccent(p_base_name),
      '[^a-z0-9]', '', 'gi'
    )
  );

  -- fallback if name produces empty string
  IF base_slug = '' OR base_slug IS NULL THEN
    base_slug := 'profissional';
  END IF;

  candidate := base_slug;

  LOOP
    -- check if candidate is taken by another professional
    IF NOT EXISTS (
      SELECT 1 FROM public.professionals
      WHERE slug = candidate AND user_id <> p_user_id
    ) THEN
      RETURN candidate;
    END IF;
    counter := counter + 1;
    candidate := base_slug || counter::text;
  END LOOP;
END;
$$;

-- Trigger function: auto-set slug when professional row is inserted or slug is NULL
CREATE OR REPLACE FUNCTION public.set_professional_slug()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  display_name text;
BEGIN
  -- Only generate if slug is not already set
  IF NEW.slug IS NOT NULL AND NEW.slug <> '' THEN
    RETURN NEW;
  END IF;

  -- Fetch full_name from profiles
  SELECT full_name INTO display_name
  FROM public.profiles
  WHERE user_id = NEW.user_id
  LIMIT 1;

  IF display_name IS NULL OR display_name = '' THEN
    display_name := 'profissional';
  END IF;

  NEW.slug := public.generate_professional_slug(NEW.user_id, display_name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_professional_slug ON public.professionals;
CREATE TRIGGER trg_set_professional_slug
  BEFORE INSERT ON public.professionals
  FOR EACH ROW EXECUTE FUNCTION public.set_professional_slug();

-- Backfill slugs for existing professionals that don't have one
DO $$
DECLARE
  rec record;
  display_name text;
BEGIN
  FOR rec IN
    SELECT p.user_id FROM public.professionals p WHERE p.slug IS NULL
  LOOP
    SELECT full_name INTO display_name
    FROM public.profiles
    WHERE user_id = rec.user_id
    LIMIT 1;

    IF display_name IS NULL OR display_name = '' THEN
      display_name := 'profissional';
    END IF;

    UPDATE public.professionals
    SET slug = public.generate_professional_slug(rec.user_id, display_name)
    WHERE user_id = rec.user_id;
  END LOOP;
END;
$$;
