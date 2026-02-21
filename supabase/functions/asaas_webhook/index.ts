import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const WEBHOOK_TOKEN = Deno.env.get("ASAAS_WEBHOOK_TOKEN");

    const receivedToken = req.headers.get("asaas-access-token");

    if (!WEBHOOK_TOKEN || receivedToken !== WEBHOOK_TOKEN) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await req.json();
    console.log("ASAAS EVENT:", body);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const event = body.event;

    // ===============================
    // PIX PAYMENT RECEIVED
    // ===============================
    if (event === "PAYMENT_RECEIVED") {
      const payment = body.payment;

      await supabase
        .from("transactions")
        .update({ status: "paid" })
        .eq("asaas_payment_id", payment.id);

      console.log("Transaction updated to PAID:", payment.id);
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

      console.log("Subscription updated:", subscription.id);
    }

    return new Response("OK", { status: 200 });

  } catch (error: any) {
    console.error("Webhook error:", error.message);

    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500 }
    );
  }
});