// Avisa o CLIENTE quando o sistema abre um pedido automatico (escalacao) porque o
// profissional chamado nao respondeu. Envia email + WhatsApp (template pedido_aberto_cliente).
// A notificacao in-app ja e criada pela request-reminders. Chamada com x-hook-secret.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const GRAPH = "v21.0";
const APP = (Deno.env.get("PUBLIC_APP_URL") || "https://appchamo.com").replace(/\/+$/, "");

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
}
function esc(s: unknown) {
  return String(s || "").split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;");
}
function toMsisdn(raw: unknown): string | null {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) return d;
  if (d.length === 12 && d.startsWith("55")) return d;
  if (d.length === 11 || d.length === 10) return "55" + d;
  return null;
}

Deno.serve(async (req) => {
  const hookSecret = (Deno.env.get("EMAIL_HOOK_SECRET") || "").trim();
  if (!hookSecret || (req.headers.get("x-hook-secret") || "").trim() !== hookSecret) return json({ error: "unauthorized" }, 401);

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const clientUserId = String((body as { clientUserId?: string }).clientUserId || "").trim();
    const calledProName = String((body as { calledProName?: string }).calledProName || "").trim() || "o profissional que voce chamou";
    if (!clientUserId) return json({ error: "missing clientUserId" }, 400);

    const { data: cli } = await admin.from("profiles")
      .select("full_name, email, phone, whatsapp_notifications_enabled, email_notifications_enabled")
      .eq("user_id", clientUserId).maybeSingle();
    const c = cli as { full_name?: string; email?: string; phone?: string; whatsapp_notifications_enabled?: boolean; email_notifications_enabled?: boolean } | null;
    if (!c) return json({ ok: true, skipped: "no_client" });

    const clientFirst = String(c.full_name || "").trim().split(" ")[0] || "tudo bem";

    // -- EMAIL --
    let emailSent = false;
    if (c.email && c.email_notifications_enabled !== false) {
      const host = Deno.env.get("SMTP_HOST") || "";
      const username = Deno.env.get("SMTP_USER") || "";
      const password = Deno.env.get("SMTP_PASS") || "";
      const port = Number(Deno.env.get("SMTP_PORT") || "587");
      const from = Deno.env.get("SMTP_FROM") || "Chamo <nao-responda@appchamo.com>";
      if (host && username && password) {
        const html = '<div style="background:#f5f5f5;padding:40px 20px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">'
          + '<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,.06)">'
          + '<h1 style="margin:0 0 16px;font-size:18px;color:#ea580c">Chamamos outros profissionais pra voce 👍</h1>'
          + `<p style="margin:0 0 8px;font-size:14px;color:#333;line-height:1.5">Como voce nao teve resposta de <strong>${esc(calledProName)}</strong>, abrimos um pedido para outros profissionais dessa mesma area te chamarem.</p>`
          + '<p style="margin:0 0 8px;font-size:14px;color:#333;line-height:1.5">Fica de olho no app que logo aparece alguem. Se ja resolveu, e so apagar o pedido.</p>'
          + `<a href="${APP}/client/pedidos-abertos" style="display:inline-block;margin-top:16px;background:#ea580c;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700;font-size:14px">Ver meu pedido</a>`
          + '</div></div>';
        const client = new SMTPClient({ connection: { hostname: host, port, tls: port === 465, auth: { username, password } } });
        try {
          await client.send({ from, to: c.email, subject: "Abrimos um pedido pra voce — Chamô", html, content: "auto" });
          emailSent = true;
        } catch (_e) { /* email nao-critico */ }
        finally { try { await client.close(); } catch (_e) { /* */ } }
      }
    }

    // -- WHATSAPP (template pedido_aberto_cliente: 2 params -> nome do cliente, nome do profissional) --
    let waSent = false;
    const to = toMsisdn(c.phone);
    if (to && c.whatsapp_notifications_enabled !== false) {
      const token = (Deno.env.get("WHATSAPP_TOKEN") || "").trim();
      const phoneId = (Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "").trim();
      if (token && phoneId) {
        const payload = {
          messaging_product: "whatsapp", to, type: "template",
          template: {
            name: "pedido_aberto_cliente", language: { code: "pt_BR" },
            components: [{ type: "body", parameters: [
              { type: "text", text: clientFirst },
              { type: "text", text: calledProName },
            ] }],
          },
        };
        try {
          const r = await fetch(`https://graph.facebook.com/${GRAPH}/${phoneId}/messages`, {
            method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload),
          });
          const jr = await r.json().catch(() => ({}));
          waSent = r.ok;
          try {
            await admin.from("wa_messages").insert({
              wa_id: (jr as { messages?: { id?: string }[] })?.messages?.[0]?.id ?? null,
              to_phone: to, user_id: clientUserId, template: "pedido_aberto_cliente",
              body: `Oi ${clientFirst}! Como voce nao teve resposta de ${calledProName}, abrimos um pedido pros profissionais da sua area te chamarem.`,
              status: r.ok ? "sent" : "error", payload: jr,
            });
          } catch (_e) { /* log nao-critico */ }
        } catch (_e) { /* whatsapp nao-critico */ }
      }
    }

    return json({ ok: true, emailSent, waSent });
  } catch (err) {
    return json({ ok: false, error: (err as Error)?.message ?? String(err) }, 200);
  }
});
