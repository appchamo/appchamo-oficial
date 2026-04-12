-- Marca cadastro concluído no app (edge complete-signup). OAuth/e-mail antes de "Finalizar" fica NULL.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS signup_completed_at timestamptz;

COMMENT ON COLUMN public.profiles.signup_completed_at IS
  'Preenchido ao concluir o cadastro (complete-signup). NULL = utilizador ainda não finalizou o fluxo.';

-- Legado: quem já tinha cadastro útil no perfil conta como concluído.
UPDATE public.profiles p
SET signup_completed_at = COALESCE(p.accepted_terms_at, p.created_at)
WHERE p.signup_completed_at IS NULL
  AND (
    p.accepted_terms_at IS NOT NULL
    OR (p.phone IS NOT NULL AND btrim(p.phone) <> '')
    OR (p.cpf IS NOT NULL AND btrim(p.cpf::text) <> '')
    OR (p.cnpj IS NOT NULL AND btrim(p.cnpj::text) <> '')
    OR EXISTS (SELECT 1 FROM public.professionals pr WHERE pr.user_id = p.user_id)
    OR p.user_type IN ('professional', 'company', 'sponsor')
  );
