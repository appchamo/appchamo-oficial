# Validação de CPF/CNPJ no cadastro do profissional

No cadastro inicial do **profissional**, o CPF (ou CNPJ) é validado usando a **API do Asaas**: tentamos criar um cliente com o nome e o documento informados. Se o Asaas aceitar, consideramos o documento válido e que confere com o nome.

## O que o Asaas valida

- **Formato** do CPF/CNPJ (dígitos, tamanho, dígitos verificadores).
- **Consistência** do documento (o Asaas aplica validações internas; em produção eles podem rejeitar documentos inválidos ou que não batem com o nome).

Não há documentação pública do Asaas afirmando consulta à Receita Federal em tempo real; na prática, ao criar o cliente, se o Asaas retornar **erro 400**, exibimos a mensagem ao usuário e bloqueamos o avanço. Se retornar **200**, o documento é aceito e o `asaas_customer_id` é guardado no perfil para reutilizar em assinaturas e pagamentos.

## Fluxo

1. Usuário preenche **nome** e **CPF/CNPJ** na etapa “Dados pessoais” (cadastro profissional).
2. Ao clicar em “Próximo”, o app chama a edge function **`validate-cpf-signup`** com `name` e `cpfCnpj` (apenas números).
3. A função chama `POST /customers` no Asaas. Se der erro, retorna `{ valid: false, message: "..." }` e o app mostra um toast e não avança.
4. Se der sucesso, retorna `{ valid: true, asaas_customer_id }`. O app envia esse `asaas_customer_id` no `basicData` para o **complete-signup**.
5. O **complete-signup** grava `asaas_customer_id` no perfil. Na criação de assinatura ou pagamento, o cliente Asaas já existe e é reutilizado.

## Variáveis de ambiente

A edge function **validate-cpf-signup** usa as mesmas variáveis do restante do Asaas:

- **ASAAS_API_KEY** – obrigatória; se não estiver definida, a função retorna “Validação temporariamente indisponível”.
- **ASAAS_ENV** – opcional; `sandbox` (padrão) ou `production`.

Configure no Supabase: **Project Settings → Edge Functions → Secrets** (ou env do projeto).

## Arquivos envolvidos

- **supabase/functions/validate-cpf-signup/index.ts** – validação via Asaas e retorno de `asaas_customer_id`.
- **src/components/signup/StepBasicData.tsx** – chama a validação para profissional e repassa `asaas_customer_id` no `basicData`.
- **supabase/functions/complete-signup/index.ts** – persiste `asaas_customer_id` no perfil quando vier em `basicData`.

## Consulta “nome + CPF” em base oficial

Para garantir que o **nome** confira com o CPF em base da Receita Federal, seria necessário um serviço de consulta CPF (ex.: Infosimples, SERPRO ou outro provedor). O uso do Asaas já reduz documentos inválidos ou em formato errado e documentos que o Asaas rejeita na criação do cliente.
