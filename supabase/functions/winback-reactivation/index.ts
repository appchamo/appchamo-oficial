// Win-back: reativa usuários inativos há 7+ dias (push + e-mail).
// Chamado por pg_cron (x-hook-secret). Processa em lotes pra não estourar o tempo.
// Só reenvia se a pessoa voltou depois do último win-back (last_seen_at > winback_sent_at).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
function esc(s: unknown) {
  return String(s ?? "").split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;");
}

const INACTIVE_DAYS = 7;
const BATCH = 60; // por execução (evita timeout no envio de e-mails)
const STAFF = ["admin@appchamo.com", "suporte@appchamo.com"];

const PUSH_TITLE = "Sentimos sua falta 👋";
const PUSH_MSG = "Aquele serviço que ficou pra depois? Tem gente boa pertinho pra resolver rapidinho.";
const PUSH_LINK = "/home";

function emailHtml(name: string, appUrl: string) {
  return '<div style="background:#f5f5f5;padding:40px 20px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">'
    + '<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:40px 32px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.06)">'
    + '<p style="margin:0 0 24px;font-size:28px;font-weight:800;color:#ea580c">CHAMÔ</p>'
    + '<h1 style="margin:0 0 12px;font-size:22px;color:#1a1a1a">Sentimos sua falta 👋</h1>'
    + '<p style="margin:0 0 8px;font-size:14px;color:#525252">Olá, ' + esc(name) + '</p>'
    + '<p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#525252">Faz um tempo que você não aparece por aqui. Aquele reparo, aquela limpeza ou montagem que ficou pra depois? Tem gente boa pertinho pra resolver rapidinho. Dá uma passada quando puder.</p>'
    + '<a href="' + appUrl + '" style="display:inline-block;padding:14px 28px;border-radius:10px;background:#ea580c;color:#fff;font-weight:600;text-decoration:none">Abrir o Chamô</a>'
    + '<p style="margin:24px 0 0;font-size:12px;color:#999">Você recebeu este e-mail porque tem uma conta no Chamô.</p>'
    + '</div></div>';
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "metodo" }, 405);

  const hookSecret = (Deno.env.get("EMAIL_HOOK_SECRET") || "").trim();
  const got = (req.headers.get("x-hook-secret") || "").trim();
  if (!hookSecret || got !== hookSecret) return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const dryRun = body.dry_run === true;

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const APP = (Deno.env.get("PUBLIC_APP_URL") || "https://appchamo.com").replace(/[/]+$/, "");
  const cutoff = new Date(Date.now() - INACTIVE_DAYS * 86400000).toISOString();

  // Inativos elegíveis (ordena pelos mais antigos primeiro).
  const { data, error } = await admin
    .from("profiles")
    .select("user_id, email, full_name, email_notifications_enabled, last_seen_at, winback_sent_at")
    .not("signup_completed_at", "is", null)
    .not("last_seen_at", "is", null)
    .lt("last_seen_at", cutoff)
    .eq("is_blocked", false)
    .order("last_seen_at", { ascending: true })
    .limit(500);
  if (error) return json({ ok: false, error: error.message }, 500);

  const elegiveis = (data ?? []).filter((p: any) => {
    if (STAFF.includes(String(p.email || "").toLowerCase())) return false;
    // só reenvia se a pessoa voltou depois do último win-back
    if (p.winback_sent_at && new Date(p.last_seen_at) <= new Date(p.winback_sent_at)) return false;
    return true;
  });
  const lote = elegiveis.slice(0, BATCH);

  if (dryRun) return json({ ok: true, dry_run: true, elegiveis_total: elegiveis.length, lote: lote.length });
  if (lote.length === 0) return json({ ok: true, push: 0, email: 0, restantes: 0 });

  // 1) Push (insere notificações — dispara FCM via trigger). Sem batch_id (tem FK).
  const rows = lote.map((p: any) => ({
    user_id: p.user_id, title: PUSH_TITLE, message: PUSH_MSG, type: "info", link: PUSH_LINK,
    metadata: { source: "winback" }, read: false,
  }));
  let pushCount = 0;
  const { error: insErr } = await admin.from("notifications").insert(rows);
  if (!insErr) pushCount = rows.length; else console.error("winback push insert:", insErr.message);

  // 2) Marca winback_sent_at pra todos do lote (não repete).
  const uids = lote.map((p: any) => p.user_id);
  await admin.from("profiles").update({ winback_sent_at: new Date().toISOString() }).in("user_id", uids);

  // 3) E-mail (para quem tem e-mail e não desativou).
  const host = Deno.env.get("SMTP_HOST") || "";
  const userS = Deno.env.get("SMTP_USER") || "";
  const pass = Deno.env.get("SMTP_PASS") || "";
  const from = Deno.env.get("SMTP_FROM") || "Chamo <nao-responda@appchamo.com>";
  const port = Number(Deno.env.get("SMTP_PORT") || "587");
  let emailCount = 0;
  if (host && userS && pass) {
    for (const p of lote as any[]) {
      const to = String(p.email || "").trim();
      if (!to || p.email_notifications_enabled === false) continue;
      try {
        const client = new SMTPClient({ connection: { hostname: host, port, tls: port === 465, auth: { username: userS, password: pass } } });
        await client.send({
          from, to, subject: "Sentimos sua falta no Chamô 👋",
          html: emailHtml((p.full_name || "").split(" ")[0] || "tudo bem?", APP), content: "auto",
        });
        await client.close();
        emailCount++;
      } catch (_e) { /* e-mail não bloqueia */ }
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return json({ ok: true, push: pushCount, email: emailCount, lote: lote.length, restantes: Math.max(0, elegiveis.length - lote.length) });
});
