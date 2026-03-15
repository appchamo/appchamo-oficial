# Checklist: colocar o app em produção (Chamô)

Use este guia para garantir que o backend, builds e lojas estão prontos para produção.

---

## 1. Backend (Supabase)

| Item | Onde / Como | ✓ |
|------|-------------|---|
| **Projeto Supabase de produção** | Use o projeto que será definitivo (ou crie em [supabase.com](https://supabase.com)). Não use um projeto “staging” como produção. | ☐ |
| **Migrations aplicadas** | Todas as migrations em `supabase/migrations/` aplicadas no DB de produção (`supabase db push` ou SQL Editor). | ☐ |
| **Auth – Redirect URLs** | Supabase Dashboard → Authentication → URL Configuration → **Redirect URLs**: inclua `com.chamo.app://`, `https://appchamo.com/**`, `https://app.chamo.com/**` e a URL exata do seu site se tiver. | ☐ |
| **Auth – Site URL** | **Site URL** = URL principal do app (ex.: `https://appchamo.com`). | ☐ |
| **Edge Functions em produção** | Deploy das funções usadas em prod: `supabase functions deploy validate_iap_subscription`, `complete-signup`, etc. | ☐ |
| **Secrets** | Dashboard → Edge Functions → Secrets (ou `supabase secrets set`): `APPLE_SHARED_SECRET` para IAP, e qualquer outro (Asaas, OpenAI, etc.) que as funções usem. | ☐ |
| **Storage / RLS** | Buckets e políticas testados; uploads e leitura funcionando para usuários reais. | ☐ |

---

## 2. Variáveis de ambiente do app (produção)

O build de produção usa variáveis que começam com `VITE_`. Defina-as no **.env.production** (não commitar; já está no .gitignore) ou no seu CI/CD.

| Variável | Uso |
|----------|-----|
| `VITE_SUPABASE_URL` | URL do projeto Supabase de **produção** (ex.: `https://xxxx.supabase.co`) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave **anon/public** do projeto de produção (não a service_role) |

**Exemplo .env.production** (na raiz do projeto):

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Ao rodar `npm run build`, o Vite usa automaticamente `.env.production` em modo produção.

---

## 3. Build do app (produção)

| Item | Comando / Ação | ✓ |
|------|----------------|---|
| **Build web (produção)** | `npm run build` (usa .env.production se existir) | ☐ |
| **iOS** | `npx cap sync ios` → abrir no Xcode → aumentar **Build** → **Archive** → **Distribute** (TestFlight ou App Store). Ver [docs/TESTFLIGHT_IOS.md](TESTFLIGHT_IOS.md) e [docs/CHECKLIST_ENVIO_REVISAO.md](CHECKLIST_ENVIO_REVISAO.md). | ☐ |
| **Android** | `npx cap sync android` → aumentar **versionCode** em `android/app/build.gradle` → `cd android && ./gradlew bundleRelease` → enviar **app-release.aab** à Play Console. Ver [docs/PLAY_STORE_ANDROID.md](PLAY_STORE_ANDROID.md). | ☐ |

Garanta que o build foi feito com as variáveis do **projeto Supabase de produção** (não de dev/staging).

---

## 4. App Store (iOS)

| Item | Verificação | ✓ |
|------|-------------|---|
| **StoreKit = None** | Xcode → Scheme → Run → Options → StoreKit Configuration = **None** para o build de envio. | ☐ |
| **Version e Build** | Version (ex.: 1.0) e Build maior que o último enviado. | ☐ |
| **IAP na versão** | Na versão da App Store Connect, as assinaturas (Pro, VIP, Business) estão vinculadas. | ☐ |
| **Revisão de apps** | Login de teste, contato e notas para o revisor preenchidos. | ☐ |
| **Envio** | Archive → Distribute → App Store Connect → selecionar build → Enviar para revisão. | ☐ |

---

## 5. Play Store (Android)

| Item | Verificação | ✓ |
|------|-------------|---|
| **AAB assinado** | Keystore de release configurado; `./gradlew bundleRelease` gera **app-release.aab** assinado. | ☐ |
| **versionCode** | Maior que o da última versão publicada. | ☐ |
| **Upload** | Play Console → Produção (ou teste) → Criar nova versão → upload do **app-release.aab**. | ☐ |
| **Ficha da loja** | Descrição, capturas, política de privacidade, classificação etária preenchidos. | ☐ |

---

## 6. Pagamentos e integrações

| Item | Verificação | ✓ |
|------|-------------|---|
| **IAP (Apple)** | App Store Connect: assinaturas ativas; Supabase: `validate_iap_subscription` em prod e `APPLE_SHARED_SECRET` configurado. | ☐ |
| **Asaas** | Se for usar Asaas em produção: trocar para chave/ambiente de produção nas Edge Functions / secrets. | ☐ |
| **Firebase (push)** | Se usar: projeto Firebase de produção; `google-services.json` (Android) e configuração iOS corretos no app. | ☐ |

---

## 7. Erro 401 "Invalid JWT" ao gerar PIX (app em produção)

Se no site em produção (ex.: appchamo.com) o pagamento PIX retorna **401 Invalid JWT** ou "Sessão expirada":

1. **O build de produção** (o que está publicado em appchamo.com) foi gerado com variáveis de ambiente. Essas variáveis vêm do **servidor de deploy** (Vercel, Netlify, etc.), **não** do seu `.env` local.
2. No painel do **hospedagem** (ex.: Vercel → Project → Settings → Environment Variables), defina:
   - `VITE_SUPABASE_URL` = URL do projeto (ex.: `https://xxxx.supabase.co`)
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = **anon key** do Dashboard (Project Settings → API → anon public). Deve começar com `eyJ...`; **não** use chave que comece com `sb_publishable_...`.
3. **Refaça o deploy** para gerar um novo build com essas variáveis.
4. Abra o site em uma aba anônima, faça login de novo e tente o PIX.

Se funcionar em `npm run dev` com o `.env` correto e falhar só em produção, o problema é sempre a configuração de env no deploy.

---

## 8. Última checagem antes de publicar

- [ ] Testar login (e-mail e Google/Apple) em build de produção (TestFlight / teste interno Android).
- [ ] Testar fluxo de assinatura (IAP) em build real (sem StoreKit local).
- [ ] Confirmar que a URL do Supabase e a chave no build são do projeto de **produção**.

Quando tudo estiver marcado, o app está pronto para ir para produção nas lojas.
