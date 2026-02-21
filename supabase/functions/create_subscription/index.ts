import { serve } from "https://deno.land/std@0.192.0/http/server.ts";

serve(async (req) => {
  // 🔓 CORS
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
      value,
      holderName,
      number,
      expiryMonth,
      expiryYear,
      ccv,
      email,
      cpfCnpj,
      postalCode,
      addressNumber,
    } = body;

    // 🔎 Validação
    if (
      !value ||
      !holderName ||
      !number ||
      !expiryMonth ||
      !expiryYear ||
      !ccv ||
      !email ||
      !cpfCnpj ||
      !postalCode ||
      !addressNumber
    ) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { "Access-Control-Allow-Origin": "*" },
        }
      );
    }

    const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY");

    if (!ASAAS_API_KEY) {
      return new Response(
        JSON.stringify({ error: "ASAAS_API_KEY not configured" }),
        {
          status: 500,
          headers: { "Access-Control-Allow-Origin": "*" },
        }
      );
    }

    // ===============================
    // 1️⃣ Criar cliente no Asaas
    // ===============================
    const customerResponse = await fetch(
      "https://api.asaas.com/v3/customers",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          access_token: ASAAS_API_KEY,
        },
        body: JSON.stringify({
          name: holderName,
          email: email,
          cpfCnpj: cpfCnpj,
          postalCode: postalCode,
          addressNumber: addressNumber,
        }),
      }
    );

    const customerData = await customerResponse.json();
    console.log("CUSTOMER RESPONSE:", customerData);

    if (!customerResponse.ok) {
      return new Response(JSON.stringify(customerData), {
        status: customerResponse.status,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    const customerId = customerData.id;

    // ===============================
    // 2️⃣ Criar assinatura
    // ===============================
    const subscriptionResponse = await fetch(
      "https://api.asaas.com/v3/subscriptions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          access_token: ASAAS_API_KEY,
        },
        body: JSON.stringify({
          customer: customerId,
          billingType: "CREDIT_CARD",
          value: value,
          cycle: "MONTHLY",
          description: "Plano Chamô",
          creditCard: {
            holderName: holderName,
            number: number,
            expiryMonth: expiryMonth,
            expiryYear: expiryYear,
            ccv: ccv,
          },
          creditCardHolderInfo: {
            name: holderName,
            email: email,
            cpfCnpj: cpfCnpj,
            postalCode: postalCode,
            addressNumber: addressNumber,
          },
        }),
      }
    );

    const subscriptionData = await subscriptionResponse.json();
    console.log("SUBSCRIPTION RESPONSE:", subscriptionData);

    return new Response(JSON.stringify(subscriptionData), {
      status: subscriptionResponse.status,
      headers: { "Access-Control-Allow-Origin": "*" },
    });

  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        message: error.message,
      }),
      {
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      }
    );
  }
});