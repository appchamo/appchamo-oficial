-- Notificar seguidores quando um profissional publica na Comunidade (push usa notifications.image_url).

CREATE OR REPLACE FUNCTION public.notify_followers_new_community_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pro_id uuid;
  v_name text;
  v_thumb text;
  v_avatar text;
  r record;
BEGIN
  SELECT p.id INTO v_pro_id
  FROM public.professionals p
  WHERE p.user_id = NEW.author_id
  LIMIT 1;

  IF v_pro_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    COALESCE(
      NULLIF(trim(pr.display_name), ''),
      NULLIF(trim(pr.full_name), ''),
      'Profissional'
    ),
    NULLIF(trim(pr.avatar_url), '')
  INTO v_name, v_avatar
  FROM public.profiles pr
  WHERE pr.user_id = NEW.author_id
  LIMIT 1;

  v_thumb := NULLIF(trim(COALESCE(NEW.image_url, '')), '');
  IF v_thumb IS NULL OR v_thumb = '' THEN
    v_thumb := v_avatar;
  END IF;

  FOR r IN
    SELECT pf.user_id AS follower_uid
    FROM public.professional_follows pf
    WHERE pf.professional_id = v_pro_id
      AND pf.user_id IS DISTINCT FROM NEW.author_id
  LOOP
    INSERT INTO public.notifications (
      user_id,
      title,
      message,
      type,
      read,
      link,
      image_url
    ) VALUES (
      r.follower_uid,
      v_name,
      'publicou na comunidade',
      'info',
      false,
      '/home?feed=comunidade&post=' || NEW.id::text,
      v_thumb
    );
  END LOOP;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.notify_followers_new_community_post() OWNER TO postgres;

DROP TRIGGER IF EXISTS trg_community_post_notify_followers ON public.community_posts;

CREATE TRIGGER trg_community_post_notify_followers
  AFTER INSERT ON public.community_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_followers_new_community_post();

COMMENT ON FUNCTION public.notify_followers_new_community_post() IS
  'Insere uma notificação (e dispara push via webhook) para cada utilizador que segue o autor da publicação.';
