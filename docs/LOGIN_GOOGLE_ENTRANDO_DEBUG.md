# Login com Google — "Fica só ENTRANDO" — Diagnóstico e opções

## Fluxo atual (resumo)

1. Usuário toca em **Entrar com Google** → `loading = true` (mostra "Entrando...").
2. App chama `signInWithOAuth` e depois `Browser.open(url)` → abre Chrome Custom Tabs (Android) ou Safari (iOS).
3. Usuário faz login no Google; Supabase/Google redireciona para:
   - **iOS:** `com.chamo.app://oauth?code=xxx` (scheme direto).
   - **Android:** `https://appchamo.com/oauth-callback?code=xxx` (página ponte).
4. **Android:** A página `/oauth-callback` carrega no Custom Tabs e redireciona para `com.chamo.app://oauth?code=xxx`.
5. O sistema deveria abrir o app com essa URL → evento `appUrlOpen` no Capacitor.
6. No `useAuth`, `handleUrl` troca o código por sessão (`exchangeCodeForSession`) e faz `window.location.href = '/home'`.

O travamento em "Entrando..." significa que o passo 5 ou 6 **não está acontecendo** no seu cenário.

---

## Possíveis causas (lista)

### 1. O app nunca recebe a URL (intent não chega)

- **O que é:** O Custom Tabs (Android) ou o Safari (iOS) carrega `com.chamo.app://oauth?code=...` **dentro da aba** em vez de mandar para o sistema abrir o app.
- **Sintoma:** Você não volta para o app; fica na aba ou numa tela em branco/erro. Ou volta para o app mas sem a URL (continua "Entrando...").
- **Como conferir:**
  - **Android:** No Logcat (Android Studio), filtrar por `Intent` ou `appUrlOpen` / `handleOnNewIntent` depois do login. Se não aparecer nada quando o redirect acontece, o intent não está sendo entregue ao app.
  - **Android (callback):** Depois do login, você chega a ver a página "Redirecionando para o app..." / "Se o app não abriu, toque aqui"? Se sim, o problema é o passo de **abrir o app** a partir dessa página (redirect ou link).

### 2. Intent filter no Android não casa com a URL

- **O que é:** A URL que o Supabase usa é, por exemplo, `com.chamo.app://oauth?code=...`. O intent filter atual exige `scheme="com.chamo.app"` e `host="oauth"`. Se em algum lugar estiver sendo usada outra URL (ex.: `com.chamo.app://` sem host), o Android não entrega o intent para o nosso app.
- **Como conferir:** Ver no Supabase qual **redirect URL** está configurada (e qual o app realmente usa no `Login.tsx`). Ver no `AndroidManifest.xml` o `<data android:scheme="..." android:host="..." />` e garantir que batem (scheme + host).

### 3. `appUrlOpen` dispara antes do listener estar registrado

- **O que é:** O app abre com a URL, o Capacitor dispara `appUrlOpen`, mas o JavaScript do React ainda não registrou o listener (AuthProvider / useAuth ainda não montou ou o `useEffect` ainda não rodou).
- **Sintoma:** O app volta da tela do Google, mas a tela continua "Entrando..." e nunca vai para a HOME.
- **Como conferir:** Colocar um `console.log` no início de `handleUrl` no `useAuth.tsx`. Se no Logcat (Android) ou no debug do WebView você **nunca** ver esse log quando volta do login, o evento pode estar sendo disparado antes do listener existir (ou não estar sendo disparado).

### 4. Código trocado mas navegação não acontece

- **O que é:** `exchangeCodeForSession` roda e dá certo, mas `window.location.href = '/home'` não redireciona (ex.: WebView/Capacitor tratando de outro jeito, ou erro silencioso).
- **Sintoma:** Sessão existe (ex.: se fechar e reabrir o app já está logado), mas na hora não sai da tela de login.
- **Como conferir:** Log antes e depois de `exchangeCodeForSession` e antes de `window.location.href = '/home'`. Ver se há erro no `catch` ou se o código nem chega no `window.location.href`.

### 5. `exchangeCodeForSession` falha (code inválido, rede, etc.)

- **O que é:** A URL chega com `code=...`, mas o Supabase devolve erro (code já usado, expirado, rede, CORS, etc.).
- **Sintoma:** App até pode abrir, mas continua na tela de login ou volta para ela.
- **Como conferir:** O `catch` em `handleUrl` faz `console.error("Deep link error:", e)`. Ver no Logcat / console se aparece esse erro e a mensagem do Supabase.

### 6. Redirect URL não permitida no Supabase

- **O que é:** A URL de redirect (por exemplo `com.chamo.app://oauth` ou `https://appchamo.com/oauth-callback`) não está em **Authentication → URL Configuration → Redirect URLs** no Supabase.
- **Sintoma:** Supabase pode não redirecionar com `code` ou redirecionar para uma URL de erro. O app não recebe o `code` correto.
- **Como conferir:** No painel do Supabase, em **Authentication → URL Configuration**, ver a lista de **Redirect URLs** e garantir que estão exatamente as que o app usa (iOS e Android).

---

## Opções de solução (o que podemos fazer)

### Opção A — Logs para ver onde para

- No `useAuth.tsx`, em `handleUrl`:
  - Log no início: `console.log('[OAuth] handleUrl called', urlStr?.substring(0, 80));`
  - Log depois de extrair o code: `console.log('[OAuth] code extracted', !!code);`
  - Log depois do exchange: `console.log('[OAuth] exchange result', exchangeError?.message || 'ok');`
  - Log antes do redirect: `console.log('[OAuth] redirecting to /home');`
- No Android: rodar o app com USB, abrir Logcat e filtrar por `OAuth` ou `chamo`. Repetir o fluxo de login e ver em qual log para.

### Opção B — Intent filter sem host (Android)

- Se a URL que realmente chega for `com.chamo.app://?code=...` (sem host "oauth"), o intent filter com `android:host="oauth"` não casa.
- **O que fazer:** Adicionar um segundo `<data>` no mesmo intent filter (ou outro intent filter) só com `android:scheme="com.chamo.app"` (sem host), e/ou garantir que o redirect no Supabase e no app usem a mesma URL (com ou sem host) em todo o fluxo.

### Opção C — Registrar o listener o mais cedo possível

- Garantir que o listener de `appUrlOpen` seja registrado no primeiro frame possível (ex.: no mesmo componente que monta primeiro, ou em um script que roda antes do React). Assim reduz a chance de o evento disparar antes do listener existir.

### Opção D — App Links (HTTPS) no Android

- Em vez de depender de `com.chamo.app://`, usar uma URL HTTPS (ex.: `https://appchamo.com/oauth-callback` ou `/app-login`) e configurar **App Links** (assetlinks.json no servidor + intent filter com `android:autoVerify="true"`) para que o Android abra o **app** com essa URL.
- O app então recebe a URL no WebView (ou via intent) e lê o `code` da query. Não depende do Custom Tabs “passar” um custom scheme para o app.

### Opção E — Google Sign-In nativo (SDK)

- Usar um plugin que faz login com Google via **SDK nativo** (ex.: `@codetrix-studio/capacitor-google-auth` ou similar), sem abrir browser. O SDK devolve o token para o app; aí você envia o token para o Supabase (custom backend ou função que troca id_token por sessão).
- Elimina redirect, Custom Tabs e deep link.

### Opção F — Página de callback mais “agressiva” (Android)

- Na página `/oauth-callback`, além do redirect automático:
  - Redirecionar com um `<meta http-equiv="refresh" content="0;url=com.chamo.app://oauth?code=...">` ou um link clicável bem visível (“Abrir no app”) com `href="com.chamo.app://oauth?code=..."`.
  - Testar se **tocar no link** abre o app. Se abrir, o problema é só o redirect automático (JavaScript) no Custom Tabs.

---

## Checklist rápido

- [ ] No Supabase, as Redirect URLs incluem exatamente as usadas no app (iOS e Android)?
- [ ] No Android, após o login, você vê a página "Redirecionando..." / "Se o app não abriu, toque aqui"? Tocar no link abre o app?
- [ ] No Logcat (Android), ao voltar do login, aparece algo como `handleOnNewIntent` ou o log que você colocar em `handleUrl`?
- [ ] O `redirectTo` no `Login.tsx` (por plataforma) é o mesmo que está no Supabase e no intent filter (Android) / URL scheme (iOS)?

---

## Próximo passo sugerido

1. Adicionar os logs da **Opção A** no `useAuth.tsx`.
2. Rodar o fluxo no Android com o celular conectado e ver no Logcat em qual etapa para (URL chegou? code extraído? exchange ok? redirect chamado?).
3. Com essa resposta, decidir: ajustar intent filter (B), listener mais cedo (C), App Links (D), ou Google nativo (E).
