// Avisa o dono da vaga (profissional/empresa/patrocinador/cliente) quando chega uma
// nova candidatura: email + WhatsApp (template "nova_candidatura"). A notificação in-app
// já é criada no app; aqui cuidamos dos outros dois canais. Disparada por trigger no banco.
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
    const appId = String((body as { application_id?: string; record?: { id?: string } }).application_id || (body as { record?: { id?: string } }).record?.id || "").trim();
    if (!appId) return json({ error: "missing application_id" }, 400);

    const { data: app } = await admin.from("job_applications")
      .select("job_id, full_name, email, phone, description")
      .eq("id", appId).maybeSingle();
    if (!app) return json({ ok: true, skipped: "no_application" });

    const { data: job } = await admin.from("job_postings")
      .select("title, professional_id, sponsor_id")
      .eq("id", (app as { job_id: string }).job_id).maybeSingle();
    if (!job) return json({ ok: true, skipped: "no_job" });

    // Dono da vaga: profissional/empresa OU patrocinador.
    let ownerUserId: string | null = null;
    const j = job as { title?: string; professional_id?: string | null; sponsor_id?: string | null };
    if (j.professional_id) {
      const { data: pr } = await admin.from("professionals").select("user_id").eq("id", j.professional_id).maybeSingle();
      ownerUserId = (pr as { user_id?: string } | null)?.user_id ?? null;
    }
    if (!ownerUserId && j.sponsor_id) {
      const { data: sp } = await admin.from("sponsors").select("user_id").eq("id", j.sponsor_id).maybeSingle();
      ownerUserId = (sp as { user_id?: string } | null)?.user_id ?? null;
    }
    if (!ownerUserId) return json({ ok: true, skipped: "no_owner" });

    const { data: owner } = await admin.from("profiles")
      .select("full_name, email, phone, whatsapp_notifications_enabled, email_notifications_enabled")
      .eq("user_id", ownerUserId).maybeSingle();
    const o = owner as { full_name?: string; email?: string; phone?: string; whatsapp_notifications_enabled?: boolean; email_notifications_enabled?: boolean } | null;

    const ownerFirst = String(o?.full_name || "").trim().split(" ")[0] || "tudo bem";
    const jobTitle = String(j.title || "sua vaga");
    const a = app as { full_name?: string; email?: string; phone?: string; description?: string };
    const candidate = String(a.full_name || "Um candidato");

    // ── EMAIL ──
    let emailSent = false;
    if (o?.email && o.email_notifications_enabled !== false) {
      const host = Deno.env.get("SMTP_HOST") || "";
      const username = Deno.env.get("SMTP_USER") || "";
      const password = Deno.env.get("SMTP_PASS") || "";
      const port = Number(Deno.env.get("SMTP_PORT") || "587");
      const from = Deno.env.get("SMTP_FROM") || "Chamo <nao-responda@appchamo.com>";
      if (host && username && password) {
        const linhas = [
          `<strong>${esc(candidate)}</strong> se candidatou para a sua vaga <strong>${esc(jobTitle)}</strong>.`,
          a.phone ? `Telefone: ${esc(a.phone)}` : "",
          a.email ? `Email: ${esc(a.email)}` : "",
          a.description ? `Mensagem do candidato: ${esc(a.description)}` : "",
        ].filter(Boolean).map((l) => `<p style="margin:0 0 8px;font-size:14px;color:#333;line-height:1.5">${l}</p>`).join("");
        const html = '<div style="background:#f5f5f5;padding:40px 20px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">'
          + '<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,.06)">'
          + '<h1 style="margin:0 0 16px;font-size:18px;color:#ea580c">Nova candidatura recebida 🎉</h1>'
          + linhas
          + `<a href="${APP}/my-jobs" style="display:inline-block;margin-top:16px;background:#ea580c;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700;font-size:14px">Ver candidatura no app</a>`
          + '</div></div>';
        const client = new SMTPClient({ connection: { hostname: host, port, tls: port === 465, auth: { username, password } } });
        try {
          await client.send({ from, to: o.email, subject: "Nova candidatura na sua vaga — Chamô", html, content: "auto" });
          emailSent = true;
        } catch (_e) { /* email não-crítico */ }
        finally { try { await client.close(); } catch (_e) { /* */ } }
      }
    }

    // ── WHATSAPP (template nova_candidatura; botão URL é estático, sem parâmetro) ──
    let waSent = false;
    const to = toMsisdn(o?.phone);
    if (to && o?.whatsapp_notifications_enabled !== false) {
      const token = (Deno.env.get("WHATSAPP_TOKEN") || "").trim();
      const phoneId = (Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "").trim();
      if (token && phoneId) {
        const payload = {
          messaging_product: "whatsapp", to, type: "template",
          template: {
            name: "nova_candidatura", language: { code: "pt_BR" },
            components: [{ type: "body", parameters: [
              { type: "text", text: ownerFirst },
              { type: "text", text: candidate },
              { type: "text", text: jobTitle },
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
              to_phone: to, user_id: ownerUserId, template: "nova_candidatura",
              body: `Oi ${ownerFirst}! ${candidate} se candidatou para a sua vaga de ${jobTitle} no Chamô.`,
              status: r.ok ? "sent" : "error", payload: jr,
            });
          } catch (_e) { /* log não-crítico */ }
        } catch (_e) { /* whatsapp não-crítico */ }
      }
    }

    return json({ ok: true, emailSent, waSent });
  } catch (err) {
    return json({ ok: false, error: (err as Error)?.message ?? String(err) }, 200);
  }
});
