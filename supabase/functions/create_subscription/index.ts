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
  userId,
  planId,
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
    const futureDate = new Date();
futureDate.setDate(futureDate.getDate() + 30);
const nextDueDate = futureDate.toISOString().split("T")[0];
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
          value: 5.50,
          cycle: "MONTHLY",
          nextDueDate: nextDueDate, // Definindo a próxima data de vencimento para 30 dias a partir de hoje
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
    // 🔹 Salvar assinatura no Supabase
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const saveResponse = await fetch(`${SUPABASE_URL}/rest/v1/subscriptions`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: SUPABASE_SERVICE_ROLE,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
    Prefer: "return=representation",
  },
  body: JSON.stringify({
    user_id: userId,
    plan_id: planId,
    status: "pending",
    asaas_subscription_id: subscriptionData.id,
    asaas_customer_id: customerId,
  }),
});

const saveData = await saveResponse.text();
console.log("SAVE RESPONSE:", saveData);

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