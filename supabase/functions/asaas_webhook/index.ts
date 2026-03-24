import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Helper: busca user_id do admin principal ────────────────────────────────
async function getAdminId(supabase: any): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("email", "admin@appchamo.com")
    .maybeSingle();
  return data?.user_id ?? null;
}

// ─── Helper: notifica o admin com dedup (evita duplicata no mesmo dia) ───────
async function notifyAdmin(supabase: any, title: string, message: string, type: string, link: string) {
  const adminId = await getAdminId(supabase);
  if (!adminId) return;
  await supabase.from("notifications").insert({
    user_id: adminId,
    title,
    message,
    type,
    link,
    read: false,
  });
}

serve(async (req) => {
  try {
    const WEBHOOK_TOKEN = Deno.env.get("ASAAS_WEBHOOK_TOKEN");
    const receivedToken = req.headers.get("asaas-access-token") ?? null;

    if (WEBHOOK_TOKEN && WEBHOOK_TOKEN.length > 0) {
      if (receivedToken !== WEBHOOK_TOKEN) {
        console.error("❌ Webhook: token recebido não confere com ASAAS_WEBHOOK_TOKEN.");
        return new Response("Unauthorized", { status: 401 });
      }
    }

    const body = await req.json();
    console.log("ASAAS EVENT:", body.event);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const event = body.event;

    // ===============================
    // PIX / CARTÃO RECEBIDO OU CONFIRMADO
    // ===============================
    if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
      const payment = body.payment;

      // 1. Busca a transação pelo payment_id do Asaas
      const { data: tx } = await supabase
        .from("transactions")
        .select("id, request_id, client_id, total_amount, original_amount, status")
        .eq("asaas_payment_id", payment.id)
        .maybeSingle();

      if (tx) {
        // 1a. Atualiza status da transação (idempotente)
        if (tx.status !== "completed") {
          const { error: updErr } = await supabase
            .from("transactions")
            .update({ status: "completed" })
            .eq("id", tx.id);
          if (updErr) console.error("Transaction update error:", updErr);
          else console.log("Transaction updated to completed:", payment.id);
        } else {
          console.log("Transaction already completed (polling beat webhook):", payment.id);
        }

        // 1b. Chat e wallet
        if (tx.request_id && tx.client_id) {
          const totalStr = Number(tx.total_amount).toFixed(2).replace(".", ",");

          if (tx.client_id) {
            const { data: txFull } = await supabase
              .from("transactions")
              .select("professional_id, professional_net, original_amount")
              .eq("id", tx.id)
              .maybeSingle();

            // Detecta método de pagamento a partir do evento Asaas
            const asaasBillingType = String(payment.billingType || "PIX").toUpperCase();
            const isCardPayment = asaasBillingType === "CREDIT_CARD" || asaasBillingType === "DEBIT_CARD";
            const methodLabel = isCardPayment ? "Cartão" : "PIX";

            // "Valor Pago" do ponto de vista do profissional = valor original sem desconto de cupom
            const originalAmountForPro = Number(txFull?.original_amount || tx.total_amount);
            const originalStr = originalAmountForPro.toFixed(2).replace(".", ",");

            const professionalNetStr = txFull?.professional_net
              ? Number(txFull.professional_net).toFixed(2).replace(".", ",")
              : null;

            const confirmContent = professionalNetStr
              ? `✅ PAGAMENTO CONFIRMADO\nValor Pago: R$ ${originalStr}\nMétodo: ${methodLabel}\nRecebe: R$ ${professionalNetStr}`
              : `✅ PAGAMENTO CONFIRMADO\nValor Pago: R$ ${originalStr}\nMétodo: ${methodLabel}`;

            // Verifica se mensagem de confirmação já existe (evita duplicata entre PAYMENT_RECEIVED e PAYMENT_CONFIRMED)
            const { data: existingMsg } = await supabase
              .from("chat_messages")
              .select("id")
              .eq("request_id", tx.request_id)
              .like("content", "✅ PAGAMENTO CONFIRMADO%")
              .maybeSingle();

            if (existingMsg) {
              console.log("Mensagem de confirmação já existe no chat:", tx.request_id, "— skipping");
            } else {
              const { error: msgErr } = await supabase
                .from("chat_messages")
                .insert({
                  request_id: tx.request_id,
                  sender_id: tx.client_id,
                  content: confirmContent,
                });
              if (msgErr) console.error("chat_messages insert error:", msgErr);
              else console.log("Mensagem de confirmação inserida no chat:", tx.request_id);
            }

            // Avatares
            let clientAvatar: string | null = null;
            let proAvatar: string | null = null;
            let proUserId: string | null = null;

            const { data: clientProfile } = await supabase
              .from("profiles")
              .select("avatar_url, full_name")
              .eq("user_id", tx.client_id)
              .maybeSingle();
            clientAvatar = (clientProfile as any)?.avatar_url ?? null;
            const clientName: string = (clientProfile as any)?.full_name ?? "Cliente";

            if (txFull?.professional_id) {
              const { data: pro } = await supabase
                .from("professionals")
                .select("user_id")
                .eq("id", txFull.professional_id)
                .maybeSingle();
              if (pro?.user_id) {
                proUserId = pro.user_id;
                const { data: proProfile } = await supabase
                  .from("profiles")
                  .select("avatar_url, full_name")
                  .eq("user_id", pro.user_id)
                  .maybeSingle();
                proAvatar = (proProfile as any)?.avatar_url ?? null;
              }
            }

            // Notificação ao cliente
            await supabase.from("notifications").insert({
              user_id: tx.client_id,
              title: "✅ Pagamento Confirmado",
              message: `Seu pagamento via ${methodLabel} de R$ ${originalStr} foi confirmado.`,
              type: "success",
              link: `/messages/${tx.request_id}`,
              image_url: proAvatar,
            } as any);

            if (proUserId) {
              const proMsg = professionalNetStr
                ? `Você vai receber R$ ${professionalNetStr} via ${methodLabel} (líquido após taxas).`
                : `Você recebeu um pagamento via ${methodLabel} de R$ ${originalStr}.`;
              await supabase.from("notifications").insert({
                user_id: proUserId,
                title: "💰 Pagamento Recebido!",
                message: proMsg,
                type: "success",
                link: `/messages/${tx.request_id}`,
                image_url: clientAvatar,
              } as any);

              // ── Notificação admin: nova transação ──
              await notifyAdmin(
                supabase,
                "💳 Nova Transação",
                `${clientName} realizou um pagamento de R$ ${totalStr}.`,
                "transaction",
                "/admin/wallet"
              );

              // Busca dados fiscais
              const { data: fiscal } = await supabase
                .from("professional_fiscal_data")
                .select("anticipation_enabled, payment_method")
                .eq("professional_id", txFull.professional_id)
                .maybeSingle();

              const { data: settings } = await supabase
                .from("platform_settings")
                .select("key, value")
                .in("key", [
                  "transfer_period_pix_hours", "transfer_period_card_days",
                  "transfer_period_card_anticipated_days", "anticipation_fee_pct",
                  "commission_pct", "pix_fee_pct", "pix_fee_fixed",
                  "card_fee_pct", "card_fee_fixed",
                ]);

              const settingsMap: Record<string, number> = {};
              (settings || []).forEach((s: any) => { settingsMap[s.key] = parseFloat(s.value) || 0; });

              const anticipationEnabled = fiscal?.anticipation_enabled || false;
              // Método de pagamento: detecta pelo billingType do Asaas (mais confiável)
              const asaasBillingTypeWallet = String(payment.billingType || "PIX").toUpperCase();
              const paymentMethod = (asaasBillingTypeWallet === "CREDIT_CARD" || asaasBillingTypeWallet === "DEBIT_CARD") ? "card" : "pix";

              // Sempre usar o valor ORIGINAL do serviço (sem desconto de cupom)
              // O profissional não deve ser penalizado pelo desconto dado pela plataforma
              const grossAmount = Number(txFull?.original_amount || tx.original_amount || tx.total_amount);

              const commissionPct = settingsMap["commission_pct"] ?? 10;
              let paymentFeePct = 0;
              let paymentFeeFixed = 0;
              if (paymentMethod === "pix") {
                paymentFeePct   = settingsMap["pix_fee_pct"] ?? 0;
                paymentFeeFixed = settingsMap["pix_fee_fixed"] ?? 0;
              } else {
                paymentFeePct   = settingsMap["card_fee_pct"] ?? 0;
                paymentFeeFixed = settingsMap["card_fee_fixed"] ?? 0;
              }

              // Recalcula sempre a partir do valor original (ignora professional_net armazenado que pode estar errado)
              const commissionFeeCalc = Number((grossAmount * commissionPct / 100).toFixed(2));
              const paymentFeeCalc    = Number((grossAmount * paymentFeePct / 100 + paymentFeeFixed).toFixed(2));
              const professionalNet   = Number((grossAmount - commissionFeeCalc - paymentFeeCalc).toFixed(2));

              let anticipationFeeAmount = 0;
              if (anticipationEnabled && paymentMethod !== "pix") {
                // Antecipação calculada sobre o valor BRUTO (igual ao formulário de cobrança do app)
                const anticipationFeePct = settingsMap["anticipation_fee_pct"] ?? 0;
                anticipationFeeAmount = Number((grossAmount * anticipationFeePct / 100).toFixed(2));
                console.log(`Antecipação: ${anticipationFeePct}% sobre R$${grossAmount} = R$${anticipationFeeAmount}`);
              }

              const netAmount = Number((grossAmount - commissionFeeCalc - paymentFeeCalc - anticipationFeeAmount).toFixed(2));

              let availableAt = new Date();
              if (paymentMethod === "pix") {
                const hours = settingsMap["transfer_period_pix_hours"] || 12;
                availableAt = new Date(Date.now() + hours * 60 * 60 * 1000);
              } else if (anticipationEnabled) {
                const days = settingsMap["transfer_period_card_anticipated_days"] || 7;
                availableAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
              } else {
                const days = settingsMap["transfer_period_card_days"] || 32;
                availableAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
              }

              console.log(`Wallet: grossAmount=${grossAmount}, commission=${commissionFeeCalc}, paymentFee=${paymentFeeCalc}, net=${professionalNet}, anticipation=${anticipationFeeAmount}, final=${netAmount}`);

              // Upsert: cria ou atualiza registro (para corrigir valores calculados incorretamente antes)
              const { error: walletErr } = await supabase.from("wallet_transactions").upsert({
                professional_id: txFull.professional_id,
                transaction_id: tx.id,
                gross_amount: grossAmount,
                platform_fee_amount: commissionFeeCalc,
                payment_fee_amount: paymentFeeCalc,
                anticipation_fee_amount: anticipationFeeAmount,
                amount: netAmount,
                payment_method: paymentMethod,
                anticipation_enabled: anticipationEnabled,
                description: `Serviço recebido via ${paymentMethod === "pix" ? "PIX" : "Cartão"}`,
                status: "pending",
                available_at: availableAt.toISOString(),
              }, { onConflict: "transaction_id", ignoreDuplicates: false });
              if (walletErr) console.error("wallet_transactions upsert error:", walletErr);
              else console.log("Carteira atualizada para profissional:", txFull.professional_id, "| Líquido:", netAmount);
            }
          }
        }
    } else {
      console.log("No transaction found for payment:", payment.id, "— may be a subscription payment");
    }

      // 2. Pagamento de PATROCINADOR (compra única PIX ou CC)
      const { data: sponsorPayment } = await supabase
        .from("sponsor_payments")
        .select("id, sponsor_id, pack, status")
        .eq("asaas_payment_id", payment.id)
        .maybeSingle();

      if (sponsorPayment && sponsorPayment.status !== "active") {
        // Ativa o pacote: atualiza weekly_plan
        await supabase.from("sponsor_payments")
          .update({ status: "active" })
          .eq("id", sponsorPayment.id);
        await supabase.from("sponsors")
          .update({ weekly_plan: sponsorPayment.pack })
          .eq("id", sponsorPayment.sponsor_id);

        const { data: sp } = await supabase
          .from("sponsors")
          .select("user_id")
          .eq("id", sponsorPayment.sponsor_id)
          .maybeSingle();
        if (sp?.user_id) {
          const packLabel = sponsorPayment.pack === "pack_28" ? "28 novidades/semana" : "14 novidades/semana";
          await supabase.from("notifications").insert({
            user_id: sp.user_id,
            title: "🎉 Pacote ativado!",
            message: `Seu pacote de ${packLabel} foi ativado com sucesso!`,
            type: "success",
            link: "/sponsor/dashboard",
          });
        }
        console.log("✅ Sponsor pack activated via webhook:", sponsorPayment.sponsor_id);
      }

      // 3. Se o pagamento for de uma ASSINATURA de profissional
      if (payment.subscription) {
        const asaasSubscriptionId = payment.subscription;

        const { data: subData, error: subError } = await supabase
          .from("subscriptions")
          .select("user_id, plan_id, status")
          .eq("asaas_subscription_id", asaasSubscriptionId)
          .single();

        if (!subError && subData) {
          const userId = subData.user_id;

          // Resolve carência caso existisse
          await supabase
            .from("subscription_grace_periods")
            .update({ status: "resolved", resolved_at: new Date().toISOString() })
            .eq("asaas_subscription_id", asaasSubscriptionId)
            .eq("status", "active");

          if (subData.status !== "ACTIVE") {
            await supabase
              .from("subscriptions")
              .update({ status: "ACTIVE" })
              .eq("user_id", userId);

            const newUserType = subData.plan_id === "business" ? "company" : "professional";
            await supabase.from("profiles").update({ user_type: newUserType }).eq("user_id", userId);

            await supabase.from("notifications").insert({
              user_id: userId,
              title: "🚀 Plano ativado!",
              message: `Seu pagamento foi aprovado e os benefícios do seu plano já estão disponíveis!`,
              type: "success",
              link: "/subscriptions",
            });

            // ── Notificação admin: nova assinatura ──
            const { data: userProfile } = await supabase
              .from("profiles")
              .select("full_name")
              .eq("user_id", userId)
              .maybeSingle();
            const userName = (userProfile as any)?.full_name ?? "Profissional";
            const planLabel = subData.plan_id === "business" ? "Business" : subData.plan_id === "vip" ? "VIP" : "Pro";
            await notifyAdmin(
              supabase,
              "⭐ Nova Assinatura",
              `${userName} ativou o plano ${planLabel}.`,
              "subscription",
              "/admin/users"
            );

            console.log(`✅ Assinatura ${asaasSubscriptionId} ativada para ${userId}`);
          } else {
            // Renovação bem-sucedida de plano já ativo
            await supabase.from("notifications").insert({
              user_id: userId,
              title: "✅ Plano Renovado",
              message: `Seu plano foi renovado com sucesso! Acesso garantido por mais um mês.`,
              type: "success",
              link: "/subscriptions",
            });
            console.log(`✅ Assinatura ${asaasSubscriptionId} renovada com sucesso para ${userId}`);
          }
        } else {
          console.error("Assinatura não encontrada para:", asaasSubscriptionId);
        }
      }
    }

    // ===============================
    // PAGAMENTO VENCIDO → inicia carência de 7 dias
    // ===============================
    if (event === "PAYMENT_OVERDUE") {
      const payment = body.payment;

      if (payment.subscription) {
        const asaasSubscriptionId = payment.subscription;

        const { data: subData } = await supabase
          .from("subscriptions")
          .select("user_id, plan_id")
          .eq("asaas_subscription_id", asaasSubscriptionId)
          .maybeSingle();

        if (subData?.user_id) {
          const userId = subData.user_id;

          // Verifica se já existe carência ativa para esta assinatura
          const { data: existing } = await supabase
            .from("subscription_grace_periods")
            .select("id")
            .eq("asaas_subscription_id", asaasSubscriptionId)
            .eq("status", "active")
            .maybeSingle();

          if (!existing) {
            const now = new Date();
            // Próxima tentativa: dia 2 (26h depois)
            const nextAttempt = new Date(now.getTime() + 26 * 60 * 60 * 1000);

            await supabase.from("subscription_grace_periods").insert({
              user_id: userId,
              asaas_subscription_id: asaasSubscriptionId,
              asaas_payment_id: payment.id,
              attempt_count: 1,
              started_at: now.toISOString(),
              last_attempt_at: now.toISOString(),
              next_attempt_at: nextAttempt.toISOString(),
              status: "active",
            });

            // Notifica o usuário sobre a falha
            await supabase.from("notifications").insert({
              user_id: userId,
              title: "⚠️ Falha na renovação do plano",
              message: "Não conseguimos cobrar a renovação do seu plano. Verifique seu cartão. Você tem 7 dias antes do cancelamento.",
              type: "warning",
              link: "/subscriptions",
            });

            // Notifica admin
            const { data: userProfile } = await supabase
              .from("profiles")
              .select("full_name")
              .eq("user_id", userId)
              .maybeSingle();
            const userName = (userProfile as any)?.full_name ?? "Profissional";
            await notifyAdmin(
              supabase,
              "⚠️ Falha de Renovação",
              `Falha ao renovar plano de ${userName}. Carência de 7 dias iniciada.`,
              "warning",
              "/admin/users"
            );

            console.log(`⚠️ Carência iniciada para ${userId} (assinatura: ${asaasSubscriptionId})`);
          } else {
            console.log("Carência já ativa para:", asaasSubscriptionId);
          }
        }
      }
    }

    // ===============================
    // SUBSCRIPTION UPDATED
    // ===============================
    if (event === "SUBSCRIPTION_UPDATED") {
      const subscription = body.subscription;

      await supabase
        .from("subscriptions")
        .update({ status: subscription.status })
        .eq("asaas_subscription_id", subscription.id);

      console.log("Subscription updated via event:", subscription.id);
    }

    return new Response("OK", { status: 200 });

  } catch (error: any) {
    console.error("Webhook error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
