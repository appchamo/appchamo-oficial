# Policy: Termos do Profissional (platform_settings)

Para os **termos de uso e política de privacidade do profissional** aparecerem no cadastro (signup como profissional), o Supabase precisa de uma policy de RLS na tabela `platform_settings` que permita **leitura** das chaves:

- `terms_of_use_professional`
- `privacy_policy_professional`
- `terms_version_professional`

## Como criar a policy

### 1. Pelo SQL Editor (Supabase Dashboard)

1. Abra o **Supabase Dashboard** do projeto ChamoBR.
2. No menu lateral, vá em **SQL Editor**.
3. Clique em **New query**.
4. Cole e execute o SQL abaixo:

```sql
-- Remove se já existir (evita erro ao rodar de novo)
DROP POLICY IF EXISTS "Anyone can view professional terms settings" ON "public"."platform_settings";

-- Cria a policy para leitura dos termos do profissional (signup e app)
CREATE POLICY "Anyone can view professional terms settings"
  ON "public"."platform_settings"
  FOR SELECT
  USING (
    "key" = ANY (ARRAY[
      'terms_of_use_professional'::text,
      'privacy_policy_professional'::text,
      'terms_version_professional'::text
    ])
  );
```

5. Clique em **Run** (ou Ctrl+Enter).

### 2. Pelo terminal (migrações)

Se você usa migrações do Supabase no projeto:

```bash
npx supabase db push
```

Isso aplica todas as migrações pendentes, incluindo a `20260303140000_platform_settings_professional_terms.sql`.

---

Depois de criar a policy, ela deve aparecer na lista de policies da tabela **Table Editor → platform_settings** (não em Authentication). Os termos do profissional passarão a carregar no modal ao cadastrar como profissional.
