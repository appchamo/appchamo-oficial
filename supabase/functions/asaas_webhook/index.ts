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