import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const APP = (Deno.env.get("PUBLIC_APP_URL") || "https://appchamo.com").replace(/[/]+$/, "");

function esc(s) {
  return String(s || "").split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;");
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("no", { status: 405 });
  const secret = (req.headers.get("x-hook-secret") || "").trim();
  if (!secret || secret !== (Deno.env.get("EMAIL_HOOK_SECRET") || "")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }
  let body;
  try { body = await req.json(); } catch { return new Response("bad", { status: 400 }); }
  if (!body.user_id) return new Response("no user", { status: 400 });

  const admin = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  const { data: p } = await admin.from("profiles")
    .select("full_name, email, email_notifications_enabled")
    .eq("user_id", body.user_id).maybeSingle();
  if (!p || !p.email) return new Response(JSON.stringify({ ok: true, skipped: "no_email" }));
  if (p.email_notifications_enabled === false) return new Response(JSON.stringify({ ok: true, skipped: "off" }));

  const direct = body.type === "service_request";
  const subject = direct ? "Voce recebeu uma nova chamada no Chamo" : "Novo servico disponivel na sua regiao";
  const title = esc(body.title || (direct ? "Nova chamada" : "Novo servico disponivel"));
  const msg = esc(body.message || "Um cliente esta procurando seu servico. Abra o app para responder rapido.");
  const path = (body.link && String(body.link).charAt(0) === "/") ? body.link : "/home";
  const cta = APP + path;
  const name = esc((p.full_name || "Profissional").trim());

  const html = '<div style="background:#f5f5f5;padding:40px 20px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">'
    + '<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:40px 32px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.06)">'
    + '<p style="margin:0 0 24px;font-size:28px;font-weight:800;color:#ea580c">CHAMO</p>'
    + '<h1 style="margin:0 0 12px;font-size:22px;color:#1a1a1a">' + title + '</h1>'
    + '<p style="margin:0 0 8px;font-size:14px;color:#525252">Ola, ' + name + ' 👋</p>'
    + '<p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#525252">' + msg + '</p>'
    + '<a href="' + cta + '" style="display:inline-block;padding:14px 28px;border-radius:10px;background:#ea580c;color:#fff;font-weight:600;text-decoration:none">Abrir no Chamo</a>'
    + '<p style="margin:24px 0 0;font-size:12px;color:#999">Voce recebeu este aviso porque tem uma conta de profissional no Chamo.</p>'
    + '</div></div>';

  const port = Number(Deno.env.get("SMTP_PORT") || "587");
  const host = Deno.env.get("SMTP_HOST") || "";
  const username = Deno.env.get("SMTP_USER") || "";
  const password = Deno.env.get("SMTP_PASS") || "";
  const from = Deno.env.get("SMTP_FROM") || "Chamo <nao-responda@appchamo.com>";
  if (!host || !username || !password) return new Response(JSON.stringify({ error: "smtp_not_configured" }), { status: 500 });

  const client = new SMTPClient({ connection: { hostname: host, port, tls: port === 465, auth: { username, password } } });
  try {
    await client.send({ from, to: p.email, subject, html, content: "auto" });
    await client.close();
  } catch (e) {
    try { await client.close(); } catch (_) { /* */ }
    return new Response(JSON.stringify({ error: "smtp_failed", detail: String(e) }), { status: 502 });
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
});
