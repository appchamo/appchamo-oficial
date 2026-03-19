# Assinatura iOS (App Store)

## Por que o plano subiu sem cobrança?

A edge function `validate_iap_subscription` **antes** podia ativar o plano se:

1. **`APPLE_SHARED_SECRET`** não estava definido no Supabase → a verificação com a Apple era **ignorada** e o plano era ativado.
2. O app **não enviava recibo** (`receipt`) → a verificação era **pulada**.
3. O recibo era aceito se tivesse **qualquer** transação antiga, não necessariamente uma assinatura **ativa** do produto contratado.

Correção: é obrigatório recibo + secret; a Apple precisa responder com assinatura **ativa** (`expires_date_ms` > agora) para o **product id** correto.

## Configuração obrigatória

1. App Store Connect → sua app → **App-Specific Shared Secret** (ou master shared secret).
2. Supabase → **Project Settings → Edge Functions → Secrets**:
   - `APPLE_SHARED_SECRET` = o secret copiado da Apple.

Sem isso, **novas ativações IAP no iOS falharão** até configurar (comportamento seguro).

## Profissionais já ativados por engano

No admin (usuários / assinaturas) ou SQL, volte o `plan_id` para `free` e ajuste `status` conforme sua regra de negócio.
