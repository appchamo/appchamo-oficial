// Briefing diário do negócio (email para o admin) com os números das últimas 24h.
// Chamado por pg_cron (x-hook-secret).
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

// Destinatários do briefing (ajuste aqui se quiser).
const RECIPIENTS = ["chamotecnologia@gmail.com", "admin@appchamo.com"];
const PAID_PLANS = ["vip", "pro", "business"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "metodo" }, 405);

  const hookSecret = (Deno.env.get("EMAIL_HOOK_SECRET") || "").trim();
  const got = (req.headers.get("x-hook-secret") || "").trim();
  if (!hookSecret || got !== hookSecret) return json({ error: "unauthorized" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const cutoff = new Date(Date.now() - 86400000).toISOString();

  const countFrom = async (table: string, fn: (q: any) => any) => {
    try {
      let q = admin.from(table).select("*", { count: "exact", head: true });
      q = fn(q);
      const { count } = await q;
      return count ?? 0;
    } catch { return 0; }
  };

  const [
    novosTotal, novosCliente, novosPro, novosEmpresa,
    incompletos, ativos24h, chamadas24h, reviews24h,
    pagantesReais, cortesias, novasPagas24h,
  ] = await Promise.all([
    countFrom("profiles", (q) => q.gte("created_at", cutoff)),
    countFrom("profiles", (q) => q.gte("created_at", cutoff).eq("user_type", "client")),
    countFrom("profiles", (q) => q.gte("created_at", cutoff).eq("user_type", "professional")),
    countFrom("profiles", (q) => q.gte("created_at", cutoff).eq("user_type", "company")),
    countFrom("profiles", (q) => q.is("signup_completed_at", null)),
    countFrom("profiles", (q) => q.gte("last_seen_at", cutoff)),
    countFrom("service_requests", (q) => q.gte("created_at", cutoff)),
    countFrom("reviews", (q) => q.gte("created_at", cutoff)),
    // Pagantes de verdade: plano pago, ativo e SEM cortesia
    countFrom("subscriptions", (q) => q.ilike("status", "active").in("plan_id", PAID_PLANS).or("courtesy.is.null,courtesy.eq.false")),
    // Cortesias: plano pago liberado grátis pelo admin (não é receita)
    countFrom("subscriptions", (q) => q.ilike("status", "active").in("plan_id", PAID_PLANS).eq("courtesy", true)),
    countFrom("subscriptions", (q) => q.ilike("status", "active").in("plan_id", PAID_PLANS).or("courtesy.is.null,courtesy.eq.false").gte("updated_at", cutoff)),
  ]);

  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const row = (emoji: string, label: string, value: string) =>
    `<tr><td style="padding:10px 8px;border-bottom:1px solid #eee;font-size:14px;color:#333">${emoji} ${label}</td>`
    + `<td style="padding:10px 8px;border-bottom:1px solid #eee;font-size:16px;font-weight:700;color:#111;text-align:right">${value}</td></tr>`;

  const html = '<div style="background:#f5f5f5;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">'
    + '<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:28px 24px;box-shadow:0 2px 8px rgba(0,0,0,.06)">'
    + '<p style="margin:0;font-size:22px;font-weight:800;color:#ea580c">CHAMÔ</p>'
    + `<p style="margin:2px 0 18px;font-size:13px;color:#888">Resumo do negócio · últimas 24h · ${hoje}</p>`
    + '<table style="width:100%;border-collapse:collapse">'
    + row("🆕", `Novos cadastros`, `${novosTotal} <span style="font-size:11px;color:#888;font-weight:400">(${novosCliente} cli · ${novosPro} prof · ${novosEmpresa} emp)</span>`)
    + row("👀", "Usuários ativos (abriram o app)", String(ativos24h))
    + row("📞", "Chamadas/serviços abertos", String(chamadas24h))
    + row("⭐", "Novas avaliações", String(reviews24h))
    + row("💳", "Pagantes reais (receita)", String(pagantesReais))
    + row("🎁", "Cortesias (grátis, sem receita)", String(cortesias))
    + row("💰", "Novos pagantes reais (24h)", String(novasPagas24h))
    + row("⏳", "Cadastros incompletos (pendentes)", String(incompletos))
    + '</table>'
    + '<p style="margin:18px 0 0;font-size:11px;color:#aaa">Enviado automaticamente pelo Chamô. Números aproximados para acompanhamento diário.</p>'
    + '</div></div>';

  // Envia
  const host = Deno.env.get("SMTP_HOST") || "";
  const userS = Deno.env.get("SMTP_USER") || "";
  const pass = Deno.env.get("SMTP_PASS") || "";
  const from = Deno.env.get("SMTP_FROM") || "Chamo <nao-responda@appchamo.com>";
  const port = Number(Deno.env.get("SMTP_PORT") || "587");
  if (!host || !userS || !pass) return json({ error: "smtp_not_configured" }, 500);

  let sent = 0;
  for (const to of RECIPIENTS) {
    try {
      const client = new SMTPClient({ connection: { hostname: host, port, tls: port === 465, auth: { username: userS, password: pass } } });
      await client.send({ from, to, subject: `Chamô — Resumo diário (${hoje})`, html, content: "auto" });
      await client.close();
      sent++;
    } catch (_e) { /* continua */ }
  }

  return json({ ok: true, sent, metrics: { novosTotal, ativos24h, chamadas24h, reviews24h, pagantesReais, cortesias, novasPagas24h, incompletos } });
});
