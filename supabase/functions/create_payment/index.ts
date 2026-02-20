import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ASAAS_BASE_URL =
  Deno.env.get("ASAAS_ENV") === "production"
    ? "https://api.asaas.com/v3"
    : "https://sandbox.asaas.com/api/v3";

const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY")!;

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
    console.error("Asaas error:", data);
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
    .select("full_name, email, cpf, cnpj")
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
  });

  return customer.id;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: authHeader } },
      }
    );

    const {
      data: { user },
    } = await anonClient.auth.getUser();

    if (!user) throw new Error("Unauthorized");

    const body = await req.json();
    const { request_id, amount } = body;

    if (!request_id || !amount) {
      throw new Error("request_id and amount required");
    }

    const { data: serviceReq, error: serviceError } = await supabase
      .from("service_requests")
      .select("*")
      .eq("id", request_id)
      .eq("client_id", user.id)
      .single();

    if (serviceError) {
      console.error("Service request error:", serviceError);
      throw new Error(serviceError.message);
    }

    if (!serviceReq) {
      throw new Error("Service request not found");
    }

    console.log("Service Request:", serviceReq);
    console.log("Professional ID enviado:", serviceReq.professional_id);

    const professionalId = serviceReq.professional_id;

    const totalAmount = Number(amount);
    const platformFee = Number((totalAmount * 0.1).toFixed(2));
    const professionalNet = Number((totalAmount - platformFee).toFixed(2));

    const customerId = await findOrCreateCustomer(supabase, user.id);

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
    professional_id: professionalId,
    request_id: request_id, // 👈 ESSENCIAL
    total_amount: totalAmount,
    platform_fee: platformFee,
    professional_net: professionalNet,
    asaas_payment_id: asaasPayment.id,
    status: "pending",
  });

    if (insertError) {
      console.error("Transaction insert error:", insertError);
      throw new Error(insertError.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        payment_id: asaasPayment.id,
        pix_qr_code: pixData.encodedImage,
        pix_copy_paste: pixData.payload,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
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