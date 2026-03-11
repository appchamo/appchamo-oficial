# Conta de teste para a Apple – Ajustes necessários

O revisor viu a tela **"Os planos são exclusivos para profissionais e empresas"** porque a conta usada está como **cliente** (`user_type = 'client'`). Só usuários **profissionais** ou **empresas** veem a tela de planos e o botão "Assinar com Apple".

## O que fazer no Supabase

### 1. Ajustar a conta `testes@appchamo.com`

No **Supabase Dashboard** → **Table Editor**:

**Tabela `profiles`:**
- Localize a linha do usuário com e-mail **testes@appchamo.com** (ou busque pelo `user_id` em **Authentication** → **Users**).
- Altere o campo **user_type** para **`professional`** (não deixe como `client`).
- Salve.

**Tabela `professionals` (se existir linha para esse usuário):**
- Se existir um registro em `professionals` para o `user_id` desse usuário, defina **profile_status** para **`approved`** (ou o valor que o app trata como “aprovado”), para não cair na tela “Seu perfil profissional ainda está sendo analisado”.
- Se não existir linha em `professionals`, pode deixar assim; o app pode seguir mostrando planos para profissionais sem registro em `professionals` (dependendo da sua lógica).

### 2. Conferir no app

- Faça login com **testes@appchamo.com** / **Teste123@**.
- Vá em **Perfil** → **Planos**.
- Deve aparecer a lista de planos (Free, Pro, VIP, Business) e o fluxo de "Assinar com Apple" (no iOS).

Depois disso, nas **Notas para o revisor** na próxima submissão, deixe explícito que eles **devem usar essa conta** para testar as assinaturas e que ela já está configurada como profissional.

### Opcional: via SQL (Supabase → SQL Editor)

```sql
-- Trocar user_type para professional para o e-mail da conta de teste
UPDATE profiles
SET user_type = 'professional'
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'testes@appchamo.com');

-- Se existir tabela professionals e o usuário tiver registro "pending", aprovar
UPDATE professionals
SET profile_status = 'approved'
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'testes@appchamo.com')
  AND profile_status = 'pending';
```
