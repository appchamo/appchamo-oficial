-- Vídeos no bucket community-feed (antes: só imagens + 5 MB → upload falhava).
-- Notificar todos os profissionais/empresas ao publicar (não só seguidores), com avatar quando não há imagem no post.

UPDATE storage.buckets
SET
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/jpg',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-m4v',
    'video/mov',
    'video/3gpp',
    'video/3gp'
  ]::text[]
WHERE id = 'community-feed';

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
    '/home?feed=comunidade&post=' || NEW.id::text,
    v_thumb
  FROM public.profiles pr
  WHERE pr.user_type IN ('professional', 'company')
    AND pr.user_id IS DISTINCT FROM NEW.author_id;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.notify_followers_new_community_post() OWNER TO postgres;

COMMENT ON FUNCTION public.notify_followers_new_community_post() IS
  'Notifica todos os utilizadores professional/company (exceto o autor) com foto do post ou avatar do autor; push usa image_url.';
