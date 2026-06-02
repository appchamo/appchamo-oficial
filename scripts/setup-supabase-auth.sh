#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# setup-supabase-auth.sh
#
# Configura automaticamente o projeto Supabase de PRODUÇÃO:
#   • site_url       → https://appchamo.com
#   • uri_allow_list → appchamo.com/** e app.chamo.com/**
#
# Uso:
#   SUPABASE_ACCESS_TOKEN=sbp_xxx bash scripts/setup-supabase-auth.sh
#
# Como obter o token:
#   https://supabase.com/dashboard/account/tokens  (Personal Access Token)
#
# O project-ref é lido automaticamente da variável ou do cliente.ts.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT_REF="wfxeiuqxzrlnvlopcrwd"

TOKEN="${SUPABASE_ACCESS_TOKEN:-}"
if [[ -z "$TOKEN" ]]; then
  echo ""
  echo "❌  Variável SUPABASE_ACCESS_TOKEN não definida."
  echo ""
  echo "   Crie um Personal Access Token em:"
  echo "   https://supabase.com/dashboard/account/tokens"
  echo ""
  echo "   Depois rode:"
  echo "   SUPABASE_ACCESS_TOKEN=sbp_xxx bash scripts/setup-supabase-auth.sh"
  echo ""
  exit 1
fi

API="https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth"

echo "🔧  Configurando Auth do projeto: ${PROJECT_REF}"
echo "    site_url     → https://appchamo.com"
echo "    redirect URLs → appchamo.com/**, app.chamo.com/**"
echo ""

HTTP_CODE=$(curl -s -o /tmp/supabase_auth_response.json -w "%{http_code}" -X PATCH "$API" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "site_url": "https://appchamo.com",
    "uri_allow_list": "https://appchamo.com/**,https://app.chamo.com/**,http://127.0.0.1:3000/**,https://127.0.0.1:3000/**"
  }')

HTTP_BODY=$(cat /tmp/supabase_auth_response.json)

if [[ "$HTTP_CODE" == "200" ]]; then
  echo "✅  Configuração aplicada com sucesso!"
  echo ""
  echo "   O fluxo de recuperação de senha agora funciona automaticamente:"
  echo "   1. Usuário clica «Esqueci a senha» no app"
  echo "   2. Recebe e-mail com link → https://appchamo.com/reset-password?code=XXX"
  echo "   3. Clica no link → define nova senha"
  echo ""
else
  echo "❌  Erro ao configurar (HTTP $HTTP_CODE):"
  echo "$HTTP_BODY" | python3 -m json.tool 2>/dev/null || echo "$HTTP_BODY"
  exit 1
fi
