import { serve } from "https://deno.land/std@0.192.0/http/server.ts";

serve(async (req) => {
  try {
    const body = await req.json();

    const {
      customer,
      value,
      holderName,
      number,
      expiryMonth,
      expiryYear,
      ccv,
      email,
      cpfCnpj,
      postalCode,
      addressNumber
    } = body;

    if (!customer || !value) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400 }
      );
    }

    const response = await fetch("https://api.asaas.com/v3/subscriptions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "access_token": Deno.env.get("ASAAS_API_KEY")!
      },
      body: JSON.stringify({
        customer,
        billingType: "CREDIT_CARD",
        value,
        cycle: "MONTHLY",
        description: "Plano Chamô",
        creditCard: {
          holderName,
          number,
          expiryMonth,
          expiryYear,
          ccv
        },
        creditCardHolderInfo: {
          name: holderName,
          email,
          cpfCnpj,
          postalCode,
          addressNumber
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return new Response(JSON.stringify(data), {
        status: response.status
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200
    });

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500 }
    );
  }
});