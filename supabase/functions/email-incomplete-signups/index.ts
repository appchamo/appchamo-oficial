// Envia e-mail "termine seu cadastro" para usuarios que iniciaram a conta
// (ex.: via Google/Apple) mas NAO concluiram o cadastro (signup_completed_at IS NULL).
// Acesso restrito ao admin (JWT).
// Modos:
//   { dry_run: true }                  -> so conta os elegiveis
//   { test_email: "x@y.com" }          -> envio unico de teste (nao marca nada)
//   { user_id: "uuid" }                -> envia para 1 usuario (respeita janela de 24h; force=true ignora)
//   { dry_run: false }                 -> envia para todos os incompletos elegiveis (pula quem recebeu < 24h)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const APP = (Deno.env.get("PUBLIC_APP_URL") || "https://appchamo.com").replace(/[/]+$/, "");
const ADMINS = ["admin@appchamo.com", "suporte@appchamo.com"];
const RESEND_MS = 24 * 60 * 60 * 1000; // 24h

function esc(s: unknown) {
  return String(s ?? "").split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;");
}
function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// ---- cópia em Enviados (IMAP APPEND) ----
function _b64(bytes: Uint8Array): string { let s = ""; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s); }
function _b64w(s: string): string { return _b64(new TextEncoder().encode(s)).replace(/(.{76})/g, "$1\r\n"); }
function _encSubj(s: string): string { return "=?UTF-8?B?" + _b64(new TextEncoder().encode(s)) + "?="; }
async function saveToSent(from: string, to: string, subject: string, html: string) {
  const user = (Deno.env.get("SMTP_USER") || "").trim();
  const pass = (Deno.env.get("SMTP_PASS") || "").trim();
  if (!user || !pass) return;
  const date = new Date().toUTCString().replace("GMT", "+0000");
  const rawMsg = ["From: " + from, "To: " + to, "Subject: " + _encSubj(subject), "Date: " + date, "MIME-Version: 1.0", "Content-Type: text/html; charset=utf-8", "Content-Transfer-Encoding: base64", "", _b64w(html.replace(/\n\s*/g, ""))].join("\r\n");
  const conn = await Deno.connectTls({ hostname: "imap.hostinger.com", port: 993 });
  const enc = new TextEncoder(); const dec = new TextDecoder();
  const read = async () => { const b = new Uint8Array(8192); const n = await conn.read(b); return n ? dec.decode(b.subarray(0, n)) : ""; };
  try {
    await read();
    await conn.write(enc.encode(`a1 LOGIN "${user}" "${pass.replace(/"/g, '\\"')}"\r\n`)); await read();
    const bytes = enc.encode(rawMsg);
    await conn.write(enc.encode(`a2 APPEND "INBOX.Sent" (\\Seen) {${bytes.length}}\r\n`));
    await read();
    await conn.write(bytes); await conn.write(enc.encode("\r\n")); await read();
    await conn.write(enc.encode("a3 LOGOUT\r\n"));
  } finally { try { conn.close(); } catch (_) { /* */ } }
}

function buildHtml(name: string, heading: string, message: string, cta: string, ctaUrl: string) {
  return '<div style="background:#f5f5f5;padding:40px 20px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">'
    + '<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:40px 32px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.06)">'
    + '<p style="margin:0 0 24px;font-size:28px;font-weight:800;color:#ea580c">CHAMÔ</p>'
    + '<h1 style="margin:0 0 12px;font-size:22px;color:#1a1a1a">' + esc(heading) + '</h1>'
    + '<p style="margin:0 0 8px;font-size:14px;color:#525252">Olá, ' + esc(name) + ' 👋</p>'
    + '<p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#525252">' + esc(message) + '</p>'
    + '<a href="' + ctaUrl + '" style="display:inline-block;padding:14px 28px;border-radius:10px;background:#ea580c;color:#fff;font-weight:600;text-decoration:none">' + esc(cta) + '</a>'
    + '<p style="margin:24px 0 0;font-size:12px;color:#999">Você recebeu este aviso porque iniciou um cadastro no Chamô. Se não foi você, ignore este e-mail.</p>'
    + '</div></div>';
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "metodo" }, 405);

  // Auth: somente admin
  const jwt = (req.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
  if (!jwt) return json({ error: "nao_autorizado" }, 401);
  const appClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: { user } } = await appClient.auth.getUser(jwt);
  if (!user || !ADMINS.includes((user.email || "").toLowerCase())) return json({ error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const dryRun = body.dry_run !== false; // por seguranca, default = dry-run
  const testEmail: string | null = body.test_email ? String(body.test_email).trim() : null;
  const targetUserId: string | null = body.user_id ? String(body.user_id) : null;
  const force = body.force === true;
  const subject = String(body.subject || "Termine seu cadastro no Chamo");
  const heading = String(body.heading || "Falta pouco pra começar!");
  const message = String(body.message || "Você iniciou seu cadastro no Chamô mas não finalizou. Conclua em 1 minuto e já encontre profissionais de confiança na sua região.");
  const cta = String(body.cta || "Terminar meu cadastro");
  const ctaUrl = String(body.cta_url || APP);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // SMTP
  const host = Deno.env.get("SMTP_HOST") || "";
  const userS = Deno.env.get("SMTP_USER") || "";
  const pass = Deno.env.get("SMTP_PASS") || "";
  const from = Deno.env.get("SMTP_FROM") || "Chamo <nao-responda@appchamo.com>";
  const port = Number(Deno.env.get("SMTP_PORT") || "587");

  // Envia 1 e-mail e (se stampUserId) marca o controle no perfil.
  async function sendOne(to: string, name: string, stampUserId: string | null, prevCount: number) {
    const html = buildHtml(name, heading, message, cta, ctaUrl);
    const client = new SMTPClient({ connection: { hostname: host, port, tls: port === 465, auth: { username: userS, password: pass } } });
    await client.send({ from, to, subject, html, content: "auto" });
    await client.close();
    try { await saveToSent(from, to, subject, html); } catch (_) { /* cópia não-crítica */ }
    if (stampUserId) {
      try {
        await admin.from("profiles").update({ signup_reminder_sent_at: new Date().toISOString(), signup_reminder_count: prevCount + 1 }).eq("user_id", stampUserId);
      } catch (_) { /* stamp não-crítico */ }
    }
  }

  // ----- Teste: envio unico, sem marcar nada -----
  if (testEmail) {
    if (!host || !userS || !pass) return json({ error: "smtp_not_configured" }, 500);
    try { await sendOne(testEmail, "Teste", null, 0); return json({ ok: true, test: true, to: testEmail }); }
    catch (e) { return json({ ok: false, error: String(e) }, 200); }
  }

  // ----- Envio para 1 usuario (com janela de 24h) -----
  if (targetUserId) {
    const { data: pr } = await admin
      .from("profiles")
      .select("user_id, email, full_name, signup_reminder_sent_at, signup_reminder_count, signup_completed_at")
      .eq("user_id", targetUserId).maybeSingle();
    const p = pr as any;
    if (!p?.email) return json({ ok: false, error: "sem_email" }, 200);
    const lastAt = p.signup_reminder_sent_at ? new Date(p.signup_reminder_sent_at).getTime() : 0;
    if (!force && lastAt && Date.now() - lastAt < RESEND_MS) {
      const nextAt = new Date(lastAt + RESEND_MS).toISOString();
      return json({ ok: false, error: "aguarde_24h", next_at: nextAt }, 200);
    }
    if (!host || !userS || !pass) return json({ error: "smtp_not_configured" }, 500);
    try {
      await sendOne(p.email, (p.full_name || "").split(" ")[0] || "tudo bem?", p.user_id, p.signup_reminder_count || 0);
      return json({ ok: true, to: p.email, sent_at: new Date().toISOString() });
    } catch (e) { return json({ ok: false, error: String(e) }, 200); }
  }

  // ----- Lote: todos os incompletos elegiveis -----
  const { data } = await admin
    .from("profiles")
    .select("user_id, email, full_name, email_notifications_enabled, signup_completed_at, signup_reminder_sent_at, signup_reminder_count")
    .is("signup_completed_at", null)
    .not("email", "is", null);
  const seen = new Set<string>();
  const recipients: { user_id: string; email: string; name: string; count: number }[] = [];
  let skipped24h = 0;
  for (const r of (data || []) as any[]) {
    const em = String(r.email || "").trim().toLowerCase();
    if (!em || seen.has(em)) continue;
    if (r.email_notifications_enabled === false) continue;
    const lastAt = r.signup_reminder_sent_at ? new Date(r.signup_reminder_sent_at).getTime() : 0;
    if (!force && lastAt && Date.now() - lastAt < RESEND_MS) { skipped24h++; continue; }
    seen.add(em);
    recipients.push({ user_id: r.user_id, email: r.email, name: (r.full_name || "").split(" ")[0] || "tudo bem?", count: r.signup_reminder_count || 0 });
  }

  if (dryRun) return json({ ok: true, dry_run: true, count: recipients.length, skipped_24h: skipped24h });

  if (!host || !userS || !pass) return json({ error: "smtp_not_configured" }, 500);

  let sent = 0, failed = 0;
  for (const r of recipients) {
    try { await sendOne(r.email, r.name, r.user_id, r.count); sent++; }
    catch (_e) { failed++; }
    await new Promise((res) => setTimeout(res, 250));
  }
  return json({ ok: true, dry_run: false, total: recipients.length, sent, failed, skipped_24h: skipped24h });
});
