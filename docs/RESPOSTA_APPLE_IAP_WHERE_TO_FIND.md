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

**If you signed in with Apple as a new user:** that account is created as a **client**, so the Planos screen shows “Os planos são exclusivos para profissionais e empresas.” On that same screen we now show a **“Tornar-se profissional”** (Become a professional) button. Tapping it takes the reviewer through a short flow (CPF if needed, then documents and profile). After completing it, they become a professional and can access **Perfil → Planos** with the full list and **Assinar com Apple**. Alternatively, please use the provided test account (testes@appchamo.com), which is already set up as a professional.

We have also added clear instructions in the **Notes for the Reviewer** for this submission.

Thank you for your feedback.

---

**Antes de enviar:** substitua `[the password you set for this account]` pela senha real da conta testes@appchamo.com que você informou nas “Notas para o revisor”, ou apague essa linha e deixe apenas “Use the credentials provided in App Review Information”.

---

## Notas para o revisor (nova submissão)

Ao enviar o novo build, use o texto em inglês do arquivo **docs/NOTAS_REVISOR_APPLE_ENVIO.txt** (copie e cole em **App Review Information** → **Notes**). Resumo do que está no texto:

**English (sugestão):**

In-App Purchases (Chamô Pro, Chamô VIP, Chamô Business) are available only to **professional** or **company** accounts.

- **Option 1:** Log in with the test account provided below (already set as professional). Go to **Profile (Perfil)** → **Planos** → choose a paid plan → **Assinar com Apple**.
- **Option 2:** If you use Sign in with Apple and land as a client, open **Profile** → **Planos**. On the message “Os planos são exclusivos para profissionais e empresas” tap **Tornar-se profissional**, complete the short flow (CPF if requested, then documents), then access Planos again to see the plans and test IAP.

Thank you.
