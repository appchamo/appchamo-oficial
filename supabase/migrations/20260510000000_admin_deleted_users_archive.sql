-- Arquivo de usuários excluídos: guarda um snapshot mínimo por 30 dias
-- para que o admin consiga rever quem foi removido e decidir purgar manualmente
-- antes do prazo.

CREATE TABLE IF NOT EXISTS public.deleted_users_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_user_id uuid NOT NULL,
  full_name text,
  email text,
  user_type text,
  phone text,
  cpf text,
  cnpj text,
  avatar_url text,
  address_city text,
  address_state text,
  profile_created_at timestamptz,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_by uuid,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  purge_after timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE INDEX IF NOT EXISTS deleted_users_archive_purge_after_idx
  ON public.deleted_users_archive (purge_after);

CREATE INDEX IF NOT EXISTS deleted_users_archive_deleted_at_idx
  ON public.deleted_users_archive (deleted_at DESC);

ALTER TABLE public.deleted_users_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_select_deleted_users_archive" ON public.deleted_users_archive;
CREATE POLICY "admins_select_deleted_users_archive"
  ON public.deleted_users_archive
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admins_delete_deleted_users_archive" ON public.deleted_users_archive;
CREATE POLICY "admins_delete_deleted_users_archive"
  ON public.deleted_users_archive
  FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Purga automática: qualquer admin pode disparar ao abrir a aba.
CREATE OR REPLACE FUNCTION public.admin_purge_expired_deleted_users()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  WITH deleted AS (
    DELETE FROM public.deleted_users_archive
     WHERE purge_after <= now()
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM deleted;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_purge_expired_deleted_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_purge_expired_deleted_users() TO authenticated;

COMMENT ON TABLE public.deleted_users_archive IS
  'Snapshot mínimo dos usuários excluídos (retenção de 30 dias). Inserção via Edge Function admin-manage (service role).';
