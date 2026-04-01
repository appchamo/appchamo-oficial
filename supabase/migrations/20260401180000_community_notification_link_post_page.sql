-- Links de notificação/push da comunidade apontam para a página dedicada do post (`/p/comunidade/:id`).

CREATE OR REPLACE FUNCTION public.notify_followers_new_community_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_avatar text;
  v_thumb text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.user_id = NEW.author_id
      AND pr.user_type IN ('professional', 'company')
  ) THEN
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

  INSERT INTO public.notifications (
    user_id,
    title,
    message,
    type,
    read,
    link,
    image_url
  )
  SELECT
    pr.user_id,
    v_name,
    'publicou na comunidade',
    'community',
    false,
    '/p/comunidade/' || NEW.id::text,
    v_thumb
  FROM public.profiles pr
  WHERE pr.user_type IN ('professional', 'company')
    AND pr.user_id IS DISTINCT FROM NEW.author_id;

  RETURN NEW;
END;
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
    '/p/comunidade/' || NEW.post_id::text,
    v_thumb
  );

  RETURN NEW;
END;
$$;

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
      '/p/comunidade/' || NEW.post_id::text,
      v_thumb
    );
  END IF;

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
          '/p/comunidade/' || NEW.post_id::text,
          v_thumb
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_followers_new_community_post() IS
  'Notifica profissionais/empresas (exceto autor); link /p/comunidade/:id para abrir o post no app.';
