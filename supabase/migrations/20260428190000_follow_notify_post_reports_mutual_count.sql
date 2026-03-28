-- Notificação ao receber novo seguidor; contagem de amigos (seguimento mútuo); denúncias/ocultar posts.

CREATE OR REPLACE FUNCTION public.notify_professional_new_follower()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_uid uuid;
  v_follower_name text;
  v_follower_avatar text;
  v_fp_id uuid;
  v_fp_slug text;
  v_link text;
BEGIN
  SELECT user_id INTO v_owner_uid FROM public.professionals WHERE id = NEW.professional_id LIMIT 1;
  IF v_owner_uid IS NULL OR v_owner_uid = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT
    COALESCE(NULLIF(TRIM(display_name), ''), NULLIF(TRIM(full_name), ''), 'Alguém'),
    NULLIF(TRIM(avatar_url), '')
  INTO v_follower_name, v_follower_avatar
  FROM public.profiles
  WHERE user_id = NEW.user_id;

  SELECT id, slug INTO v_fp_id, v_fp_slug FROM public.professionals WHERE user_id = NEW.user_id LIMIT 1;

  IF v_fp_id IS NOT NULL THEN
    v_link := '/professional/' || COALESCE(NULLIF(TRIM(v_fp_slug), ''), v_fp_id::text);
  ELSE
    v_link := NULL;
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type, read, link, image_url, metadata)
  VALUES (
    v_owner_uid,
    v_follower_name,
    'começou a te seguir no Chamô',
    'follow',
    false,
    v_link,
    v_follower_avatar,
    jsonb_build_object(
      'follower_user_id', NEW.user_id,
      'follower_pro_key', CASE WHEN v_fp_id IS NOT NULL THEN COALESCE(NULLIF(TRIM(v_fp_slug), ''), v_fp_id::text) ELSE NULL END
    )
  );

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.notify_professional_new_follower() OWNER TO postgres;

DROP TRIGGER IF EXISTS trg_professional_follows_notify ON public.professional_follows;

CREATE TRIGGER trg_professional_follows_notify
  AFTER INSERT ON public.professional_follows
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_professional_new_follower();

CREATE OR REPLACE FUNCTION public.count_professional_mutual_followers(p_professional_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.professional_follows f_in
  INNER JOIN public.professionals p_follower ON p_follower.user_id = f_in.user_id
  INNER JOIN public.professional_follows f_back
    ON f_back.user_id = (SELECT p.user_id FROM public.professionals p WHERE p.id = p_professional_id)
   AND f_back.professional_id = p_follower.id
  WHERE f_in.professional_id = p_professional_id;
$$;

ALTER FUNCTION public.count_professional_mutual_followers(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.count_professional_mutual_followers(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_professional_mutual_followers(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.community_post_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts (id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'resolvido'))
);

CREATE INDEX IF NOT EXISTS idx_community_post_reports_created ON public.community_post_reports (created_at DESC);

ALTER TABLE public.community_post_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY community_post_reports_insert
  ON public.community_post_reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id AND length(trim(reason)) >= 10);

CREATE POLICY community_post_reports_select
  ON public.community_post_reports FOR SELECT TO authenticated
  USING (auth.uid() = reporter_id OR public.is_admin(auth.uid()));

CREATE POLICY community_post_reports_update_admin
  ON public.community_post_reports FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

GRANT SELECT, INSERT, UPDATE ON public.community_post_reports TO authenticated;

CREATE TABLE IF NOT EXISTS public.community_post_user_hides (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.community_posts (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

ALTER TABLE public.community_post_user_hides ENABLE ROW LEVEL SECURITY;

CREATE POLICY community_post_hides_select_own
  ON public.community_post_user_hides FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY community_post_hides_insert_own
  ON public.community_post_user_hides FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY community_post_hides_delete_own
  ON public.community_post_user_hides FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON public.community_post_user_hides TO authenticated;
