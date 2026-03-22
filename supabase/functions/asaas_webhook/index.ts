import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const WEBHOOK_TOKEN = Deno.env.get("ASAAS_WEBHOOK_TOKEN");
    const receivedToken = req.headers.get("asaas-access-token") ?? null;

    // Só exige token se você configurou ASAAS_WEBHOOK_TOKEN no Supabase
    if (WEBHOOK_TOKEN && WEBHOOK_TOKEN.length > 0) {
      if (receivedToken !== WEBHOOK_TOKEN) {
        console.error("❌ Webhook: token recebido não confere com ASAAS_WEBHOOK_TOKEN.");
        return new Response("Unauthorized", { status: 401 });
      }
    }
    // Se não configurou token no Supabase, aceita (Asaas pode não enviar header)

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
        .select("id, request_id, client_id, total_amount, status")
        .eq("asaas_payment_id", payment.id)
        .maybeSingle();

      if (tx && tx.status !== "completed") {
        // 1a. Atualiza status da transação
        const { error: updErr } = await supabase
          .from("transactions")
          .update({ status: "completed" })
          .eq("id", tx.id);

        if (updErr) console.error("Transaction update error:", updErr);
        else console.log("Transaction updated to completed:", payment.id);

        // 1b. Insere mensagem de confirmação no chat (frontend Realtime a detecta em tempo real)
        if (tx.request_id && tx.client_id) {
          const totalStr = Number(tx.total_amount).toFixed(2).replace(".", ",");
          const confirmContent = `✅ PAGAMENTO CONFIRMADO\nValor Pago: R$ ${totalStr}\nMétodo: PIX`;

          const { error: msgErr } = await supabase
            .from("chat_messages")
            .insert({
              request_id: tx.request_id,
              sender_id: tx.client_id,
              content: confirmContent,
            });

          if (msgErr) console.error("chat_messages insert error:", msgErr);
          else console.log("Mensagem de confirmação inserida no chat:", tx.request_id);

          // 1c. Notificações
          await supabase.from("notifications").insert({
            user_id: tx.client_id,
            title: "✅ Pagamento Confirmado",
            message: `Seu pagamento via PIX de R$ ${totalStr} foi confirmado.`,
            type: "success",
            link: `/messages/${tx.request_id}`,
          });

          // Busca o professional user_id para notificá-lo
          if (tx.client_id) {
            const { data: txFull } = await supabase
              .from("transactions")
              .select("professional_id")
              .eq("id", tx.id)
              .maybeSingle();

            if (txFull?.professional_id) {
              const { data: pro } = await supabase
                .from("professionals")
                .select("user_id")
                .eq("id", txFull.professional_id)
                .maybeSingle();

              if (pro?.user_id) {
                await supabase.from("notifications").insert({
                  user_id: pro.user_id,
                  title: "💰 Pagamento Recebido!",
                  message: `Você recebeu um pagamento via PIX de R$ ${totalStr}.`,
                  type: "success",
                  link: `/messages/${tx.request_id}`,
                });
              }

              // Busca dados fiscais do profissional para verificar antecipação
              const { data: fiscal } = await supabase
                .from("professional_fiscal_data")
                .select("anticipation_enabled, payment_method")
                .eq("professional_id", txFull.professional_id)
                .maybeSingle();

              // Busca configurações de prazo de repasse e taxas
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
              const paymentMethod = fiscal?.payment_method || "pix";
              const grossAmount = Number(tx.total_amount);

              // Calcula comissão e taxa de transação separadamente
              const commissionPct = settingsMap["commission_pct"] ?? 10;
              let paymentFeePct = 0;
              let paymentFeeFixed = 0;
              if (paymentMethod === "pix") {
                paymentFeePct  = settingsMap["pix_fee_pct"] ?? 0;
                paymentFeeFixed = settingsMap["pix_fee_fixed"] ?? 0;
              } else {
                paymentFeePct  = settingsMap["card_fee_pct"] ?? 0;
                paymentFeeFixed = settingsMap["card_fee_fixed"] ?? 0;
              }
              const commissionFeeCalc = Number((grossAmount * commissionPct / 100).toFixed(2));
              const paymentFeeCalc    = Number((grossAmount * paymentFeePct / 100 + paymentFeeFixed).toFixed(2));

              // Usa professional_net da transactions se disponível (já calculado pelo create_payment)
              const { data: txDetail } = await supabase
                .from("transactions")
                .select("professional_net, platform_fee")
                .eq("id", tx.id)
                .maybeSingle();

              // professional_net = gross - commission - payment_fee
              const professionalNet = txDetail?.professional_net != null
                ? Number(txDetail.professional_net)
                : Number((grossAmount - commissionFeeCalc - paymentFeeCalc).toFixed(2));

              // Decompõe platform_fee do banco (commission + payment) em partes
              const totalStoredFee = txDetail?.platform_fee != null ? Number(txDetail.platform_fee) : (commissionFeeCalc + paymentFeeCalc);
              // Se create_payment não tinha payment_fee, tenta estimar a partir das configs atuais
              const paymentFeeAmount  = paymentFeeCalc;
              const commissionAmount  = Number((totalStoredFee - paymentFeeAmount).toFixed(2));

              // Calcula taxa de antecipação (só em cartão)
              let anticipationFeeAmount = 0;
              if (anticipationEnabled && paymentMethod !== "pix") {
                const anticipationFeePct = settingsMap["anticipation_fee_pct"] || 15;
                anticipationFeeAmount = Number((professionalNet * anticipationFeePct / 100).toFixed(2));
              }

              const netAmount = Number((professionalNet - anticipationFeeAmount).toFixed(2));

              // Calcula quando fica disponível para repasse
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

              // Registra na carteira do profissional
              const { error: walletErr } = await supabase.from("wallet_transactions").insert({
                professional_id: txFull.professional_id,
                transaction_id: tx.id,
                gross_amount: grossAmount,
                platform_fee_amount: commissionAmount,   // só comissão
                payment_fee_amount: paymentFeeAmount,    // taxa Asaas/gateway
                anticipation_fee_amount: anticipationFeeAmount,
                amount: netAmount,
                payment_method: paymentMethod,
                anticipation_enabled: anticipationEnabled,
                description: `Serviço recebido via ${paymentMethod === "pix" ? "PIX" : "Cartão"}`,
                status: "pending",
                available_at: availableAt.toISOString(),
              });
              if (walletErr) console.error("wallet_transactions insert error:", walletErr);
              else console.log("Carteira atualizada para profissional:", txFull.professional_id, "| Líquido:", netAmount);
            }
          }
        }
      } else if (!tx) {
        // Pagamento avulso sem transação encontrada (fallback antigo)
        const { error: updErr } = await supabase
          .from("transactions")
          .update({ status: "completed" })
          .eq("asaas_payment_id", payment.id);
        if (updErr) console.error("Transaction fallback update error:", updErr);
        else console.log("Transaction (fallback) updated:", payment.id);
      }

      // 2. NOVA MÁGICA: Se o pagamento for de uma ASSINATURA, libera o plano na hora!
      if (payment.subscription) {
        const asaasSubscriptionId = payment.subscription;

        // Busca qual usuário é o dono dessa assinatura na Chamô
        const { data: subData, error: subError } = await supabase
          .from("subscriptions")
          .select("user_id, plan_id, status")
          .eq("asaas_subscription_id", asaasSubscriptionId)
          .single();

        if (!subError && subData) {
          const userId = subData.user_id;

          // Só ativa e notifica se ainda não estiver ACTIVE
          if (subData.status !== "ACTIVE") {
            await supabase
              .from("subscriptions")
              .update({ status: "ACTIVE" })
              .eq("user_id", userId);

            // Atualiza user_type de acordo com o plano
            const newUserType = subData.plan_id === "business" ? "company" : "professional";
            await supabase.from("profiles").update({ user_type: newUserType }).eq("user_id", userId);

            // Manda a notificação avisando que o plano está liberado
            await supabase.from("notifications").insert({
              user_id: userId,
              title: "🚀 Plano ativado!",
              message: `Seu pagamento foi aprovado e os benefícios do seu plano já estão disponíveis!`,
              type: "success",
              link: "/subscriptions",
            });

            console.log(`✅ Assinatura ${asaasSubscriptionId} ativada automaticamente para o usuário ${userId} (${newUserType})`);
          }
        } else {
          console.error("Assinatura não encontrada no banco da Chamô para o ID:", asaasSubscriptionId);
        }
      }
    }

    // ===============================
    // SUBSCRIPTION UPDATED (Backup do Asaas)
    // ===============================
    if (event === "SUBSCRIPTION_UPDATED") {
      const subscription = body.subscription;

      await supabase
        .from("subscriptions")
        .update({ status: subscription.status })
        .eq("asaas_subscription_id", subscription.id);

      console.log("Subscription updated via event:", subscription.id);
    }

    // Sempre retorna 200 pro Asaas parar de insistir
    return new Response("OK", { status: 200 });

  } catch (error: any) {
    console.error("Webhook error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});