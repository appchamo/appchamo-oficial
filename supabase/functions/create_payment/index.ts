import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ASAAS_BASE_URL =
  Deno.env.get("ASAAS_ENV") === "production"
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

  if (!profile) throw new Error("Perfil não encontrado.");

  const cpfCnpj = profile.cnpj || profile.cpf;
  if (!cpfCnpj) throw new Error("Cadastre seu CPF ou CNPJ.");

  const clean = cpfCnpj.replace(/\D/g, "");

  const search = await asaasRequest(`/customers?cpfCnpj=${clean}`, "GET");

  if (search.data?.length > 0) {
    return search.data[0].id;
  }

  const customer = await asaasRequest("/customers", "POST", {
    name: profile.full_name,
    email: profile.email,
    cpfCnpj: clean,
    ...(formatPhone(profile.phone)
      ? { mobilePhone: formatPhone(profile.phone) }
      : {}),
  });

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
    if (!authHeader)
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    const anonKey =
      Deno.env.get("SUPABASE_ANON_KEY") ||
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ||
      "";

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
    } = await callerClient.auth.getUser();

    if (!user)
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    const body = await req.json();
    const { action } = body;

    // ===============================
    // CREATE SERVICE PAYMENT
    // ===============================

    if (action === "create_service_payment") {
      const { request_id, amount, billing_type, credit_card, credit_card_holder_info } = body;

      if (!request_id || !amount)
        throw new Error("request_id and amount are required");

      const { data: serviceReq, error: serviceError } = await supabase
        .from("service_requests")
        .select("*")
        .eq("id", request_id)
        .eq("client_id", user.id)
        .single();

      if (serviceError || !serviceReq) {
        console.error(serviceError);
        throw new Error("Service request not found");
      }

      if (!serviceReq.professional_id) {
        console.error("Missing professional_id", serviceReq);
        throw new Error("Professional ID missing");
      }

      const customerId = await findOrCreateCustomer(supabase, user.id);

      const totalAmount = Number(amount);
      const platformFee = Number((totalAmount * 0.1).toFixed(2));
      const professionalNet = Number((totalAmount - platformFee).toFixed(2));

      // PIX
      if (billing_type === "PIX") {
        const asaasPayment = await asaasRequest("/payments", "POST", {
          customer: customerId,
          billingType: "PIX",
          value: totalAmount,
          dueDate: new Date().toISOString().split("T")[0],
          description: `Pagamento serviço #${request_id.slice(0, 8)} - Chamô`,
        });

        const pixData = await asaasRequest(
          `/payments/${asaasPayment.id}/pixQrCode`,
          "GET"
        );

        const { error: insertError } = await supabase
          .from("transactions")
          .insert({
            client_id: user.id,
            professional_id: serviceReq.professional_id,
            total_amount: totalAmount,
            platform_fee: platformFee,
            professional_net: professionalNet,
            status: "pending",
          });

        if (insertError) {
          console.error("Insert error:", insertError);
          throw new Error("Erro ao salvar transação");
        }

        return new Response(
          JSON.stringify({
            success: true,
            payment_id: asaasPayment.id,
            status: asaasPayment.status,
            pix_qr_code: pixData.encodedImage,
            pix_copy_paste: pixData.payload,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // CARTÃO
      const asaasPayment = await asaasRequest("/payments", "POST", {
        customer: customerId,
        billingType: "CREDIT_CARD",
        value: totalAmount,
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
        },
      });

      const { error: insertError } = await supabase
        .from("transactions")
        .insert({
          client_id: user.id,
          professional_id: serviceReq.professional_id,
          total_amount: totalAmount,
          platform_fee: platformFee,
          professional_net: professionalNet,
          status:
            asaasPayment.status === "CONFIRMED" ||
            asaasPayment.status === "RECEIVED"
              ? "completed"
              : "pending",
        });

      if (insertError) {
        console.error("Insert error:", insertError);
        throw new Error("Erro ao salvar transação");
      }

      return new Response(
        JSON.stringify({
          success: true,
          payment_id: asaasPayment.id,
          status: asaasPayment.status,
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
