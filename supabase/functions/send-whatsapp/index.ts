// Envia mensagem de template via WhatsApp Cloud API (oficial da Meta).
// Chamada server-side (gatilho no banco via pg_net) — protegida por x-hook-secret.
//
// Body aceito:
//   { user_id: uuid, params?: string[], template?: string, lang?: string }  -> resolve telefone/nome do perfil
//   { to: "5534...", params?: string[], template?: string, lang?: string }  -> envio direto (teste)
//
// Secrets necessários (Supabase > Edge Functions > Secrets):
//   WHATSAPP_TOKEN            (token permanente)
//   WHATSAPP_PHONE_NUMBER_ID  (id do número, ex: 1205773189278482)
//   EMAIL_HOOK_SECRET         (reaproveitado como segredo do hook)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GRAPH_VERSION = "v21.0";

/** Normaliza telefone BR para o padrão WhatsApp (só dígitos, com 55). */
function toMsisdn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) return d;       // 55 + DDD + 9 dígitos
  if (d.length === 12 && d.startsWith("55")) return d;       // 55 + DDD + 8 dígitos
  if (d.length === 11 || d.length === 10) return "55" + d;   // DDD + número (sem país)
  return null;                                                // formato não reconhecido
}

Deno.serve(async (req) => {
  try {
    const hookSecret = (Deno.env.get("EMAIL_HOOK_SECRET") || "").trim();
    const got = (req.headers.get("x-hook-secret") || "").trim();
    if (!hookSecret || got !== hookSecret) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
    }

    const token = (Deno.env.get("WHATSAPP_TOKEN") || "").trim();
    const body = await req.json().catch(() => ({}));
    // Permite override do número (pra teste); senão usa o secret.
    const phoneId = (String(body.phone_number_id || "").trim()) || (Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "").trim();
    if (!token || !phoneId) {
      return new Response(JSON.stringify({ error: "whatsapp_not_configured" }), { status: 500 });
    }

    // Ação de registro do número na Cloud API (resolve erro 133010 "Account not registered").
    if (body.action === "register") {
      const pin = String(body.pin || "000000");
      const r = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/register`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", pin }),
      });
      const jr = await r.json().catch(() => ({}));
      console.log("WhatsApp register:", r.status, JSON.stringify(jr));
      return new Response(JSON.stringify({ ok: r.ok, status: r.status, result: jr }), { status: 200 });
    }

    const template: string = body.template || "nova_chamada";
    const lang: string = body.lang || "pt_BR";
    let params: string[] = Array.isArray(body.params) ? body.params : [];
    let to: string | null = body.to ? String(body.to) : null;

    // Resolve telefone e nome a partir do user_id, se não veio "to" direto
    if (!to && body.user_id) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { data: prof } = await supabase
        .from("profiles")
        .select("phone, full_name")
        .eq("user_id", body.user_id)
        .maybeSingle();
      to = toMsisdn((prof as any)?.phone);
      // Se não passaram params, usa o primeiro nome do profissional como {{1}}
      if (params.length === 0 && (prof as any)?.full_name) {
        params = [String((prof as any).full_name).split(" ")[0]];
      }
    } else if (to) {
      to = toMsisdn(to);
    }

    if (!to) {
      return new Response(JSON.stringify({ error: "telefone_invalido_ou_ausente" }), { status: 422 });
    }

    const components = params.length
      ? [{ type: "body", parameters: params.map((t) => ({ type: "text", text: t })) }]
      : [];

    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: template,
        language: { code: lang },
        ...(components.length ? { components } : {}),
      },
    };

    const resp = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error("WhatsApp API error:", JSON.stringify(result));
      return new Response(JSON.stringify({ ok: false, status: resp.status, error: result }), { status: 200 });
    }
    console.log("WhatsApp enviado:", to, "template:", template);
    return new Response(JSON.stringify({ ok: true, result }), { status: 200 });
  } catch (e: any) {
    console.error("send-whatsapp erro:", e?.message);
    return new Response(JSON.stringify({ ok: false, error: e?.message }), { status: 200 });
  }
});
