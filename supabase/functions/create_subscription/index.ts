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
      postalCode: bodyPostal,
      addressNumber: bodyAddrNum,
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

    const jsonHeaders = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    };

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: profileRow } = await supabaseAdmin
      .from("profiles")
      .select("address_zip, address_number, phone, email, asaas_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    const postalCode =
      String(bodyPostal ?? "")
        .replace(/\D/g, "")
        .slice(0, 8) ||
      String(profileRow?.address_zip ?? "")
        .replace(/\D/g, "")
        .slice(0, 8);
    const addressNumber =
      String(bodyAddrNum ?? "").trim() ||
      String(profileRow?.address_number ?? "").trim();
    const phoneEffective =
      String(phone ?? "").replace(/\D/g, "") ||
      String(profileRow?.phone ?? "").replace(/\D/g, "");
    const emailEffective =
      String(email ?? "").trim() ||
      String(profileRow?.email ?? "").trim() ||
      String(user.email ?? "").trim();

    // ===============================
    // 🔎 Validação básica
    // ===============================
    const missing: string[] = [];
    if (!value) missing.push("value");
    if (!holderName) missing.push("holderName");
    if (!number || String(number).replace(/\s/g, "").length < 13) missing.push("number");
    if (!expiryMonth) missing.push("expiryMonth");
    if (!expiryYear) missing.push("expiryYear");
    if (!ccv) missing.push("ccv");
    if (!emailEffective) missing.push("email");
    if (!cpfCnpj || String(cpfCnpj).replace(/\D/g, "").length < 11) missing.push("cpfCnpj");
    if (!postalCode || postalCode.length !== 8) missing.push("postalCode");
    if (!addressNumber) missing.push("addressNumber");
    if (!userId) missing.push("userId");
    if (!planId) missing.push("planId");

    if (missing.length > 0) {
      const hint =
        missing.includes("postalCode") || missing.includes("addressNumber")
          ? " Informe CEP (8 dígitos) e número do endereço no perfil ou no formulário de assinatura."
          : "";
      return new Response(
        JSON.stringify({
          error: `Dados incompletos para o pagamento.${hint}`,
          missing,
        }),
        { status: 400, headers: jsonHeaders }
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

    const supabase = supabaseAdmin;

    // ===============================
    // 1️⃣ Verificar se já existe customer
    // ===============================
    let customerId = profileRow?.asaas_customer_id;

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
            email: emailEffective,
            cpfCnpj: String(cpfCnpj).replace(/\D/g, ""),
            postalCode,
            addressNumber,
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
    // 2️⃣ Criar assinatura — cobrança imediata para todos os planos
    // ===============================
    // Aprovação manual removida: todos os planos são cobrados e ativados na hora.
    const nextDueDate = new Date().toISOString().split("T")[0];
    const initialStatus = "ACTIVE";
    
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
            email: emailEffective,
            cpfCnpj: String(cpfCnpj).replace(/\D/g, ""),
            postalCode,
            addressNumber,
            phone: phoneEffective || undefined,
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
    // 3️⃣ Salvar assinatura no banco e atualizar tipo de usuário
    // ===============================
    const { error: saveError } = await supabase
      .from("subscriptions")
      .upsert(
        {
          user_id: userId,
          plan_id: planId,
          status: initialStatus,
          asaas_subscription_id: subscriptionData.id,
          asaas_customer_id: customerId,
          started_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (saveError) {
      console.log("SAVE ERROR:", saveError);
    }

    // Atualiza user_type: business → company; pro/vip → professional
    const newUserType = planId === "business" ? "company" : "professional";
    await supabase.from("profiles").update({ user_type: newUserType }).eq("user_id", userId);

    // Notifica o profissional que o plano está ativo
    await supabase.from("notifications").insert({
      user_id: userId,
      title: "🚀 Plano ativado!",
      message: `Seu plano foi ativado e os benefícios já estão disponíveis.`,
      type: "success",
      link: "/subscriptions",
    });

    // Notifica o admin sobre nova assinatura
    const { data: adminRow } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .eq("email", "admin@appchamo.com")
      .maybeSingle();
    if (adminRow?.user_id) {
      const { data: proProfile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", userId)
        .maybeSingle();
      const proName = (proProfile as any)?.full_name ?? "Profissional";
      const planLabel = planId === "business" ? "Business" : planId === "vip" ? "VIP" : "Pro";
      await supabase.from("notifications").insert({
        user_id: adminRow.user_id,
        title: "⭐ Nova Assinatura",
        message: `${proName} assinou o plano ${planLabel} (R$ ${value}/mês).`,
        type: "subscription",
        link: "/admin/users",
      });
    }

    try {
      const charge = Number(value);
      if (Number.isFinite(charge) && charge > 0) {
        await supabase.rpc("grant_referral_commission_on_paid_subscription", {
          p_subscriber_user_id: userId,
          p_charge_amount_brl: charge,
        });
      }
    } catch (refErr) {
      console.error("create_subscription referral commission:", refErr);
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