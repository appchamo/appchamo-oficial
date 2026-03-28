-- Seguimento entre utilizadores (qualquer tipo / plano). Amigos = seguimento mútuo em user_follows.
-- Mantém professional_follows como fonte ao seguir um perfil profissional; trigger espelha em user_follows.

CREATE TABLE IF NOT EXISTS public.user_follows (
  follower_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  followed_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_user_id, followed_user_id),
  CONSTRAINT user_follows_no_self CHECK (follower_user_id IS DISTINCT FROM followed_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_follows_followed ON public.user_follows (followed_user_id);

ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_follows_select_involving_me
  ON public.user_follows FOR SELECT TO authenticated
  USING (follower_user_id = auth.uid() OR followed_user_id = auth.uid());

CREATE POLICY user_follows_insert_own
  ON public.user_follows FOR INSERT TO authenticated
  WITH CHECK (follower_user_id = auth.uid());

CREATE POLICY user_follows_delete_own
  ON public.user_follows FOR DELETE TO authenticated
  USING (follower_user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.user_follows TO authenticated;

INSERT INTO public.user_follows (follower_user_id, followed_user_id)
SELECT pf.user_id, p.user_id
FROM public.professional_follows pf
INNER JOIN public.professionals p ON p.id = pf.professional_id
WHERE pf.user_id IS DISTINCT FROM p.user_id
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.sync_user_follow_from_professional_follow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_uid uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT pr.user_id INTO owner_uid FROM public.professionals pr WHERE pr.id = NEW.professional_id LIMIT 1;
    IF owner_uid IS NOT NULL AND NEW.user_id IS DISTINCT FROM owner_uid THEN
      INSERT INTO public.user_follows (follower_user_id, followed_user_id)
      VALUES (NEW.user_id, owner_uid)
      ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT pr.user_id INTO owner_uid FROM public.professionals pr WHERE pr.id = OLD.professional_id LIMIT 1;
    IF owner_uid IS NOT NULL THEN
      DELETE FROM public.user_follows
      WHERE follower_user_id = OLD.user_id AND followed_user_id = owner_uid;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

ALTER FUNCTION public.sync_user_follow_from_professional_follow() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.sync_user_follow_from_professional_follow() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_professional_follows_sync_user_follow ON public.professional_follows;
CREATE TRIGGER trg_professional_follows_sync_user_follow
  AFTER INSERT OR DELETE ON public.professional_follows
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_follow_from_professional_follow();

-- Contagem mútua ao nível de utilizador (só o próprio ou admin).
CREATE OR REPLACE FUNCTION public.count_user_mutual_friends(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN (
    SELECT COUNT(*)::integer
    FROM (
      SELECT 1
      FROM public.user_follows uf1
      INNER JOIN public.user_follows uf2
        ON uf2.follower_user_id = uf1.followed_user_id
       AND uf2.followed_user_id = uf1.follower_user_id
      WHERE uf1.follower_user_id = p_user_id
    ) sub
  );
END;
$$;

ALTER FUNCTION public.count_user_mutual_friends(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.count_user_mutual_friends(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_user_mutual_friends(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.count_professional_mutual_followers(p_professional_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT COUNT(*)::integer
      FROM (
        SELECT 1
        FROM public.user_follows uf1
        INNER JOIN public.user_follows uf2
          ON uf2.follower_user_id = uf1.followed_user_id
         AND uf2.followed_user_id = uf1.follower_user_id
        WHERE uf1.follower_user_id = (SELECT p.user_id FROM public.professionals p WHERE p.id = p_professional_id LIMIT 1)
      ) sub
    ),
    0
  );
$$;

ALTER FUNCTION public.count_professional_mutual_followers(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.count_professional_mutual_followers(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_professional_mutual_followers(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.professional_is_mutual_with_viewer(p_professional_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.professionals pt
    WHERE pt.id = p_professional_id
      AND EXISTS (
        SELECT 1 FROM public.user_follows u1
        WHERE u1.follower_user_id = auth.uid() AND u1.followed_user_id = pt.user_id
      )
      AND EXISTS (
        SELECT 1 FROM public.user_follows u2
        WHERE u2.follower_user_id = pt.user_id AND u2.followed_user_id = auth.uid()
      )
  );
$$;

ALTER FUNCTION public.professional_is_mutual_with_viewer(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.professional_is_mutual_with_viewer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.professional_is_mutual_with_viewer(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.get_professional_mutual_friends_json(uuid);

CREATE FUNCTION public.get_professional_mutual_friends_json(p_professional_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_uid uuid;
  result jsonb;
BEGIN
  SELECT p.user_id INTO owner_uid FROM public.professionals p WHERE p.id = p_professional_id LIMIT 1;
  IF owner_uid IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;
  IF auth.uid() IS DISTINCT FROM owner_uid AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    (
      SELECT jsonb_agg(elem ORDER BY sort_key)
      FROM (
        SELECT
          jsonb_build_object(
            'user_id', q.other_uid,
            'pro_key',
            (SELECT COALESCE(NULLIF(TRIM(pr.slug), ''), pr.id::text)
             FROM public.professionals pr WHERE pr.user_id = q.other_uid LIMIT 1)
          ) AS elem,
          COALESCE(
            (SELECT COALESCE(NULLIF(TRIM(pr.slug), ''), pr.id::text)
             FROM public.professionals pr WHERE pr.user_id = q.other_uid LIMIT 1),
            q.other_uid::text
          ) AS sort_key
        FROM (
          SELECT DISTINCT uf1.followed_user_id AS other_uid
          FROM public.user_follows uf1
          INNER JOIN public.user_follows uf2
            ON uf2.follower_user_id = uf1.followed_user_id
           AND uf2.followed_user_id = uf1.follower_user_id
          WHERE uf1.follower_user_id = owner_uid
        ) q
      ) sub
    ),
    '[]'::jsonb
  )
  INTO result;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

ALTER FUNCTION public.get_professional_mutual_friends_json(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_professional_mutual_friends_json(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_professional_mutual_friends_json(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_user_mutual_friends_json(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    (
      SELECT jsonb_agg(elem ORDER BY sort_key)
      FROM (
        SELECT
          jsonb_build_object(
            'user_id', q.other_uid,
            'pro_key',
            (SELECT COALESCE(NULLIF(TRIM(pr.slug), ''), pr.id::text)
             FROM public.professionals pr WHERE pr.user_id = q.other_uid LIMIT 1)
          ) AS elem,
          COALESCE(
            (SELECT COALESCE(NULLIF(TRIM(pr.slug), ''), pr.id::text)
             FROM public.professionals pr WHERE pr.user_id = q.other_uid LIMIT 1),
            q.other_uid::text
          ) AS sort_key
        FROM (
          SELECT DISTINCT uf1.followed_user_id AS other_uid
          FROM public.user_follows uf1
          INNER JOIN public.user_follows uf2
            ON uf2.follower_user_id = uf1.followed_user_id
           AND uf2.followed_user_id = uf1.follower_user_id
          WHERE uf1.follower_user_id = p_user_id
        ) q
      ) sub
    ),
    '[]'::jsonb
  )
  INTO result;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

ALTER FUNCTION public.get_user_mutual_friends_json(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_user_mutual_friends_json(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_mutual_friends_json(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.list_professional_mutual_followers(uuid);

CREATE FUNCTION public.list_professional_mutual_followers(p_professional_id uuid)
RETURNS TABLE (
  friend_user_id uuid,
  friend_full_name text,
  friend_avatar_url text,
  friend_pro_key text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_uid uuid;
BEGIN
  SELECT p.user_id INTO owner_uid FROM public.professionals p WHERE p.id = p_professional_id LIMIT 1;
  IF owner_uid IS NULL THEN
    RETURN;
  END IF;
  IF auth.uid() IS DISTINCT FROM owner_uid AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    q.other_uid,
    'Profissional'::text,
    NULL::text,
    (SELECT COALESCE(NULLIF(TRIM(pr.slug), ''), pr.id::text)::text
     FROM public.professionals pr WHERE pr.user_id = q.other_uid LIMIT 1)
  FROM (
    SELECT DISTINCT uf1.followed_user_id AS other_uid
    FROM public.user_follows uf1
    INNER JOIN public.user_follows uf2
      ON uf2.follower_user_id = uf1.followed_user_id
     AND uf2.followed_user_id = uf1.follower_user_id
    WHERE uf1.follower_user_id = owner_uid
  ) q
  ORDER BY 4 NULLS LAST, 1;
END;
$$;

ALTER FUNCTION public.list_professional_mutual_followers(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_professional_mutual_followers(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_professional_mutual_followers(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.list_user_mutual_followers(uuid);

CREATE FUNCTION public.list_user_mutual_followers(p_user_id uuid)
RETURNS TABLE (
  friend_user_id uuid,
  friend_full_name text,
  friend_avatar_url text,
  friend_pro_key text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    q.other_uid,
    'Profissional'::text,
    NULL::text,
    (SELECT COALESCE(NULLIF(TRIM(pr.slug), ''), pr.id::text)::text
     FROM public.professionals pr WHERE pr.user_id = q.other_uid LIMIT 1)
  FROM (
    SELECT DISTINCT uf1.followed_user_id AS other_uid
    FROM public.user_follows uf1
    INNER JOIN public.user_follows uf2
      ON uf2.follower_user_id = uf1.followed_user_id
     AND uf2.followed_user_id = uf1.follower_user_id
    WHERE uf1.follower_user_id = p_user_id
  ) q
  ORDER BY 4 NULLS LAST, 1;
END;
$$;

ALTER FUNCTION public.list_user_mutual_followers(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_user_mutual_followers(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_user_mutual_followers(uuid) TO authenticated;
