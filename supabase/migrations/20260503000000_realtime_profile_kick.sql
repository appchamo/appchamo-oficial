-- =============================================================================
-- Realtime "kick" — desloga o app do usuário no instante em que o admin exclui
-- -----------------------------------------------------------------------------
-- Hoje, quando um admin clica "Excluir" no painel:
--   1. cascadeDeleteUser apaga linhas relacionadas (incluindo profiles)
--   2. auth.admin.signOut(user_id, "global") revoga as sessões no servidor
--   3. auth.admin.deleteUser(user_id) remove o usuário do Auth
--
-- Mas o app no celular **não** sabe disso até:
--   • voltar ao foreground (AuthSessionGate revalida via getUser)
--   • o próximo TOKEN_REFRESHED (~1h) chamar getUser e falhar
--   • o próximo request autenticado retornar 401
--
-- Para deslogar instantaneamente, o cliente assina via Realtime o evento DELETE
-- da própria linha em `public.profiles` (filtrada por user_id). Quando admin
-- deleta, o cliente recebe o evento em milissegundos e força exitSessionToLanding.
--
-- Requisitos para isso funcionar:
--   1. profiles precisa estar na publication `supabase_realtime`
--   2. REPLICA IDENTITY FULL — sem isso, eventos DELETE só carregam a PK,
--      e o filtro `user_id=eq.<id>` nunca casa.
-- =============================================================================

-- 1) Adiciona profiles à publication de Realtime (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END
$$;

-- 2) REPLICA IDENTITY FULL → DELETE inclui todas as colunas no payload Realtime,
--    permitindo que o filtro `user_id=eq.<id>` funcione no client.
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
