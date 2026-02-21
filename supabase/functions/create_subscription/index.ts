import { serve } from "https://deno.land/std@0.192.0/http/server.ts";

serve(async (req) => {

  // ===== CORS =====
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  try {
    const body = await req.json();
console.log("BODY RECEIVED:", body);
    const {
      plan_id,
      credit_card,
      credit_card_holder_info,
    } = body;

    if (!plan_id || !credit_card || !credit_card_holder_info) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { "Access-Control-Allow-Origin": "*" },
        }
      );
    }

    // ⚠️ AQUI VOCÊ PRECISA DEFINIR O VALOR DO PLANO
    // Temporariamente vamos fixar para teste:
    const planValue = 39.9; 

    // ⚠️ IMPORTANTE:
    // Você precisa ter criado o customer antes no Asaas
    // Aqui estamos usando cpfCnpj como exemplo
    const customerId = credit_card_holder_info.cpf_cnpj;

    const response = await fetch("https://api.asaas.com/v3/subscriptions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "access_token": Deno.env.get("ASAAS_API_KEY")!,
      },
      body: JSON.stringify({
        customer: customerId,
        billingType: "CREDIT_CARD",
        value: planValue,
        cycle: "MONTHLY",
        description: `Plano ${plan_id}`,
        creditCard: {
          holderName: credit_card.holder_name,
          number: credit_card.number,
          expiryMonth: credit_card.expiry_month,
          expiryYear: credit_card.expiry_year,
          ccv: credit_card.cvv,
        },
        creditCardHolderInfo: credit_card_holder_info,
      }),
    });

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { "Access-Control-Allow-Origin": "*" },
    });

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      }
    );
  }
});