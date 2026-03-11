import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_PLANS = ["pro", "vip", "business"];
const APPLE_VERIFY_PRODUCTION = "https://buy.itunes.apple.com/verifyReceipt";
const APPLE_VERIFY_SANDBOX = "https://sandbox.itunes.apple.com/verifyReceipt";

const cors = () => ({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
});
const json = (data: object, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors() },
  });

/** Valida receipt iOS com Apple (verifyReceipt). Retorna true se válido. */
async function verifyAppleReceipt(receiptBase64: string): Promise<boolean> {
  const sharedSecret = Deno.env.get("APPLE_SHARED_SECRET");
  if (!sharedSecret) {
    console.warn("APPLE_SHARED_SECRET not set; skipping receipt verification.");
    return true;
  }

  const body = JSON.stringify({
    "receipt-data": receiptBase64,
    password: sharedSecret,
  });

  let res = await fetch(APPLE_VERIFY_PRODUCTION, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  let data = await res.json();

  if (data.status === 21007) {
    res = await fetch(APPLE_VERIFY_SANDBOX, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    data = await res.json();
  }

  if (data.status !== 0) {
    console.error("Apple verifyReceipt status:", data.status);
    return false;
  }

  const latest = data.latest_receipt_info ?? data.receipt?.in_app ?? [];
  const hasActive = Array.isArray(latest) && latest.length > 0;
  return hasActive;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors() });
  }

  try {
    const body = await req.json();
    const {
      userId,
      planId,
      transactionId,
      productIdentifier,
      receipt,
      platform,
    } = body;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Token de autenticação ausente." }, 401);
    }
    const token = authHeader.slice(7);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey =
      Deno.env.get("SUPABASE_ANON_KEY") ||
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ||
      "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return json(
        { error: "Token inválido ou expirado. Faça login novamente." },
        401
      );
    }
    if (user.id !== userId) {
      return json(
        { error: "Não autorizado a ativar assinatura para este usuário." },
        403
      );
    }

    if (!userId || !planId || !transactionId || !productIdentifier || !platform) {
      return json({ error: "Campos obrigatórios: userId, planId, transactionId, productIdentifier, platform." }, 400);
    }
    if (!ALLOWED_PLANS.includes(planId)) {
      return json({ error: "Plano inválido para IAP." }, 400);
    }

    if (platform === "ios" && receipt) {
      const valid = await verifyAppleReceipt(receipt);
      if (!valid) {
        return json({ error: "Receipt inválido ou expirado." }, 400);
      }
    }

    const supabase = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error: upsertError } = await supabase.from("subscriptions").upsert(
      {
        user_id: userId,
        plan_id: planId,
        status: "ACTIVE",
        started_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (upsertError) {
      console.error("validate_iap_subscription upsert:", upsertError);
      return json({ error: "Erro ao ativar assinatura." }, 500);
    }

    return json({ success: true, planId });
  } catch (e: unknown) {
    console.error("validate_iap_subscription", e);
    return json(
      { error: "Erro interno.", message: (e as Error).message },
      500
    );
  }
});
