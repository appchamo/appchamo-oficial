# Resposta sugerida para a Apple (Resolution Center)

Cole a mensagem abaixo em **App Store Connect** → sua app → **Resolution Center** → **Reply** à rejeição 2.1(b).

---

**Where to find In-App Purchase products (Chamô Business, Chamô Pro, Chamô VIP)**

The subscription plans are only shown to users who are registered as **professionals or companies**. If the reviewer signed in with an account that was registered as a **client**, the app shows the message: “Os planos são exclusivos para profissionais e empresas” (The plans are exclusive for professionals and companies) and the plan list is not displayed — so the IAP products cannot be seen or tested.

**To test the In-App Purchases, please:**

1. **Use the test account we provided** in the App Review Information:  
   **Email:** testes@appchamo.com  
   **Password:** [the password you set for this account]

2. **Ensure this account is used as a professional.** We have configured this test account as a **professional** user. When you log in with it and go to **Profile (Perfil)** → **Planos** (Plans), you should see the full list of plans (Free, Chamô Pro, Chamô VIP, Chamô Business) and the **“Assinar com Apple”** (Subscribe with Apple) option for paid plans.

3. **Path in the app:**  
   Bottom tab **Perfil** (Profile) → **Planos** (Plans) → select a paid plan → **Assinar com Apple**.

If you created a new account during review (e.g. with Sign in with Apple) and chose “client” during signup, that account will only see the message that plans are for professionals and companies. Please use the provided test account (testes@appchamo.com) to access the subscription screen and verify the IAP implementation.

We have also added clear instructions in the **Notes for the Reviewer** for our next submission so that reviewers use the professional test account to locate the In-App Purchases.

Thank you for your feedback.

---

**Antes de enviar:** substitua `[the password you set for this account]` pela senha real da conta testes@appchamo.com que você informou nas “Notas para o revisor”, ou apague essa linha e deixe apenas “Use the credentials provided in App Review Information”.
