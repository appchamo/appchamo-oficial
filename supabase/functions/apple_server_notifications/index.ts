// =============================================================================
// Apple Server Notifications V2 webhook
// -----------------------------------------------------------------------------
// Resolve o gap de 2-3 dias entre o usuário "confirmar" a assinatura no
// StoreKit (validate_iap_subscription) e a Apple realmente cobrar o cartão.
//
// A Apple envia notificações assinadas (JWS) em:
//   https://developer.apple.com/documentation/appstoreservernotifications
//
// SEGURANÇA — verificação criptográfica do JWS:
//   Implementação 100% WebCrypto (sem dependência de node:crypto), porque o
//   Edge Runtime do Supabase (Deno) tem lacunas na compatibilidade Node:
//     - crypto.X509Certificate.prototype.toString → ERR_NOT_IMPLEMENTED
//   Usamos:
//     • @peculiar/x509  → parsing X.509 + validação de cadeia (WebCrypto puro)
//     • jose            → verificação ECDSA P-256 do JWS via WebCrypto
//
//   O que validamos:
//     1. Cadeia x5c (leaf → intermediate → ...) com cada cert assinado pelo
//        próximo, terminando no Apple Root CA - G3 (configurado em env).
//     2. Assinatura ECDSA P-256 do JWS com a public key do leaf cert.
//     3. bundleId e appAppleId do payload (defesa contra replay de outro app).
//     4. JWS aninhados (signedTransactionInfo, signedRenewalInfo) recebem a
//        mesma validação completa.
//
// NOTA: Não fazemos OCSP (revogação online). A Apple só revoga certs em casos
// muito raros e a validade dos certs é curta. Se precisar OCSP no futuro, dá
// pra adicionar fetch ao endpoint OCSP do extension AIA do cert.
//
// Variáveis de ambiente exigidas (defina via `supabase secrets set`):
//   APPLE_ROOT_CA_G3_B64   – base64 do Apple Root CA - G3 em DER
//                            (https://www.apple.com/certificateauthority/AppleRootCA-G3.cer)
//   APPLE_BUNDLE_ID        – ex.: com.chamo.app
//   APPLE_APP_ID           – numeric appAppleId (App Store Connect → App → App Info)
//
// IMPORTANTE: Configurar no App Store Connect → App → App Information →
// "App Store Server Notifications V2" apontando para esta URL (Production e
// Sandbox URLs separadas).
// =============================================================================
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as x509 from "npm:@peculiar/x509@1.12.3";
import { compactVerify, importX509 } from "npm:jose@5.9.6";

// @peculiar/x509 precisa que registremos o WebCrypto subjacente. Deno expõe
// `crypto` global compatível com a Web Crypto API.
x509.cryptoProvider.set(crypto as Crypto);

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// ─── Configuração (resolvida sob demanda na primeira request) ────────────────
let appleRootCert: x509.X509Certificate | null = null;
let configBundleId: string | null = null;
let configAppAppleId: number | null = null;
let configError: string | null = null;

function ensureConfig(): boolean {
  if (appleRootCert) return true;
  if (configError) return false;

  const rootCertB64 = Deno.env.get("APPLE_ROOT_CA_G3_B64");
  const bundleId = Deno.env.get("APPLE_BUNDLE_ID");
  const appAppleIdRaw = Deno.env.get("APPLE_APP_ID");

  if (!rootCertB64 || !bundleId) {
    configError =
      "APPLE_ROOT_CA_G3_B64 ou APPLE_BUNDLE_ID ausentes — verificação JWS desativada (modo dev).";
    console.warn("[Apple ASSN]", configError);
    return false;
  }

  try {
    const rootDer = Uint8Array.from(atob(rootCertB64), (c) => c.charCodeAt(0));
    appleRootCert = new x509.X509Certificate(rootDer);
    configBundleId = bundleId;
    configAppAppleId = appAppleIdRaw ? Number(appAppleIdRaw) : null;
    return true;
  } catch (e) {
    configError = `Falha ao parsear Apple Root CA G3: ${(e as Error).message}`;
    console.error("[Apple ASSN]", configError);
    return false;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function b64urlBytes(b64url: string): Uint8Array {
  const padded = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const b64 = padded + "=".repeat((4 - (padded.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function b64urlJson<T>(b64url: string): T {
  return JSON.parse(new TextDecoder().decode(b64urlBytes(b64url))) as T;
}

// Decode JWS sem verificar assinatura — APENAS para fallback de modo dev.
function decodeJwsUnsafe<T>(jws: string): T | null {
  try {
    const parts = jws.split(".");
    if (parts.length !== 3) return null;
    return b64urlJson<T>(parts[1]);
  } catch (e) {
    console.error("decodeJwsUnsafe error:", e);
    return null;
  }
}

// ─── Verificação JWS Apple (cadeia x5c → root + assinatura ECDSA) ────────────
async function verifyAppleJws<T>(jws: string): Promise<T | null> {
  if (!ensureConfig() || !appleRootCert) return null;

  const parts = jws.split(".");
  if (parts.length !== 3) {
    console.error("[Apple ASSN] JWS malformado (não tem 3 partes)");
    return null;
  }

  let header: { alg?: string; x5c?: string[] };
  try {
    header = b64urlJson(parts[0]);
  } catch {
    console.error("[Apple ASSN] header JWS inválido");
    return null;
  }

  if (!header.x5c || header.x5c.length < 1) {
    console.error("[Apple ASSN] x5c ausente no header JWS");
    return null;
  }

  // x5c traz certs em base64 padrão (NÃO base64url) por especificação.
  let certs: x509.X509Certificate[];
  try {
    certs = header.x5c.map(
      (c) =>
        new x509.X509Certificate(
          Uint8Array.from(atob(c), (ch) => ch.charCodeAt(0)),
        ),
    );
  } catch (e) {
    console.error("[Apple ASSN] x5c contém cert inválido:", e);
    return null;
  }

  // 1) Cada cert deve ter sido assinado pelo próximo na cadeia.
  for (let i = 0; i < certs.length - 1; i++) {
    const valid = await certs[i].verify({
      publicKey: certs[i + 1].publicKey,
      signatureOnly: true,
    });
    if (!valid) {
      console.error(
        `[Apple ASSN] cadeia x5c inválida no índice ${i} (subject=${certs[i].subject})`,
      );
      return null;
    }
  }

  // 2) Último cert da cadeia deve ser o Apple Root CA G3 ou ser assinado por ele.
  const lastCert = certs[certs.length - 1];
  if (lastCert.thumbprint !== appleRootCert.thumbprint) {
    const valid = await lastCert.verify({
      publicKey: appleRootCert.publicKey,
      signatureOnly: true,
    });
    if (!valid) {
      console.error(
        "[Apple ASSN] cadeia x5c não termina em Apple Root CA G3",
      );
      return null;
    }
  }

  // 3) Verifica assinatura JWS com a public key do leaf cert via jose.
  try {
    const leafPem = certs[0].toString("pem");
    const leafKey = await importX509(leafPem, header.alg ?? "ES256");
    const result = await compactVerify(jws, leafKey);
    return JSON.parse(new TextDecoder().decode(result.payload)) as T;
  } catch (e) {
    console.error("[Apple ASSN] assinatura JWS inválida:", e);
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

// Verifica + decodifica a notificação completa.
async function verifyAndDecode(signedPayload: string): Promise<{
  payload: NotificationPayload | null;
  txInfo: TransactionInfo | null;
  renewalInfo: RenewalInfo | null;
  verified: boolean;
}> {
  // Sem env vars → modo dev: decodifica sem verificar (com warning).
  if (!ensureConfig()) {
    console.warn("[Apple ASSN] aceitando payload SEM verificação (dev mode).");
    const peek = decodeJwsUnsafe<NotificationPayload>(signedPayload);
    const txInfo = peek?.data?.signedTransactionInfo
      ? decodeJwsUnsafe<TransactionInfo>(peek.data.signedTransactionInfo)
      : null;
    const renewalInfo = peek?.data?.signedRenewalInfo
      ? decodeJwsUnsafe<RenewalInfo>(peek.data.signedRenewalInfo)
      : null;
    return { payload: peek, txInfo, renewalInfo, verified: false };
  }

  const payload = await verifyAppleJws<NotificationPayload>(signedPayload);
  if (!payload) {
    return { payload: null, txInfo: null, renewalInfo: null, verified: false };
  }

  // Confere bundleId (defesa contra payloads forjados de outro app)
  if (payload.data?.bundleId && payload.data.bundleId !== configBundleId) {
    console.error(
      `[Apple ASSN] bundleId mismatch: esperado=${configBundleId} recebido=${payload.data.bundleId}`,
    );
    return { payload: null, txInfo: null, renewalInfo: null, verified: false };
  }
  if (
    configAppAppleId &&
    payload.data?.appAppleId &&
    payload.data.appAppleId !== configAppAppleId
  ) {
    console.error(
      `[Apple ASSN] appAppleId mismatch: esperado=${configAppAppleId} recebido=${payload.data.appAppleId}`,
    );
    return { payload: null, txInfo: null, renewalInfo: null, verified: false };
  }

  // JWS aninhados — mesma verificação completa
  let txInfo: TransactionInfo | null = null;
  if (payload.data?.signedTransactionInfo) {
    txInfo = await verifyAppleJws<TransactionInfo>(
      payload.data.signedTransactionInfo,
    );
    if (!txInfo) {
      console.error(
        "[Apple ASSN] signedTransactionInfo aninhado falhou verificação",
      );
      return { payload: null, txInfo: null, renewalInfo: null, verified: false };
    }
  }

  let renewalInfo: RenewalInfo | null = null;
  if (payload.data?.signedRenewalInfo) {
    renewalInfo = await verifyAppleJws<RenewalInfo>(
      payload.data.signedRenewalInfo,
    );
    if (!renewalInfo) {
      console.error(
        "[Apple ASSN] signedRenewalInfo aninhado falhou verificação",
      );
      return { payload: null, txInfo: null, renewalInfo: null, verified: false };
    }
  }

  return { payload, txInfo, renewalInfo, verified: true };
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

    const { payload, txInfo, renewalInfo, verified } =
      await verifyAndDecode(signedPayload);

    // Em produção (config presente) recusamos qualquer payload que falhar a
    // verificação criptográfica. `configError` distingue "não configurado"
    // (dev — payload chega decodificado mesmo assim) de "configurado mas
    // falhou na verificação" (payload null → 401).
    if (!payload) {
      const reason = configError ?? "JWS inválido / assinatura não confere";
      return json({ error: "verificação JWS falhou", reason }, 401);
    }

    console.log(
      "[Apple ASSN]",
      payload.notificationType,
      payload.subtype ?? "",
      "uuid=", payload.notificationUUID,
      "verified=", verified,
    );

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
