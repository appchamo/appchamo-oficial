import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_PLANS = ["pro", "vip", "business"];
const APPLE_VERIFY_PRODUCTION = "https://buy.itunes.apple.com/verifyReceipt";
const APPLE_VERIFY_SANDBOX = "https://sandbox.itunes.apple.com/verifyReceipt";

const cors = () => ({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
});
const json = (data: object, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors() },
  });

interface VerifyResult {
  ok: boolean;
  userMessage?: string;
}

/**
 * Valida o recibo com a Apple e exige assinatura ATIVA do produto esperado
 * (expires_date_ms > agora). Evita ativar plano pago quando o pagamento falhou
 * ou quando APPLE_SHARED_SECRET / recibo estão ausentes.
 */
async function verifyAppleReceipt(
  receiptBase64: string,
  expectedProductId: string
): Promise<VerifyResult> {
  const sharedSecret = Deno.env.get("APPLE_SHARED_SECRET");
  if (!sharedSecret?.trim()) {
    console.error(
      "validate_iap_subscription: APPLE_SHARED_SECRET ausente — IAP iOS bloqueado."
    );
    return {
      ok: false,
      userMessage:
        "Validação da App Store não configurada. Contate o suporte (APPLE_SHARED_SECRET).",
    };
  }

  const body = JSON.stringify({
    "receipt-data": receiptBase64,
    password: sharedSecret,
    "exclude-old-transactions": true,
  });

  let res = await fetch(APPLE_VERIFY_PRODUCTION, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  let data = (await res.json()) as Record<string, unknown>;

  if (data.status === 21007) {
    res = await fetch(APPLE_VERIFY_SANDBOX, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    data = (await res.json()) as Record<string, unknown>;
  }

  if (data.status !== 0) {
    console.error("Apple verifyReceipt status:", data.status);
    return {
      ok: false,
      userMessage:
        "A Apple não confirmou o pagamento desta assinatura. Se o cartão foi recusado, o plano não será ativado.",
    };
  }

  const latest = Array.isArray(data.latest_receipt_info)
    ? (data.latest_receipt_info as Record<string, string>[])
    : [];
  const inApp = Array.isArray((data.receipt as Record<string, unknown>)?.in_app)
    ? ((data.receipt as Record<string, unknown>).in_app as Record<
        string,
        string
      >[])
    : [];

  const now = Date.now();
  let maxExpiry = 0;
  for (const t of [...latest, ...inApp]) {
    if (t.product_id !== expectedProductId) continue;
    const exp = parseInt(t.expires_date_ms ?? "", 10) || 0;
    if (exp > maxExpiry) maxExpiry = exp;
  }

  if (maxExpiry <= now) {
    return {
      ok: false,
      userMessage:
        "Não há assinatura ativa para este plano no recibo da App Store. Verifique o pagamento em Ajustes → Assinaturas.",
    };
  }

  return { ok: true };
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

    if (
      !userId ||
      !planId ||
      !transactionId ||
      !productIdentifier ||
      !platform
    ) {
      return json(
        {
          error:
            "Campos obrigatórios: userId, planId, transactionId, productIdentifier, platform.",
        },
        400
      );
    }
    if (!ALLOWED_PLANS.includes(planId)) {
      return json({ error: "Plano inválido para IAP." }, 400);
    }

    if (platform === "ios") {
      if (
        !receipt ||
        typeof receipt !== "string" ||
        receipt.trim().length < 20
      ) {
        return json(
          {
            error:
              "Recibo da App Store ausente. Feche o app completamente, abra de novo e tente assinar outra vez, ou use «Restaurar compras».",
          },
          400
        );
      }
      const v = await verifyAppleReceipt(receipt.trim(), productIdentifier);
      if (!v.ok) {
        return json({ error: v.userMessage || "Recibo inválido." }, 400);
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

    // Atualiza user_type de acordo com o plano
    const newUserType = planId === "business" ? "company" : "professional";
    await supabase.from("profiles").update({ user_type: newUserType }).eq("user_id", userId);

    // Notifica o usuário
    await supabase.from("notifications").insert({
      user_id: userId,
      title: "🚀 Plano ativado!",
      message: `Sua assinatura foi confirmada pela App Store e os benefícios já estão disponíveis.`,
      type: "success",
      link: "/subscriptions",
    });

    return json({ success: true, planId });
  } catch (e: unknown) {
    console.error("validate_iap_subscription", e);
    return json(
      { error: "Erro interno.", message: (e as Error).message },
      500
    );
  }
});
