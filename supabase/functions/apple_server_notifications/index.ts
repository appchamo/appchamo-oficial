// =============================================================================
// Apple Server Notifications V2 webhook
// -----------------------------------------------------------------------------
// Resolve o gap de 2-3 dias entre o usuário "confirmar" a assinatura no
// StoreKit (validate_iap_subscription) e a Apple realmente cobrar o cartão.
//
// A Apple envia notificações assinadas (JWS) em:
//   https://developer.apple.com/documentation/appstoreservernotifications
//
// IMPORTANTE: Configurar no App Store Connect → App → App Information →
// "App Store Server Notifications" apontando para esta URL (Production e
// Sandbox URLs separadas).
// =============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// Decodifica payload JWS sem verificar assinatura (assinatura pode ser validada
// futuramente com x5c chain → Apple Root CA). Para confiança total em produção
// recomenda-se verificar a cadeia certificada que vem em `header.x5c`.
function decodeJwsPayload<T = Record<string, unknown>>(jws: string): T | null {
  try {
    const parts = jws.split(".");
    if (parts.length !== 3) return null;
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const b64 = padded + "=".repeat((4 - (padded.length % 4)) % 4);
    const decoded = atob(b64);
    return JSON.parse(decoded) as T;
  } catch (e) {
    console.error("decodeJwsPayload error:", e);
    return null;
  }
}

// Tipos relevantes do payload (subset)
interface NotificationPayload {
  notificationType: string;
  subtype?: string;
  notificationUUID: string;
  data?: {
    appAppleId?: number;
    bundleId?: string;
    environment?: "Sandbox" | "Production";
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
  };
}

interface TransactionInfo {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  purchaseDate: number; // epoch ms
  expiresDate?: number;
  type?: string;
  inAppOwnershipType?: string;
  signedDate?: number;
  revocationDate?: number;
  revocationReason?: number;
  appAccountToken?: string;
  environment?: string;
  price?: number; // milicentavos no iOS 17+
  currency?: string;
}

interface RenewalInfo {
  autoRenewProductId: string;
  autoRenewStatus: number; // 1 = ativo
  expirationIntent?: number; // 1 customer canceled, 2 billing error, 3 price increase
  isInBillingRetryPeriod?: boolean;
  recentSubscriptionStartDate?: number;
}

// Mapeia productId Apple → planId interno
function planFromProductId(productId: string): "pro" | "vip" | "business" | null {
  if (productId.startsWith("com.chamo.app.pro.")) return "pro";
  if (productId.startsWith("com.chamo.app.vip.")) return "vip";
  if (productId.startsWith("com.chamo.app.business.")) return "business";
  return null;
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const body = await req.json();
    const signedPayload: string | undefined = body?.signedPayload;
    if (!signedPayload) {
      return json({ error: "signedPayload ausente" }, 400);
    }

    const payload = decodeJwsPayload<NotificationPayload>(signedPayload);
    if (!payload) return json({ error: "payload inválido" }, 400);

    console.log(
      "[Apple ASSN]", payload.notificationType, payload.subtype ?? "",
      "uuid=", payload.notificationUUID,
    );

    const txInfo = payload.data?.signedTransactionInfo
      ? decodeJwsPayload<TransactionInfo>(payload.data.signedTransactionInfo)
      : null;
    const renewalInfo = payload.data?.signedRenewalInfo
      ? decodeJwsPayload<RenewalInfo>(payload.data.signedRenewalInfo)
      : null;

    if (!txInfo) {
      console.warn("[Apple ASSN] sem transaction info — ignorando");
      return json({ ok: true, ignored: true });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const planId = planFromProductId(txInfo.productId);
    if (!planId) {
      console.warn("[Apple ASSN] productId desconhecido:", txInfo.productId);
      return json({ ok: true, ignored: true });
    }

    // Localiza assinatura pelo originalTransactionId (preferencial)
    let { data: sub } = await supabase
      .from("subscriptions")
      .select("id, user_id, status, plan_id")
      .eq("apple_original_transaction_id", txInfo.originalTransactionId)
      .maybeSingle();

    // Fallback: appAccountToken contém user_id (gravado pelo client no momento
    // da compra via `applicationUsername`/`appAccountToken`)
    if (!sub && txInfo.appAccountToken) {
      const { data: subByToken } = await supabase
        .from("subscriptions")
        .select("id, user_id, status, plan_id")
        .eq("user_id", txInfo.appAccountToken)
        .maybeSingle();
      sub = subByToken ?? null;
    }

    if (!sub) {
      console.warn("[Apple ASSN] subscription não encontrada para", txInfo.originalTransactionId);
      return json({ ok: true, ignored: true });
    }

    const userId = sub.user_id;
    const amountBrl = txInfo.price && txInfo.currency === "BRL"
      ? txInfo.price / 1000 // Apple v2 usa milicentavos (10000 = R$10,00)
      : 0;

    const event = payload.notificationType;
    const subtype = payload.subtype ?? "";

    // ---------------------------------------------------------------------
    // Atualiza assinatura conforme o evento
    // ---------------------------------------------------------------------
    let newStatus: string | null = null;
    let lastPaymentStatus: string | null = null;
    let paymentStatus: string | null = null;
    let cancelAtPeriodEnd: boolean | null = null;
    let reason: string | null = null;

    switch (event) {
      case "SUBSCRIBED":
      case "DID_RENEW":
      case "OFFER_REDEEMED":
        newStatus = "active";
        lastPaymentStatus = "paid";
        paymentStatus = "paid";
        cancelAtPeriodEnd = false;
        break;

      case "DID_FAIL_TO_RENEW":
        // Apple ainda tenta cobrar (até 60 dias). Mantém ativo até EXPIRED.
        lastPaymentStatus = "refused";
        paymentStatus = "refused";
        reason = renewalInfo?.isInBillingRetryPeriod
          ? "Apple em billing retry"
          : "Falha ao renovar";
        break;

      case "EXPIRED":
      case "GRACE_PERIOD_EXPIRED":
        newStatus = "cancelled";
        lastPaymentStatus = "refused";
        paymentStatus = "cancelled";
        reason = "Assinatura expirou na Apple";
        break;

      case "REVOKE":
      case "REFUND":
        newStatus = "cancelled";
        lastPaymentStatus = "refunded";
        paymentStatus = "refunded";
        reason = "Reembolso/revogação pela Apple";
        break;

      case "DID_CHANGE_RENEWAL_STATUS":
        if (subtype === "AUTO_RENEW_DISABLED") {
          cancelAtPeriodEnd = true;
          reason = "Usuário desabilitou renovação automática";
        } else if (subtype === "AUTO_RENEW_ENABLED") {
          cancelAtPeriodEnd = false;
        }
        break;

      case "DID_CHANGE_RENEWAL_PREF":
        // Upgrade/downgrade dentro do mesmo grupo — atualiza plano apenas
        break;

      default:
        console.log("[Apple ASSN] evento ignorado:", event, subtype);
    }

    const updates: Record<string, unknown> = {
      apple_original_transaction_id: txInfo.originalTransactionId,
      apple_environment: payload.data?.environment ?? null,
      apple_product_id: txInfo.productId,
      source: "apple_iap",
      updated_at: new Date().toISOString(),
    };
    if (newStatus) updates.status = newStatus;
    if (lastPaymentStatus) {
      updates.last_payment_status = lastPaymentStatus;
      updates.last_payment_at = new Date(txInfo.signedDate ?? Date.now()).toISOString();
    }
    if (cancelAtPeriodEnd !== null) {
      updates.cancel_at_period_end = cancelAtPeriodEnd;
      if (cancelAtPeriodEnd && txInfo.expiresDate) {
        updates.period_ends_at = new Date(txInfo.expiresDate).toISOString();
      } else if (!cancelAtPeriodEnd) {
        updates.period_ends_at = null;
      }
    }
    if (sub.plan_id !== planId) updates.plan_id = planId;

    const { error: updErr } = await supabase
      .from("subscriptions")
      .update(updates)
      .eq("id", sub.id);
    if (updErr) console.error("[Apple ASSN] update sub error:", updErr);

    // Se cancelou, garante user_type = client
    if (newStatus === "cancelled") {
      await supabase
        .from("profiles")
        .update({ user_type: "client" })
        .eq("user_id", userId);

      await supabase.from("notifications").insert({
        user_id: userId,
        title: "❌ Plano cancelado",
        message: reason ?? "Sua assinatura foi cancelada pela Apple.",
        type: "warning",
        link: "/subscriptions",
      });
    }

    if (lastPaymentStatus === "refused" && newStatus !== "cancelled") {
      await supabase.from("notifications").insert({
        user_id: userId,
        title: "⚠️ Cobrança recusada",
        message: "A Apple não conseguiu cobrar a renovação. Atualize seu cartão em Ajustes → Assinaturas.",
        type: "warning",
        link: "/subscriptions",
      });
    }

    // ---------------------------------------------------------------------
    // Loga em subscription_payments (idempotente via UNIQUE source/external_id)
    // ---------------------------------------------------------------------
    if (paymentStatus) {
      const { error: payErr } = await supabase
        .from("subscription_payments")
        .upsert(
          {
            user_id: userId,
            subscription_id: sub.id,
            plan_id: planId,
            source: "apple_iap",
            status: paymentStatus,
            amount: amountBrl,
            currency: txInfo.currency ?? "BRL",
            external_id: txInfo.transactionId,
            reason,
            raw: payload as unknown as Record<string, unknown>,
            occurred_at: new Date(txInfo.signedDate ?? Date.now()).toISOString(),
          },
          { onConflict: "source,external_id", ignoreDuplicates: false },
        );
      if (payErr) console.error("[Apple ASSN] insert payment error:", payErr);
    }

    return json({ ok: true });
  } catch (e) {
    console.error("[Apple ASSN] handler error:", e);
    return json({ error: "internal" }, 500);
  }
});
