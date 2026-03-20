-- Adds `display_name` to `profiles` so we can show a different name to other users.
-- Also updates `profiles_public` view to expose `display_name` with fallback to `full_name`.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT '';

DROP VIEW IF EXISTS public.profiles_public;

CREATE VIEW public.profiles_public AS
SELECT
  "id",
  "user_id",
  "full_name",
  COALESCE(NULLIF(TRIM("display_name"), ''), "full_name") AS "display_name",
  "avatar_url",
  "user_type"
FROM public.profiles;
