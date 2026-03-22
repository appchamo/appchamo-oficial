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

// Horas após started_at para cada tentativa (attempt_count 1…5)
// attempt_count já começa em 1 (criado no webhook como primeira falha)
const RETRY_SCHEDULE: Record<number, number | null> = {
  1: 26,   // Dia 2
  2: 50,   // Dia 3, primeira
  3: 58,   // Dia 3, segunda (8h depois)
  4: 74,   // Dia 4
  5: 146,  // Dia 7 — última; se falhar → cancela
};
const MAX_ATTEMPTS = 5;

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
      const isFinalAttempt = grace.attempt_count >= MAX_ATTEMPTS;
      const dayLabel = isFinalAttempt ? "Dia 7 (final)" : `Dia ${Math.ceil(grace.attempt_count + 1)}`;
      console.log(`[renewal-retry] Processando carência ${grace.id} | usuário: ${grace.user_id} | tentativa: ${grace.attempt_count} | ${dayLabel}`);

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
        // ✅ Pagamento realizado com sucesso → resolve a carência
        await supabase
          .from("subscription_grace_periods")
          .update({ status: "resolved", resolved_at: now.toISOString(), last_attempt_at: now.toISOString() })
          .eq("id", grace.id);

        // Reativa a assinatura no banco
        await supabase
          .from("subscriptions")
          .update({ status: "ACTIVE" })
          .eq("asaas_subscription_id", grace.asaas_subscription_id);

        await notifyUser(
          supabase, grace.user_id,
          "✅ Plano Renovado com Sucesso",
          "Sua renovação foi processada com sucesso! Continue aproveitando todos os benefícios.",
          "success"
        );
        await notifyAdmin(supabase, "✅ Renovação Recuperada",
          `Plano do usuário foi renovado com sucesso após tentativa de recobrança.`,
          "subscription", "/admin/users"
        );
        results.push({ grace_id: grace.id, outcome: "success" });

      } else if (isFinalAttempt) {
        // ❌ Última tentativa falhou → cancela assinatura
        console.log(`[renewal-retry] ❌ Tentativa final falhou para ${grace.user_id}. Cancelando assinatura.`);

        await supabase
          .from("subscription_grace_periods")
          .update({ status: "cancelled", resolved_at: now.toISOString(), last_attempt_at: now.toISOString() })
          .eq("id", grace.id);

        // Cancela no Asaas
        await fetch(`${ASAAS_BASE_URL}/subscriptions/${grace.asaas_subscription_id}`, {
          method: "DELETE",
          headers: { "access_token": ASAAS_API_KEY },
        });

        // Reverte para plano Free no banco
        await supabase
          .from("subscriptions")
          .update({ status: "CANCELLED", plan_id: "free" })
          .eq("asaas_subscription_id", grace.asaas_subscription_id);

        // Reverte user_type para client
        await supabase
          .from("profiles")
          .update({ user_type: "client" })
          .eq("user_id", grace.user_id);

        await notifyUser(
          supabase, grace.user_id,
          "❌ Plano Cancelado",
          "Não conseguimos renovar seu plano após várias tentativas. Seu acesso foi revertido para o plano gratuito. Assine novamente a qualquer momento.",
          "warning"
        );
        await notifyAdmin(supabase, "❌ Assinatura Cancelada",
          `Plano cancelado após 7 dias sem pagamento. Usuário revertido para Free.`,
          "warning", "/admin/users"
        );
        results.push({ grace_id: grace.id, outcome: "cancelled" });

      } else {
        // ❌ Tentativa falhou mas ainda há dias → agenda próxima
        const nextAttemptCount = grace.attempt_count + 1;
        const hoursFromStart = RETRY_SCHEDULE[nextAttemptCount];

        let nextAttemptAt: Date;
        if (hoursFromStart != null) {
          nextAttemptAt = new Date(new Date(grace.started_at).getTime() + hoursFromStart * 60 * 60 * 1000);
        } else {
          // Fallback: 24h a partir de agora
          nextAttemptAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        }

        await supabase
          .from("subscription_grace_periods")
          .update({
            attempt_count: nextAttemptCount,
            last_attempt_at: now.toISOString(),
            next_attempt_at: nextAttemptAt.toISOString(),
          })
          .eq("id", grace.id);

        // Notifica usuário sobre a falha desta tentativa
        const daysLeft = 7 - Math.floor((now.getTime() - new Date(grace.started_at).getTime()) / (24 * 60 * 60 * 1000));
        await notifyUser(
          supabase, grace.user_id,
          "⚠️ Tentativa de renovação falhou",
          `Não conseguimos cobrar a renovação do seu plano. Tentaremos novamente em breve. ${daysLeft > 0 ? `Você tem ${daysLeft} dia(s) antes do cancelamento.` : "Última tentativa amanhã."}`,
          "warning"
        );

        console.log(`[renewal-retry] Próxima tentativa agendada para ${nextAttemptAt.toISOString()} | motivo: ${asaasError}`);
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
