-- Força o PostgREST a recarregar o cache do schema
-- (necessário após adição de colunas via migration anterior)
NOTIFY pgrst, 'reload schema';

-- Garante que a coluna weekly_plan existe (idempotente)
ALTER TABLE public.sponsors
  ADD COLUMN IF NOT EXISTS weekly_plan TEXT NOT NULL DEFAULT 'free'
    CHECK (weekly_plan IN ('free', 'pack_14', 'pack_28'));

-- Garante que user_id existe também
ALTER TABLE public.sponsors
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
