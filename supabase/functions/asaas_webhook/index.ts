import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const WEBHOOK_TOKEN = Deno.env.get("ASAAS_WEBHOOK_TOKEN");
    const receivedToken = req.headers.get("asaas-access-token");

    // Log para te ajudar a debugar se o token bater ou não
    if (receivedToken !== WEBHOOK_TOKEN) {
      console.error("❌ Erro de Autenticação: Token recebido não confere com o salvo no Supabase.");
      return new Response("Unauthorized", { status: 401 });
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

      // 1. Lógica Antiga: Atualiza pagamentos avulsos (se existirem na tabela transactions)
      await supabase
        .from("transactions")
        .update({ status: "paid" })
        .eq("asaas_payment_id", payment.id);

      console.log("Transaction updated to PAID:", payment.id);

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

            // Manda a notificação avisando que o Pix caiu e o plano tá liberado
            await supabase.from("notifications").insert({
              user_id: userId,
              title: "Pagamento Confirmado! 🚀",
              message: `Seu pagamento foi aprovado e seu plano pago está ativo e pronto para uso!`,
              type: "success",
              link: "/subscriptions",
            });

            console.log(`✅ Assinatura ${asaasSubscriptionId} ativada automaticamente para o usuário ${userId}`);
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