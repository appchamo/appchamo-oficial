-- =============================================================================
-- Correção: usuários criados por SQL (seed)
-- 1) Colunas de token em '' para evitar "Database error querying schema" no login.
-- 2) email_confirmed_at = now() para não pedir verificação de e-mail.
-- Execute no SQL Editor e depois tente logar de novo.
-- =============================================================================

UPDATE auth.users
SET
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change = COALESCE(email_change, ''),
  email_confirmed_at = COALESCE(email_confirmed_at, now())
WHERE confirmation_token IS NULL
   OR recovery_token IS NULL
   OR email_change_token_new IS NULL
   OR email_change IS NULL
   OR email_confirmed_at IS NULL;
