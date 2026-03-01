# Como subir a versão para o TestFlight (iOS)

Passo a passo para gerar o build do app Chamô e enviar para o TestFlight.

---

## Pré-requisitos

- **Apple Developer Program** (conta paga) ativa
- App **Chamô** já criado no [App Store Connect](https://appstoreconnect.apple.com) (se não existir, crie em “Meus apps” → “+”)
- Xcode instalado no Mac
- Certificados e provisioning profiles configurados (Xcode costuma resolver ao fazer o primeiro Archive)

---

## 1. Build da web e sync no iOS

No terminal, na pasta do projeto:

```bash
# Build de produção do app web (Vite)
npm run build

# Copia o build para o projeto iOS e atualiza dependências
npx cap sync ios
```

---

## 2. Abrir o projeto no Xcode

```bash
npx cap open ios
```

Ou abra manualmente: **ios/App/App.xcworkspace** (use o `.xcworkspace`, não o `.xcodeproj`).

---

## 3. Versão e build number (importante para cada envio)

No Xcode:

1. Clique no projeto **App** no painel esquerdo.
2. Selecione o target **App**.
3. Aba **General**:
   - **Version** (ex.: `1.0.0`) – versão que o usuário vê. Só precisa mudar quando fizer nova release.
   - **Build** (ex.: `1`, `2`, `3`…) – **tem que ser maior a cada envio ao TestFlight**. Ex.: na primeira vez `1`, na próxima `2`, depois `3`.

Se não aumentar o **Build**, o TestFlight rejeita o upload.

---

## 4. Assinatura (Signing & Capabilities)

1. No mesmo target **App**, aba **Signing & Capabilities**.
2. Marque **Automatically manage signing**.
3. **Team:** selecione sua conta Apple Developer.
4. **Bundle Identifier:** deve ser `com.chamo.app` (ou o que estiver no App Store Connect).

Se aparecer erro de provisioning profile, use “Fix Issue” ou crie um perfil em [developer.apple.com](https://developer.apple.com) → Certificates, Identifiers & Profiles.

---

## 5. Fazer o Archive

1. No topo do Xcode, no seletor de destino, escolha **Any iOS Device (arm64)** (não um simulador).
2. Menu **Product** → **Archive**.
3. Aguarde o build terminar. O **Organizer** (janela de arquivos) abre com o archive listado.

---

## 6. Enviar para o App Store Connect

1. No Organizer, selecione o archive que você acabou de criar.
2. Clique em **Distribute App**.
3. Escolha **App Store Connect** → **Next**.
4. **Upload** → **Next**.
5. Deixe as opções padrão (Upload your app’s symbols, Manage Version and Build Number…) → **Next**.
6. Confirme o certificado/distribution e clique em **Upload**.
7. Aguarde o upload terminar.

---

## 7. TestFlight no App Store Connect

1. Acesse [App Store Connect](https://appstoreconnect.apple.com) → **Meus apps** → app **Chamô**.
2. Aba **TestFlight**.
3. Em alguns minutos (até ~30 min), o novo build aparece em **Builds** (iOS).
4. Na primeira vez, preencha as perguntas de **export compliance** e **content rights** se aparecerem.
5. Quando o status do build estiver “Ready to Test”, adicione testadores:
   - **Testadores internos:** usuários do seu time (até 100).
   - **Testadores externos:** grupo de teste; precisa de um “Teste Beta do App” aprovado (primeira vez leva revisão da Apple, ~24–48 h).

Testadores externos recebem o convite por e-mail e instalam pelo app **TestFlight** na App Store.

---

## Resumo rápido (comandos)

```bash
npm run build
npx cap sync ios
npx cap open ios
```

Depois no Xcode: **Any iOS Device** → **Product** → **Archive** → **Distribute App** → **App Store Connect** → **Upload**. Em seguida, em App Store Connect → **TestFlight** para gerenciar o build e os testadores.
