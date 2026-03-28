-- Notifica o autor da publicação: reações no post, comentários e respostas.

CREATE OR REPLACE FUNCTION public._community_actor_profile(_uid uuid)
RETURNS TABLE (display_name text, avatar text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(
      NULLIF(trim(pr.display_name), ''),
      NULLIF(trim(pr.full_name), ''),
      'Alguém'
    ),
    NULLIF(trim(pr.avatar_url), '')
  FROM public.profiles pr
  WHERE pr.user_id = _uid
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public._community_post_thumb(_post_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN p.image_url IS NOT NULL AND length(trim(p.image_url)) > 0 THEN trim(p.image_url)
      ELSE NULL
    END
  FROM public.community_posts p
  WHERE p.id = _post_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.notify_community_post_reaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author uuid;
  v_actor_name text;
  v_actor_avatar text;
  v_thumb text;
  v_msg text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.reaction_type IS NOT DISTINCT FROM NEW.reaction_type THEN
    RETURN NEW;
  END IF;

  SELECT p.author_id INTO v_author
  FROM public.community_posts p
  WHERE p.id = NEW.post_id
  LIMIT 1;

  IF v_author IS NULL OR v_author = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT ap.display_name, ap.avatar INTO v_actor_name, v_actor_avatar
  FROM public._community_actor_profile(NEW.user_id) ap;

  v_thumb := COALESCE(public._community_post_thumb(NEW.post_id), v_actor_avatar);

  v_msg := CASE NEW.reaction_type
    WHEN 'like' THEN 'gostou da sua publicação'
    WHEN 'love' THEN 'amou sua publicação'
    WHEN 'congrats' THEN 'reagiu com Parabéns à sua publicação'
    WHEN 'genius' THEN 'reagiu com Genial à sua publicação'
    ELSE 'reagiu à sua publicação'
  END;

  INSERT INTO public.notifications (
    user_id,
    title,
    message,
    type,
    read,
    link,
    image_url
  ) VALUES (
    v_author,
    v_actor_name,
    v_msg,
    'community',
    false,
    '/home?feed=comunidade&post=' || NEW.post_id::text,
    v_thumb
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_post_reaction_notify ON public.community_post_reactions;

CREATE TRIGGER trg_community_post_reaction_notify
  AFTER INSERT OR UPDATE OF reaction_type ON public.community_post_reactions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_community_post_reaction();

CREATE OR REPLACE FUNCTION public.notify_community_post_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_author uuid;
  v_parent_uid uuid;
  v_actor_name text;
  v_actor_avatar text;
  v_thumb text;
BEGIN
  SELECT p.author_id INTO v_post_author
  FROM public.community_posts p
  WHERE p.id = NEW.post_id
  LIMIT 1;

  IF v_post_author IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT ap.display_name, ap.avatar INTO v_actor_name, v_actor_avatar
  FROM public._community_actor_profile(NEW.user_id) ap;

  v_thumb := COALESCE(public._community_post_thumb(NEW.post_id), v_actor_avatar);

  -- Comentário / resposta: notificar autor do post (visitantes do próprio post não geram notificação)
  IF NEW.user_id IS DISTINCT FROM v_post_author THEN
    INSERT INTO public.notifications (
      user_id,
      title,
      message,
      type,
      read,
      link,
      image_url
    ) VALUES (
      v_post_author,
      v_actor_name,
      CASE
        WHEN NEW.parent_id IS NULL THEN 'comentou na sua publicação'
        ELSE 'respondeu na sua publicação'
      END,
      'community',
      false,
      '/home?feed=comunidade&post=' || NEW.post_id::text,
      v_thumb
    );
  END IF;

  -- Resposta a um comentário: notificar autor do comentário pai (evita duplicar se o pai é o próprio autor do post já notificado acima)
  IF NEW.parent_id IS NOT NULL THEN
    SELECT c.user_id INTO v_parent_uid
    FROM public.community_post_comments c
    WHERE c.id = NEW.parent_id
    LIMIT 1;

    IF v_parent_uid IS NOT NULL AND v_parent_uid IS DISTINCT FROM NEW.user_id THEN
      IF NOT (v_parent_uid = v_post_author AND NEW.user_id IS DISTINCT FROM v_post_author) THEN
        INSERT INTO public.notifications (
          user_id,
          title,
          message,
          type,
          read,
          link,
          image_url
        ) VALUES (
          v_parent_uid,
          v_actor_name,
          'respondeu ao seu comentário',
          'community',
          false,
          '/home?feed=comunidade&post=' || NEW.post_id::text,
          v_thumb
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_post_comment_notify ON public.community_post_comments;

CREATE TRIGGER trg_community_post_comment_notify
  AFTER INSERT ON public.community_post_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_community_post_comment();

COMMENT ON FUNCTION public.notify_community_post_reaction() IS
  'Notifica o autor do post quando outro utilizador reage (insert ou troca de reação).';
COMMENT ON FUNCTION public.notify_community_post_comment() IS
  'Notifica o autor do post sobre comentários/respostas; notifica o autor do comentário pai sobre respostas.';
