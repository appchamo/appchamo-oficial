# Como subir as alterações para a Play Store (Android)

Passo a passo para gerar o build do app Chamô e publicar na Google Play Store.

---

## Pré-requisitos

- **Conta no Google Play Console** (paga uma vez, ~US$ 25)
- App **Chamô** já criado no [Play Console](https://play.google.com/console) (se não existir, crie em “Todos os apps” → “Criar app”)
- **Java JDK 17** instalado (o Android Gradle usa)
- **Keystore** de release (arquivo `.jks` ou `.keystore`) – se for o primeiro envio, você cria; se já enviou antes, use o mesmo para não quebrar atualizações

---

## 1. Build da web e sync no Android

No terminal, na pasta do projeto:

```bash
npm run build:android
```

Isso roda `vite build` e em seguida `npx cap sync android`, copiando o build para o projeto Android.

---

## 2. Aumentar versão (obrigatório a cada envio)

Abra **android/app/build.gradle** e ajuste:

- **versionCode** – número inteiro que **precisa ser maior** a cada upload na Play Store (ex.: estava `4`, coloque `5`).
- **versionName** – string que o usuário vê (ex.: `"1.3"` → `"1.4"`). Pode seguir o padrão que você usa no iOS.

Exemplo:

```gradle
defaultConfig {
    applicationId "com.chamo.app"
    ...
    versionCode 5        // aumente a cada envio
    versionName "1.4"     // versão visível (opcional mudar)
    ...
}
```

Se enviar com um `versionCode` igual ou menor que o já publicado, a Play Store rejeita.

---

## 3. Gerar o AAB (Android App Bundle)

A Play Store exige o formato **AAB** (não mais APK para novos envios). No terminal:

```bash
cd android
./gradlew bundleRelease
```

O arquivo gerado fica em:

**android/app/build/outputs/bundle/release/app-release.aab**

Se der erro de assinatura (signing), vá para o passo 4 e configure o keystore; depois repita este passo.

---

## 4. Assinatura (Release)

Para **release**, o AAB precisa ser assinado com sua keystore.

### Se você ainda não tem keystore (primeiro envio)

Crie um:

```bash
keytool -genkey -v -keystore chamo-release.keystore -alias chamo -keyalg RSA -keysize 2048 -validity 10000
```

Guarde o arquivo **chamo-release.keystore** e a **senha** em local seguro. Quem perder não consegue atualizar o app na Play Store.

### Configurar o Gradle para usar o keystore

O **android/app/build.gradle** já está preparado para usar um keystore de release. Basta criar o arquivo **android/keystore.properties** (não commite no Git; adicione `android/keystore.properties` ao `.gitignore`):

```properties
storePassword=SUA_SENHA_DO_KEYSTORE
keyPassword=SUA_SENHA_DA_KEY
keyAlias=chamo
storeFile=../chamo-release.keystore
```

- Ajuste `storeFile` para o caminho real do seu `.keystore` em relação à pasta **android** (ex.: se o keystore está na raiz do projeto: `../chamo-release.keystore`).
- Se o **keystore.properties** não existir, o `bundleRelease` ainda roda, mas o AAB pode não ser aceito na Play Store (é preciso assinar com sua chave de release).

Depois rode de novo:

```bash
cd android
./gradlew bundleRelease
```

---

## 5. Enviar para a Play Console

1. Acesse [Google Play Console](https://play.google.com/console) e abra o app **Chamô**.
2. No menu lateral: **Produção** (ou **Testes** → Teste interno / fechado / aberto, se quiser testar antes).
3. Clique em **Criar nova versão** (ou “Criar nova release”).
4. Em **App bundles**, faça upload do arquivo **app-release.aab** (em `android/app/build/outputs/bundle/release/`).
5. Preencha **Nome da versão** e **Notas da versão** (o que mudou nesta versão).
6. Revise e clique em **Revisar versão** → **Iniciar implantação para Produção** (ou para o tipo de teste escolhido).

A Google pode levar algumas horas para processar. Depois da análise, o app fica disponível (ou na faixa de teste que você escolheu).

---

## Resumo rápido (já com keystore configurado)

```bash
# 1. Build e sync
npm run build:android

# 2. Aumentar versionCode (e se quiser versionName) em android/app/build.gradle

# 3. Gerar AAB assinado
cd android && ./gradlew bundleRelease

# 4. Upload em Play Console do arquivo:
#    android/app/build/outputs/bundle/release/app-release.aab
```

---

## Observações

- **google-services.json**: se o app usa Firebase (ex.: push), o arquivo `android/app/google-services.json` precisa estar no projeto. Sem ele, o build pode rodar, mas notificações podem falhar.
- **Testes**: use “Teste interno” ou “Teste fechado” para validar antes de mandar para produção.
- **Primeira publicação**: além do AAB, a Play Store pede ficha do app, política de privacidade, classificação etária, etc. Siga o checklist da própria release.
