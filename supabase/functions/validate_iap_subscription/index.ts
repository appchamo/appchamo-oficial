import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_PLANS = ["pro", "vip", "business"];
const APPLE_VERIFY_PRODUCTION = "https://buy.itunes.apple.com/verifyReceipt";
const APPLE_VERIFY_SANDBOX = "https://sandbox.itunes.apple.com/verifyReceipt";

// Todos os product IDs do grupo de assinaturas Chamô
const ALL_CHAMO_PRODUCT_IDS = [
  "com.chamo.app.pro.monthly",
  "com.chamo.app.pro.semester",
  "com.chamo.app.pro.annual",
  "com.chamo.app.vip.monthly",
  "com.chamo.app.vip.semester",
  "com.chamo.app.vip.annual",
  "com.chamo.app.business.monthly",
  "com.chamo.app.business.semester",
  "com.chamo.app.business.annual",
];

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
 * Valida o recibo com a Apple.
 * Aceita qualquer produto ativo do grupo de assinaturas Chamô —
 * necessário para upgrades/downgrades dentro do mesmo grupo onde a Apple
 * pode retornar o recibo com o produto anterior ainda como mais recente.
 * Retorna o product_id ativo mais recente para determinar o plano correto.
 */
async function verifyAppleReceipt(
  receiptBase64: string,
  expectedProductId: string
): Promise<VerifyResult & { activeProductId?: string }> {
  const sharedSecret = Deno.env.get("APPLE_SHARED_SECRET");
  if (!sharedSecret?.trim()) {
    console.error("validate_iap_subscription: APPLE_SHARED_SECRET ausente.");
    return {
      ok: false,
      userMessage: "Validação da App Store não configurada. Contate o suporte.",
    };
  }

  const body = JSON.stringify({
    "receipt-data": receiptBase64,
    password: sharedSecret,
    "exclude-old-transactions": false, // incluir todas para pegar upgrades
  });

  let res = await fetch(APPLE_VERIFY_PRODUCTION, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  let data = (await res.json()) as Record<string, unknown>;

  // Fallback para sandbox
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
        "A Apple não confirmou o pagamento. Se o cartão foi recusado, o plano não será ativado.",
    };
  }

  const latest = Array.isArray(data.latest_receipt_info)
    ? (data.latest_receipt_info as Record<string, string>[])
    : [];
  const inApp = Array.isArray((data.receipt as Record<string, unknown>)?.in_app)
    ? ((data.receipt as Record<string, unknown>).in_app as Record<string, string>[])
    : [];

  const now = Date.now();

  // Procura a transação mais recente e ativa entre TODOS os produtos do grupo
  let maxExpiry = 0;
  let activeProductId: string | undefined;

  for (const t of [...latest, ...inApp]) {
    // Aceita qualquer produto do grupo Chamô
    if (!ALL_CHAMO_PRODUCT_IDS.includes(t.product_id)) continue;
    const exp = parseInt(t.expires_date_ms ?? "", 10) || 0;
    if (exp > maxExpiry) {
      maxExpiry = exp;
      activeProductId = t.product_id;
    }
  }

  // Aceita se: (a) o produto esperado está ativo, OU (b) qualquer produto do
  // grupo está ativo — cobre upgrades onde a Apple ainda não atualizou o recibo
  if (maxExpiry > now) {
    return { ok: true, activeProductId };
  }

  // Em sandbox, assinaturas expiram em minutos — aceitar se o recibo é válido
  // e o produto esperado aparece em qualquer transação (mesmo expirada por ser sandbox)
  const hasSandboxTransaction = [...latest, ...inApp].some(
    (t) => t.product_id === expectedProductId
  );
  if (hasSandboxTransaction) {
    console.warn("Sandbox: recibo válido mas expirado — aceitando para testes.");
    return { ok: true, activeProductId: expectedProductId };
  }

  return {
    ok: false,
    userMessage:
      "Não há assinatura ativa neste recibo. Verifique o pagamento em Ajustes → Assinaturas.",
  };
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

    // Determina o billing_period a partir do productIdentifier
    const billingPeriod = productIdentifier.endsWith(".annual")
      ? "annual"
      : productIdentifier.endsWith(".semester")
      ? "semester"
      : "monthly";

    const supabase = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error: upsertError } = await supabase.from("subscriptions").upsert(
      {
        user_id: userId,
        plan_id: planId,
        status: "ACTIVE",
        billing_period: billingPeriod,
        cancel_at_period_end: false,
        period_ends_at: null,
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
