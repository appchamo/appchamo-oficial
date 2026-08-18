// Verifica o codigo OTP e marca o telefone como verificado no perfil.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "jsr:@panva/jose@6";

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
    const code = String((body as { code?: string }).code || "").replace(/\D/g, "");
    if (!to || code.length < 4) return json({ ok: false, error: "Dados invalidos." }, 400);

    const { data: row } = await supabase.from("phone_verifications")
      .select("id, code, attempts")
      .eq("user_id", userId).eq("phone", to).is("verified_at", null)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }).limit(1).maybeSingle();

    if (!row) return json({ ok: false, error: "Codigo expirado. Peca um novo." });
    if ((row as { attempts: number }).attempts >= 5) return json({ ok: false, error: "Muitas tentativas. Peca um novo codigo." });

    if (String((row as { code: string }).code) !== code) {
      await supabase.from("phone_verifications").update({ attempts: (row as { attempts: number }).attempts + 1 }).eq("id", (row as { id: string }).id);
      return json({ ok: false, error: "Codigo incorreto." });
    }

    const nowIso = new Date().toISOString();
    await supabase.from("phone_verifications").update({ verified_at: nowIso }).eq("id", (row as { id: string }).id);
    await supabase.from("profiles").update({ phone: to, phone_verified: true, phone_verified_at: nowIso }).eq("user_id", userId);
    return json({ ok: true });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
