// Notifica TODOS os admins (sócios) nos 3 canais: app, e-mail e WhatsApp oficial.
// Disparado server-side pelos eventos (cadastro, chamada, pagamento, assinatura),
// protegido por x-hook-secret (EMAIL_HOOK_SECRET).
//
// Body: { event, title, message, link?, wa_params?: string[] }
//   event   -> "cadastro" | "chamada" | "pagamento" | "assinatura" (rótulo livre)
//   wa_params-> override dos parâmetros do template; default = [title, message]
//
// Lê destinatários de public.admin_notify_recipients (active=true).
// WhatsApp usa o template "alerta_admin" via função send-whatsapp.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const APP = (Deno.env.get("PUBLIC_APP_URL") || "https://appchamo.com").replace(/[/]+$/, "");
const PROJECT_URL = Deno.env.get("SUPABASE_URL")!;
const HOOK = (Deno.env.get("EMAIL_HOOK_SECRET") || "").trim();

function esc(s: unknown) {
  return String(s ?? "").split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;");
}

async function sendEmail(to: string, subject: string, title: string, message: string, link: string) {
  const host = Deno.env.get("SMTP_HOST") || "";
  const user = Deno.env.get("SMTP_USER") || "";
  const pass = Deno.env.get("SMTP_PASS") || "";
  const from = Deno.env.get("SMTP_FROM") || "Chamo <nao-responda@appchamo.com>";
  const port = Number(Deno.env.get("SMTP_PORT") || "587");
  if (!host || !user || !pass) return { ok: false, skip: "smtp_not_configured" };
  const cta = APP + (link && link.charAt(0) === "/" ? link : "/admin");
  const html = '<div style="background:#f5f5f5;padding:40px 20px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">'
    + '<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:36px 32px;box-shadow:0 2px 8px rgba(0,0,0,.06)">'
    + '<p style="margin:0 0 20px;font-size:24px;font-weight:800;color:#ea580c">CHAMÔ · ADMIN</p>'
    + '<h1 style="margin:0 0 12px;font-size:20px;color:#1a1a1a">' + esc(title) + '</h1>'
    + '<p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#525252">' + esc(message) + '</p>'
    + '<a href="' + cta + '" style="display:inline-block;padding:12px 24px;border-radius:10px;background:#ea580c;color:#fff;font-weight:600;text-decoration:none">Abrir painel</a>'
    + '<p style="margin:24px 0 0;font-size:12px;color:#999">Alerta interno da administração do Chamô.</p>'
    + '</div></div>';
  const client = new SMTPClient({ connection: { hostname: host, port, tls: port === 465, auth: { username: user, password: pass } } });
  try {
    await client.send({ from, to, subject, html, content: "auto" });
    await client.close();
    return { ok: true };
  } catch (e) {
    try { await client.close(); } catch (_) { /* */ }
    return { ok: false, error: String(e) };
  }
}

async function sendWhatsapp(to: string, params: string[]) {
  try {
    const r = await fetch(`${PROJECT_URL}/functions/v1/send-whatsapp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hook-secret": HOOK },
      body: JSON.stringify({ to, template: "alerta_admin", lang: "pt_BR", params }),
    });
    return await r.json().catch(() => ({}));
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

Deno.serve(async (req) => {
  try {
    if ((req.headers.get("x-hook-secret") || "").trim() !== HOOK || !HOOK) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const event = String(body.event || "evento");
    const title = String(body.title || "Novo evento no Chamô");
    const message = String(body.message || "");
    const link = String(body.link || "/admin");
    const waParams: string[] = Array.isArray(body.wa_params) && body.wa_params.length
      ? body.wa_params.map((x: unknown) => String(x))
      : [title, message || title];

    const admin = createClient(PROJECT_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // destinatários ativos
    const { data: recipients } = await admin
      .from("admin_notify_recipients")
      .select("name, phone, email, user_id, notify_inapp, notify_email, notify_whatsapp, active")
      .eq("active", true);
    const list = (recipients || []) as any[];

    // user_id do admin principal (NÃO recebe in-app aqui: ele já tem a notificação
    // original que dispara o fanout; reinserir geraria loop). Usado só p/ excluir.
    const { data: adminRow } = await admin.from("profiles").select("user_id").eq("email", "admin@appchamo.com").maybeSingle();
    const adminId = adminRow?.user_id ?? null;

    // ---- IN-APP (só destinatários, dedup por user_id, excluindo o admin principal) ----
    const inappIds = new Set<string>();
    for (const r of list) if (r.notify_inapp && r.user_id && r.user_id !== adminId) inappIds.add(r.user_id);
    if (inappIds.size) {
      const rows = Array.from(inappIds).map((uid) => ({
        user_id: uid, title, message, type: "admin", link, read: false,
      }));
      await admin.from("notifications").insert(rows);
    }

    // ---- E-MAIL + WHATSAPP ----
    const subject = `Chamô · ${title}`;
    const results: any[] = [];
    for (const r of list) {
      if (r.notify_email && r.email) {
        results.push({ ch: "email", to: r.email, r: await sendEmail(r.email, subject, title, message, link) });
      }
      if (r.notify_whatsapp && r.phone) {
        results.push({ ch: "whatsapp", to: r.phone, r: await sendWhatsapp(r.phone, waParams) });
      }
    }

    console.log("notify-admins:", event, "inapp:", inappIds.size, "fanout:", results.length);
    return new Response(JSON.stringify({ ok: true, event, inapp: inappIds.size, results }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("notify-admins erro:", e?.message);
    return new Response(JSON.stringify({ ok: false, error: e?.message }), { status: 200 });
  }
});
