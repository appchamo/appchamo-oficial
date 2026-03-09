import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ===============================
// 🔁 Ambiente Asaas (Sandbox / Produção)
// ===============================
const ASAAS_ENV = Deno.env.get("ASAAS_ENV") ?? "sandbox";

const ASAAS_BASE_URL =
  ASAAS_ENV === "production"
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";

const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY");

// ===============================
// 🚀 Edge Function
// ===============================
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
      phone,
    } = body;

    // ===============================
    // 🔐 Validar JWT (verify_jwt=false no gateway; validamos aqui)
    // ===============================
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Token de autenticação ausente." }),
        { status: 401, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }
    const token = authHeader.slice(7);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Token inválido ou expirado. Faça login novamente." }),
        { status: 401, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }
    if (user.id !== userId) {
      return new Response(
        JSON.stringify({ error: "Não autorizado a criar assinatura para este usuário." }),
        { status: 403, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    // ===============================
    // 🔎 Validação básica
    // ===============================
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
      !addressNumber ||
      !userId ||
      !planId
    ) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { "Access-Control-Allow-Origin": "*" },
        }
      );
    }

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
    // 🧠 Supabase Admin Client
    // ===============================
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ===============================
    // 1️⃣ Verificar se já existe customer
    // ===============================
    const { data: profile } = await supabase
      .from("profiles")
      .select("asaas_customer_id")
      .eq("user_id", userId)
      .single();

    let customerId = profile?.asaas_customer_id;

    // Se NÃO existir → cria
    if (!customerId) {
      const customerResponse = await fetch(
        `${ASAAS_BASE_URL}/customers`,
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

      if (!customerResponse.ok) {
        return new Response(JSON.stringify(customerData), {
          status: customerResponse.status,
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      }

      customerId = customerData.id;

      // Salvar no profile
      await supabase
        .from("profiles")
        .update({ asaas_customer_id: customerId })
        .eq("user_id", userId);
    }

    // ===============================
    // 2️⃣ Criar assinatura com Lógica Inteligente
    // ===============================
    const skipAnalysisEmail = "testes@appchamo.com";
    const skipAnalysis = email?.toLowerCase() === skipAnalysisEmail;

    let nextDueDate: string;
    let initialStatus: string;

    if (planId === "pro" || skipAnalysis) {
      // PRO ou usuário de teste: ativo na hora, sem análise no admin
      nextDueDate = new Date().toISOString().split("T")[0];
      initialStatus = "ACTIVE";
    } else {
      // VIP/BUSINESS: Agenda para 30 dias e fica aguardando aprovação
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      nextDueDate = futureDate.toISOString().split("T")[0];
      initialStatus = "PENDING";
    }
    
    console.log("CUSTOMER ID ENVIADO:", customerId);
    
    const subscriptionResponse = await fetch(
      `${ASAAS_BASE_URL}/subscriptions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          access_token: ASAAS_API_KEY,
        },
        body: JSON.stringify({
          customer: customerId,
          billingType: "CREDIT_CARD",
          value: Number(value),
          cycle: "MONTHLY",
          nextDueDate: nextDueDate,
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
            phone: phone,
          },
        }),
      }
    );

    const subscriptionData = await subscriptionResponse.json();
    console.log("SUBSCRIPTION DATA:", subscriptionData);

    if (!subscriptionResponse.ok) {
      return new Response(JSON.stringify(subscriptionData), {
        status: subscriptionResponse.status,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    // ===============================
    // 3️⃣ Salvar assinatura no banco
    // ===============================
    const { error: saveError } = await supabase
      .from("subscriptions")
      .upsert(
        {
          user_id: userId,
          plan_id: planId,
          status: initialStatus, // Aplica a nossa variável inteligente
          asaas_subscription_id: subscriptionData.id,
          asaas_customer_id: customerId,
          started_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (saveError) {
      console.log("SAVE ERROR:", saveError);
    }

    return new Response(JSON.stringify(subscriptionData), {
      status: subscriptionResponse.status,
      headers: { "Access-Control-Allow-Origin": "*" },
    });

  } catch (error: any) {
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