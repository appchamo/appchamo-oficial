/**
 * subscription-renewal-retry
 *
 * Cron job que roda a cada 4 horas (configurado em Database → Cron Jobs no Supabase Dashboard).
 * Cronograma de recobrança quando a renovação mensal falha:
 *
 *   Dia 1 → falha detectada (PAYMENT_OVERDUE no webhook), carência criada
 *   Dia 2 → 1 tentativa  (26h após start)
 *   Dia 3 → 2 tentativas com 8h de intervalo  (50h e 58h após start)
 *   Dia 4 → 1 tentativa  (74h após start)
 *   Dia 5-6 → sem tentativas
 *   Dia 7 → 1 tentativa final  (146h após start) → se falhar, cancela e reverte para Free
 */

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ASAAS_ENV = Deno.env.get("ASAAS_ENV") ?? "sandbox";
const ASAAS_BASE_URL = ASAAS_ENV === "production"
  ? "https://api.asaas.com/v3"
  : "https://api-sandbox.asaas.com/v3";
const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY")!;

// Recobrança diária, indefinidamente, até o pagamento passar OU o usuário cancelar manual.
// Nunca cancela sozinho por tempo. Enquanto vencido, o plano fica "suspended" e o app bloqueia.
const RETRY_INTERVAL_HOURS = 24;

async function getAdminId(supabase: any): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("email", "admin@appchamo.com")
    .maybeSingle();
  return data?.user_id ?? null;
}

async function notifyAdmin(supabase: any, title: string, message: string, type: string, link: string) {
  const adminId = await getAdminId(supabase);
  if (!adminId) return;
  await supabase.from("notifications").insert({ user_id: adminId, title, message, type, link, read: false });
}

async function notifyUser(supabase: any, userId: string, title: string, message: string, type: string) {
  await supabase.from("notifications").insert({ user_id: userId, title, message, type, link: "/subscriptions", read: false });
}

serve(async (req) => {
  // Aceita chamada por cron (sem body) ou direta com Authorization
  const corsHeaders = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date();
    console.log(`[renewal-retry] Rodando em: ${now.toISOString()}`);

    // ──────────────────────────────────────────────────────────────────
    // 1. PROCESSAMENTO DE CARÊNCIAS ATIVAS (renovações com falha)
    // ──────────────────────────────────────────────────────────────────
    const { data: graces, error: graceErr } = await supabase
      .from("subscription_grace_periods")
      .select("*")
      .eq("status", "active")
      .lte("next_attempt_at", now.toISOString());

    if (graceErr) {
      console.error("[renewal-retry] Erro ao buscar carências:", graceErr.message);
    }

    const results: any[] = [];

    for (const grace of (graces || [])) {
      console.log(`[renewal-retry] Processando carência ${grace.id} | usuário: ${grace.user_id} | tentativa: ${grace.attempt_count}`);

      // Tenta cobrar via Asaas (retry no pagamento vencido)
      let success = false;
      let asaasError = "";

      if (grace.asaas_payment_id) {
        try {
          const retryRes = await fetch(`${ASAAS_BASE_URL}/payments/${grace.asaas_payment_id}/pay`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "access_token": ASAAS_API_KEY,
            },
            body: JSON.stringify({}), // Asaas usa o cartão armazenado na assinatura
          });
          const retryData = await retryRes.json();
          console.log(`[renewal-retry] Asaas response:`, JSON.stringify(retryData));

          if (retryRes.ok && !retryData.errors?.length) {
            const paymentStatus = retryData.status;
            success = paymentStatus === "CONFIRMED" || paymentStatus === "RECEIVED";
          } else {
            asaasError = retryData.errors?.[0]?.description || retryData.description || "Erro desconhecido";
          }
        } catch (fetchErr: any) {
          asaasError = fetchErr.message;
          console.error("[renewal-retry] Erro de rede ao chamar Asaas:", asaasError);
        }
      } else {
        // Sem payment_id: tenta buscar o pagamento vencido da assinatura no Asaas
        try {
          const paymentsRes = await fetch(
            `${ASAAS_BASE_URL}/payments?subscription=${grace.asaas_subscription_id}&status=OVERDUE&limit=1`,
            { headers: { "access_token": ASAAS_API_KEY } }
          );
          const paymentsData = await paymentsRes.json();
          const overduePayment = paymentsData.data?.[0];
          if (overduePayment?.id) {
            // Atualiza a carência com o payment_id encontrado e agenda nova tentativa imediata
            await supabase
              .from("subscription_grace_periods")
              .update({ asaas_payment_id: overduePayment.id })
              .eq("id", grace.id);
            grace.asaas_payment_id = overduePayment.id;
            // Tenta cobrar agora
            const retryRes2 = await fetch(`${ASAAS_BASE_URL}/payments/${overduePayment.id}/pay`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "access_token": ASAAS_API_KEY },
              body: JSON.stringify({}),
            });
            const retryData2 = await retryRes2.json();
            success = retryData2.status === "CONFIRMED" || retryData2.status === "RECEIVED";
            asaasError = success ? "" : (retryData2.errors?.[0]?.description || "Falha ao cobrar");
          } else {
            asaasError = "Nenhum pagamento vencido encontrado no Asaas";
          }
        } catch (e: any) {
          asaasError = e.message;
        }
      }

      if (success) {
        // ✅ Pagamento realizado com sucesso → resolve a carência e reativa o plano
        await supabase
          .from("subscription_grace_periods")
          .update({ status: "resolved", resolved_at: now.toISOString(), last_attempt_at: now.toISOString() })
          .eq("id", grace.id);

        // Reativa a assinatura no banco (volta a funcionar imediatamente)
        await supabase
          .from("subscriptions")
          .update({ status: "active", last_payment_status: "paid" })
          .eq("asaas_subscription_id", grace.asaas_subscription_id);
        // Volta a aparecer pros clientes
        await supabase
          .from("professionals")
          .update({ availability_status: "available" })
          .eq("user_id", grace.user_id);

        await notifyUser(
          supabase, grace.user_id,
          "✅ Plano Reativado",
          "Conseguimos cobrar seu cartão! Seu plano voltou a funcionar normalmente.",
          "success"
        );
        await notifyAdmin(supabase, "✅ Cobrança Recuperada",
          `Plano do usuário voltou a funcionar após recobrança bem-sucedida.`,
          "subscription", "/admin/users"
        );
        results.push({ grace_id: grace.id, outcome: "success" });

      } else {
        // ❌ Falhou → NÃO cancela. Mantém suspenso e reagenda para daqui 24h (todo dia).
        const nextAttemptCount = grace.attempt_count + 1;
        const nextAttemptAt = new Date(now.getTime() + RETRY_INTERVAL_HOURS * 60 * 60 * 1000);

        await supabase
          .from("subscription_grace_periods")
          .update({
            attempt_count: nextAttemptCount,
            last_attempt_at: now.toISOString(),
            next_attempt_at: nextAttemptAt.toISOString(),
          })
          .eq("id", grace.id);

        // Garante que o plano segue marcado como suspenso enquanto vencido
        await supabase
          .from("subscriptions")
          .update({ status: "suspended", last_payment_status: "refused" })
          .eq("asaas_subscription_id", grace.asaas_subscription_id);
        // Some da busca dos clientes enquanto vencido
        await supabase
          .from("professionals")
          .update({ availability_status: "unavailable" })
          .eq("user_id", grace.user_id);

        console.log(`[renewal-retry] Falha (tentativa ${nextAttemptCount}). Nova tentativa: ${nextAttemptAt.toISOString()} | motivo: ${asaasError}`);
        results.push({ grace_id: grace.id, outcome: "retry_scheduled", next: nextAttemptAt.toISOString() });
      }
    }

    // ──────────────────────────────────────────────────────────────────
    // 2. NOTIFICAÇÃO ADMIN: repasses que ficaram disponíveis
    // ──────────────────────────────────────────────────────────────────
    const { data: readyTransfers } = await supabase
      .from("wallet_transactions")
      .select("id, professional_id, amount, professionals(user_id, profiles(full_name))")
      .eq("status", "pending")
      .eq("admin_transfer_notified", false)
      .lte("available_at", now.toISOString())
      .limit(50);

    if (readyTransfers && readyTransfers.length > 0) {
      // Agrupa por profissional para uma notificação por profissional
      const byPro: Record<string, { name: string; total: number; ids: string[] }> = {};
      for (const wt of readyTransfers) {
        const proId = wt.professional_id;
        const proName = (wt as any).professionals?.profiles?.full_name ?? "Profissional";
        if (!byPro[proId]) byPro[proId] = { name: proName, total: 0, ids: [] };
        byPro[proId].total += Number(wt.amount);
        byPro[proId].ids.push(wt.id);
      }

      const adminId = await getAdminId(supabase);
      for (const [, pro] of Object.entries(byPro)) {
        const totalStr = pro.total.toFixed(2).replace(".", ",");
        if (adminId) {
          await supabase.from("notifications").insert({
            user_id: adminId,
            title: "💸 Repasse Disponível",
            message: `R$ ${totalStr} disponíveis para repasse a ${pro.name}.`,
            type: "transfer",
            link: "/admin/wallet",
            read: false,
          });
        }
        // Marca como notificado
        await supabase
          .from("wallet_transactions")
          .update({ admin_transfer_notified: true })
          .in("id", pro.ids);
      }

      console.log(`[renewal-retry] ${Object.keys(byPro).length} profissional(is) com repasse disponível notificados.`);
    }

    return new Response(JSON.stringify({ ok: true, graces_processed: results.length, results }), {
      headers: corsHeaders,
    });

  } catch (err: any) {
    console.error("[renewal-retry] Erro fatal:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
