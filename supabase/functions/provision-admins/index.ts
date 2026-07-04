/**
 * Provisiona os 5 admins sócios (uma vez). Protegido por x-hook-secret.
 * Cria o usuário (se não existir), confirma email, define senha e concede os papéis de admin.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const EMAILS = [
  "rafael@appchamo.com",
  "breno@appchamo.com",
  "bruno@appchamo.com",
  "jovino@appchamo.com",
  "felipe@appchamo.com",
];
const ROLES = ["super_admin", "finance_admin", "support_admin", "sponsor_admin", "moderator"];
const PASSWORD = "admin123";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const hookSecret = (Deno.env.get("EMAIL_HOOK_SECRET") || "").trim();
  if (!hookSecret || (req.headers.get("x-hook-secret") || "").trim() !== hookSecret) return json({ error: "unauthorized" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const out: any[] = [];

  for (const emailRaw of EMAILS) {
    const email = emailRaw.trim().toLowerCase();
    const nome = email.split("@")[0];
    let userId: string | null = null;
    let status = "";

    // Cria (ou detecta que já existe)
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: nome, is_admin: true },
    });
    if (created?.user) { userId = created.user.id; status = "criado"; }
    else {
      // Já existe: procura o id e reseta a senha
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const u = list?.users?.find((x) => (x.email || "").toLowerCase() === email);
      if (u) {
        userId = u.id;
        await admin.auth.admin.updateUserById(u.id, { password: PASSWORD, email_confirm: true });
        status = "atualizado";
      } else {
        out.push({ email, status: "erro", detail: cErr?.message || "nao criou nem achou" });
        continue;
      }
    }

    // Garante perfil com nome
    try { await admin.from("profiles").update({ full_name: nome }).eq("user_id", userId); } catch (_e) { /* ignora */ }

    // Concede os papéis de admin (ignora duplicados)
    let rolesOk = 0;
    for (const role of ROLES) {
      const { error: rErr } = await admin.from("user_roles").insert({ user_id: userId, role });
      if (!rErr) rolesOk++;
    }

    out.push({ email, status, user_id: userId, roles_inseridos: rolesOk });
  }

  return json({ ok: true, result: out });
});
