import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ASAAS_BASE_URL = Deno.env.get("ASAAS_ENV") === "production"
  ? "https://api.asaas.com/v3"
  : "https://sandbox.asaas.com/api/v3";

const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY")!;

function formatPhone(phone: string | null | undefined): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits.slice(2);
  if (digits.startsWith("0")) return digits.slice(1);
  if (digits.length >= 10 && digits.length <= 11) return digits;
  return undefined;
}

async function asaasRequest(path: string, method: string, body?: unknown) {
  const res = await fetch(`${ASAAS_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      access_token: ASAAS_API_KEY,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("Asaas error:", JSON.stringify(data));
    throw new Error(data.errors?.[0]?.description || "Asaas API error");
  }
  return data;
}

async function findOrCreateCustomer(
  supabase: ReturnType<typeof createClient>,
  userId: string
) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, cpf, cnpj, phone")
    .eq("user_id", userId)
    .single();

  if (!profile) throw new Error("Perfil não encontrado. Complete seu cadastro.");

  const cpfCnpj = profile.cnpj || profile.cpf;
  if (!cpfCnpj) throw new Error("Cadastre seu CPF ou CNPJ no perfil antes de realizar pagamentos.");

  const search = await asaasRequest(
    `/customers?cpfCnpj=${cpfCnpj.replace(/\D/g, "")}`,
    "GET"
  );

  if (search.data && search.data.length > 0) {
    return search.data[0].id;
  }

  const formattedPhone = formatPhone(profile.phone);
  console.log("Creating customer with phone:", profile.phone, "->", formattedPhone);
  const customerPayload: Record<string, unknown> = {
    name: profile.full_name,
    email: profile.email,
    cpfCnpj: cpfCnpj.replace(/\D/g, ""),
  };
  if (formattedPhone) customerPayload.mobilePhone = formattedPhone;
  const customer = await asaasRequest("/customers", "POST", customerPayload);

  return customer.id;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await callerClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action } = body;

    // ─── ACTION: tokenize_card_enterprise ───
    // Tokenize card for enterprise upgrade WITHOUT charging
    if (action === "tokenize_card_enterprise") {
      const { credit_card, credit_card_holder_info, cnpj } = body;
      if (!credit_card || !credit_card_holder_info || !cnpj) {
        throw new Error("credit_card, credit_card_holder_info and cnpj are required");
      }

      // Find or create customer using CNPJ
      const cleanCnpj = cnpj.replace(/\D/g, "");
      const search = await asaasRequest(`/customers?cpfCnpj=${cleanCnpj}`, "GET");
      
      let customerId: string;
      if (search.data && search.data.length > 0) {
        customerId = search.data[0].id;
      } else {
        const customer = await asaasRequest("/customers", "POST", {
          name: credit_card_holder_info.name,
          email: credit_card_holder_info.email,
          cpfCnpj: cleanCnpj,
          ...(formatPhone(credit_card_holder_info.phone) ? { mobilePhone: formatPhone(credit_card_holder_info.phone) } : {}),
        });
        customerId = customer.id;
      }

      // Use holder's personal CPF/CNPJ for creditCardHolderInfo (not company CNPJ)
      const holderCpfCnpj = credit_card_holder_info.cpf_cnpj
        ? credit_card_holder_info.cpf_cnpj.replace(/\D/g, "")
        : cleanCnpj;

      // Tokenize the credit card via Asaas
      const tokenResult = await asaasRequest("/creditCard/tokenize", "POST", {
        customer: customerId,
        creditCard: {
          holderName: credit_card.holder_name,
          number: credit_card.number.replace(/\s/g, ""),
          expiryMonth: credit_card.expiry_month,
          expiryYear: credit_card.expiry_year,
          ccv: credit_card.cvv,
        },
        creditCardHolderInfo: {
          name: credit_card_holder_info.name,
          email: credit_card_holder_info.email,
          cpfCnpj: holderCpfCnpj,
          postalCode: credit_card_holder_info.postal_code?.replace(/\D/g, ""),
          addressNumber: credit_card_holder_info.address_number,
          ...(formatPhone(credit_card_holder_info.phone) ? { phone: formatPhone(credit_card_holder_info.phone) } : {}),
        },
      });

      return new Response(
        JSON.stringify({
          success: true,
          customer_id: customerId,
          credit_card_token: tokenResult.creditCardToken,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── ACTION: activate_enterprise_subscription ───
    // Called by admin to charge and activate enterprise plan
    if (action === "activate_enterprise_subscription") {
      const { upgrade_request_id } = body;
      if (!upgrade_request_id) throw new Error("upgrade_request_id is required");

      // Get the upgrade request
      const { data: upgradeReq } = await supabase
        .from("enterprise_upgrade_requests")
        .select("*")
        .eq("id", upgrade_request_id)
        .single();
      if (!upgradeReq) throw new Error("Upgrade request not found");
      if (upgradeReq.status !== "pending") throw new Error("Request already processed");

      // Get business plan
      const { data: plan } = await supabase
        .from("plans")
        .select("*")
        .eq("id", "business")
        .single();
      if (!plan) throw new Error("Business plan not found");

      // Create subscription in Asaas using tokenized card
      const subscriptionPayload: Record<string, unknown> = {
        customer: upgradeReq.asaas_customer_id,
        billingType: "CREDIT_CARD",
        value: plan.price_monthly,
        nextDueDate: new Date().toISOString().split("T")[0],
        cycle: "MONTHLY",
        description: `Assinatura plano ${plan.name} - Chamô`,
        creditCardToken: upgradeReq.asaas_credit_card_token,
      };

      const asaasSub = await asaasRequest("/subscriptions", "POST", subscriptionPayload);

      // Update local subscription
      await supabase
        .from("subscriptions")
        .update({
          plan_id: "business",
          status: "active",
          started_at: new Date().toISOString(),
        })
        .eq("user_id", upgradeReq.user_id);

      // Update profile to company
      await supabase
        .from("profiles")
        .update({ 
          user_type: "company",
          cnpj: upgradeReq.cnpj,
          address_street: upgradeReq.address_street,
          address_number: upgradeReq.address_number,
          address_complement: upgradeReq.address_complement,
          address_neighborhood: upgradeReq.address_neighborhood,
          address_city: upgradeReq.address_city,
          address_state: upgradeReq.address_state,
          address_zip: upgradeReq.address_zip,
        })
        .eq("user_id", upgradeReq.user_id);

      // Mark upgrade request as approved
      await supabase
        .from("enterprise_upgrade_requests")
        .update({ status: "approved" })
        .eq("id", upgrade_request_id);

      // Notify user
      await supabase.from("notifications").insert({
        user_id: upgradeReq.user_id,
        title: "Plano Empresarial ativado! 🏢",
        message: "Sua assinatura empresarial foi aprovada e ativada com sucesso.",
        type: "approval",
        link: "/subscriptions",
      });

      return new Response(
        JSON.stringify({ success: true, subscription_id: asaasSub.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── ACTION: create_subscription_payment ───
    if (action === "create_subscription_payment") {
      const { plan_id, credit_card, credit_card_holder_info, installment_count } = body;
      if (!plan_id || !credit_card || !credit_card_holder_info) {
        throw new Error("plan_id, credit_card and credit_card_holder_info are required");
      }

      const { data: plan } = await supabase
        .from("plans")
        .select("*")
        .eq("id", plan_id)
        .single();
      if (!plan || plan.price_monthly <= 0) throw new Error("Invalid plan");

      const customerId = await findOrCreateCustomer(supabase, user.id);

      const subscriptionPayload: Record<string, unknown> = {
        customer: customerId,
        billingType: "CREDIT_CARD",
        value: plan.price_monthly,
        nextDueDate: new Date().toISOString().split("T")[0],
        cycle: "MONTHLY",
        description: `Assinatura plano ${plan.name} - Chamô`,
        creditCard: {
          holderName: credit_card.holder_name,
          number: credit_card.number.replace(/\s/g, ""),
          expiryMonth: credit_card.expiry_month,
          expiryYear: credit_card.expiry_year,
          ccv: credit_card.cvv,
        },
        creditCardHolderInfo: {
          name: credit_card_holder_info.name,
          email: credit_card_holder_info.email,
          cpfCnpj: credit_card_holder_info.cpf_cnpj?.replace(/\D/g, ""),
          postalCode: credit_card_holder_info.postal_code?.replace(/\D/g, ""),
          addressNumber: credit_card_holder_info.address_number,
          ...(formatPhone(credit_card_holder_info.phone) ? { phone: formatPhone(credit_card_holder_info.phone) } : {}),
        },
      };

      const asaasSub = await asaasRequest("/subscriptions", "POST", subscriptionPayload);

      await supabase
        .from("subscriptions")
        .update({
          plan_id,
          status: "active",
          started_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      return new Response(
        JSON.stringify({
          success: true,
          subscription_id: asaasSub.id,
          status: asaasSub.status,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── ACTION: create_service_payment ───
    if (action === "create_service_payment") {
      const {
        request_id,
        amount,
        billing_type,
        credit_card,
        credit_card_holder_info,
        installment_count,
      } = body;

      if (!request_id || !amount) {
        throw new Error("request_id and amount are required");
      }

      const { data: serviceReq } = await supabase
        .from("service_requests")
        .select("*, professionals(user_id)")
        .eq("id", request_id)
        .eq("client_id", user.id)
        .single();
      if (!serviceReq) throw new Error("Service request not found");

      const customerId = await findOrCreateCustomer(supabase, user.id);

      // ── PIX payment ──
      if (billing_type === "PIX") {
        const paymentPayload: Record<string, unknown> = {
          customer: customerId,
          billingType: "PIX",
          value: Number(amount),
          dueDate: new Date().toISOString().split("T")[0],
          description: `Pagamento serviço #${request_id.slice(0, 8)} - Chamô`,
        };

        const asaasPayment = await asaasRequest("/payments", "POST", paymentPayload);

        // Get PIX QR Code
        const pixData = await asaasRequest(`/payments/${asaasPayment.id}/pixQrCode`, "GET");

        // Record transaction as pending
        const totalAmount = Number(amount);
        const platformFee = Number((totalAmount * 0.1).toFixed(2));
        const professionalNet = Number((totalAmount - platformFee).toFixed(2));

        await supabase.from("transactions").insert({
          client_id: user.id,
          professional_id: serviceReq.professional_id,
          total_amount: totalAmount,
          platform_fee: platformFee,
          professional_net: professionalNet,
          status: "pending",
        });

        return new Response(
          JSON.stringify({
            success: true,
            payment_id: asaasPayment.id,
            status: asaasPayment.status,
            pix_qr_code: pixData.encodedImage,
            pix_copy_paste: pixData.payload,
            expiration_date: asaasPayment.dueDate,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ── CREDIT_CARD payment ──
      if (!credit_card || !credit_card_holder_info) {
        throw new Error("credit_card and credit_card_holder_info are required for card payments");
      }

      const paymentPayload: Record<string, unknown> = {
        customer: customerId,
        billingType: "CREDIT_CARD",
        value: Number(amount),
        dueDate: new Date().toISOString().split("T")[0],
        description: `Pagamento serviço #${request_id.slice(0, 8)} - Chamô`,
        creditCard: {
          holderName: credit_card.holder_name,
          number: credit_card.number.replace(/\s/g, ""),
          expiryMonth: credit_card.expiry_month,
          expiryYear: credit_card.expiry_year,
          ccv: credit_card.cvv,
        },
        creditCardHolderInfo: {
          name: credit_card_holder_info.name,
          email: credit_card_holder_info.email,
          cpfCnpj: credit_card_holder_info.cpf_cnpj?.replace(/\D/g, ""),
          postalCode: credit_card_holder_info.postal_code?.replace(/\D/g, ""),
          addressNumber: credit_card_holder_info.address_number,
          ...(formatPhone(credit_card_holder_info.phone) ? { phone: formatPhone(credit_card_holder_info.phone) } : {}),
        },
      };

      if (installment_count && installment_count > 1) {
        paymentPayload.installmentCount = installment_count;
        paymentPayload.installmentValue = Number(
          (Number(amount) / installment_count).toFixed(2)
        );
      }

      const asaasPayment = await asaasRequest("/payments", "POST", paymentPayload);

      const totalAmount = Number(amount);
      const platformFee = Number((totalAmount * 0.1).toFixed(2));
      const professionalNet = Number((totalAmount - platformFee).toFixed(2));

      await supabase.from("transactions").insert({
        client_id: user.id,
        professional_id: serviceReq.professional_id,
        total_amount: totalAmount,
        platform_fee: platformFee,
        professional_net: professionalNet,
        status: asaasPayment.status === "CONFIRMED" || asaasPayment.status === "RECEIVED"
          ? "completed"
          : "pending",
      });

      return new Response(
        JSON.stringify({
          success: true,
          payment_id: asaasPayment.id,
          status: asaasPayment.status,
          invoice_url: asaasPayment.invoiceUrl,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── ACTION: check_payment_status ───
    if (action === "check_payment_status") {
      const { payment_id } = body;
      if (!payment_id) throw new Error("payment_id is required");

      const payment = await asaasRequest(`/payments/${payment_id}`, "GET");

      return new Response(
        JSON.stringify({
          success: true,
          status: payment.status,
          confirmed: payment.status === "CONFIRMED" || payment.status === "RECEIVED",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error("Invalid action");
  } catch (error) {
    console.error("create_payment error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
