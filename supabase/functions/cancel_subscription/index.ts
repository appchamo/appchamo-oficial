// Cancela a assinatura do usuário.
// Asaas (PIX/cartão): chama a API do Asaas para encerrar a recorrência (para a cobrança)
// e mantém o acesso até o fim do período já pago (cancel_at_period_end + period_ends_at).
// Apple/Google: NÃO é tratado aqui — o cancelamento é feito pelo usuário na loja.
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ASAAS_ENV = Deno.env.get("ASAAS_ENV") ?? "sandbox";
const ASAAS_BASE_URL = ASAAS_ENV === "production"
  ? "https://api.asaas.com/v3"
  : "https://api-sandbox.asaas.com/v3";
const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY");

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Metodo nao suportado" }, 405);

  const authHeader = (req.headers.get("Authorization") ?? "").trim();
  const jwt = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  if (!jwt) return json({ error: "Nao autorizado" }, 401);

  const appClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: { user }, error: userErr } = await appClient.auth.getUser(jwt);
  if (userErr || !user) return json({ error: "Sessao expirada" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: sub } = await admin
    .from("subscriptions")
    .select("id, source, asaas_subscription_id, started_at, billing_period")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!sub) return json({ error: "Nenhuma assinatura encontrada." }, 404);

  // Calcula o fim do periodo ja pago
  const days = sub.billing_period === "annual" ? 365 : sub.billing_period === "semester" ? 180 : 30;
  const startedAt = sub.started_at ? new Date(sub.started_at) : new Date();
  const periodEndsAt = new Date(startedAt.getTime() + days * 24 * 60 * 60 * 1000);

  let asaasResult: unknown = null;
  const isAsaas = String(sub.source || "").toLowerCase().startsWith("asaas");

  if (isAsaas && sub.asaas_subscription_id) {
    if (!ASAAS_API_KEY) return json({ error: "ASAAS_API_KEY ausente" }, 500);
    try {
      const r = await fetch(`${ASAAS_BASE_URL}/subscriptions/${sub.asaas_subscription_id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", access_token: ASAAS_API_KEY },
      });
      asaasResult = await r.json().catch(() => ({}));
      console.log("Asaas cancel:", r.status, JSON.stringify(asaasResult));
      // Mesmo se ja estiver removida no Asaas, seguimos marcando local.
    } catch (e: any) {
      console.error("Asaas cancel erro:", e?.message);
      return json({ error: "Falha ao cancelar no Asaas. Tente de novo." }, 502);
    }
  }

  // Marca local: para de renovar, mantem acesso ate o fim do periodo pago.
  const { error: updErr } = await admin
    .from("subscriptions")
    .update({ cancel_at_period_end: true, period_ends_at: periodEndsAt.toISOString() })
    .eq("user_id", user.id);
  if (updErr) return json({ error: "Falha ao registrar cancelamento." }, 500);

  return json({ ok: true, period_ends_at: periodEndsAt.toISOString(), asaas: asaasResult });
});
