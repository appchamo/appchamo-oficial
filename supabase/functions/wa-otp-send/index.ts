// Envia um codigo OTP de 4 digitos no WhatsApp (template de autenticacao "codigo_verificacao").
// Autentica o usuario pelo JWT (ES256 -> verify_jwt desligado no gateway).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "jsr:@panva/jose@6";

const GRAPH = "v21.0";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function toMsisdn(raw: unknown): string | null {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) return d;
  if (d.length === 12 && d.startsWith("55")) return d;
  if (d.length === 11 || d.length === 10) return "55" + d;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "")?.trim();
    if (!token) return json({ error: "Token ausente." }, 401);
    let userId = "";
    try {
      const JWKS = jose.createRemoteJWKSet(new URL(supabaseUrl + "/auth/v1/.well-known/jwks.json"));
      const { payload } = await jose.jwtVerify(token, JWKS, { issuer: supabaseUrl + "/auth/v1" });
      userId = String(payload.sub ?? "");
    } catch (_e) {
      return json({ error: "Token invalido ou expirado." }, 401);
    }
    if (!userId) return json({ error: "Token invalido." }, 401);

    const body = await req.json().catch(() => ({}));
    const to = toMsisdn((body as { phone?: string }).phone);
    if (!to) return json({ error: "Numero de WhatsApp invalido." }, 400);

    // Rate limit: 1 codigo por 60s por usuario.
    const { data: recent } = await supabase.from("phone_verifications")
      .select("created_at").eq("user_id", userId)
      .gte("created_at", new Date(Date.now() - 60 * 1000).toISOString())
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (recent) return json({ error: "Aguarde alguns segundos para pedir um novo codigo." }, 429);

    const code = String(Math.floor(1000 + Math.random() * 9000));
    await supabase.from("phone_verifications").insert({
      user_id: userId, phone: to, code, attempts: 0,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });

    const waToken = (Deno.env.get("WHATSAPP_TOKEN") || "").trim();
    const phoneId = (Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "").trim();
    const payload = {
      messaging_product: "whatsapp", to, type: "template",
      template: {
        name: "codigo_verificacao", language: { code: "pt_BR" },
        components: [
          { type: "body", parameters: [{ type: "text", text: code }] },
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
        ],
      },
    };
    const r = await fetch(`https://graph.facebook.com/${GRAPH}/${phoneId}/messages`, {
      method: "POST", headers: { Authorization: `Bearer ${waToken}`, "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const jr = await r.json().catch(() => ({}));
    if (!r.ok) return json({ error: "Nao foi possivel enviar o codigo agora.", detail: (jr as { error?: { message?: string } })?.error?.message ?? null }, 502);
    return json({ ok: true });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
