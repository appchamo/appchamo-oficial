import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ===============================
// 🔓 CORS
// ===============================
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ===============================
// 🔁 Ambiente Asaas
// ===============================
const ASAAS_ENV = Deno.env.get("ASAAS_ENV") ?? "sandbox";

const ASAAS_BASE_URL =
  ASAAS_ENV === "production"
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";

const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY");

// ===============================
// 🔗 Helper Asaas
// ===============================
async function asaasRequest(
  path: string,
  method: string,
  body?: unknown
) {
  if (!ASAAS_API_KEY) {
    throw new Error("ASAAS_API_KEY not configured");
  }

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

// ===============================
// 👤 Buscar ou criar customer
// ===============================
async function findOrCreateCustomer(
  supabase: ReturnType<typeof createClient>,
  userId: string
) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, cpf, cnpj, asaas_customer_id")
    .eq("user_id", userId)
    .single();

  if (!profile) throw new Error("Perfil não encontrado.");

  // Se já existe salvo no banco → usa
  if (profile.asaas_customer_id) {
    return profile.asaas_customer_id;
  }

  const cpfCnpj = profile.cnpj || profile.cpf;
  if (!cpfCnpj) throw new Error("Cadastre seu CPF ou CNPJ.");

  const clean = cpfCnpj.replace(/\D/g, "");

  // Verifica no Asaas se já existe
  const search = await asaasRequest(
    `/customers?cpfCnpj=${clean}`,
    "GET"
  );

  let customerId;

  if (search.data?.length > 0) {
    customerId = search.data[0].id;
  } else {
    const customer = await asaasRequest("/customers", "POST", {
      name: profile.full_name,
      email: profile.email,
      cpfCnpj: clean,
    });

    customerId = customer.id;
  }

  // Salva no banco
  await supabase
    .from("profiles")
    .update({ asaas_customer_id: customerId })
    .eq("user_id", userId);

  return customerId;
}

// ===============================
// 🚀 Edge Function
// ===============================
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
    const { action, request_id, amount, payment_id } = body;

    // ===============================
    // Consultar status do pagamento (polling do frontend)
    // ===============================
    if (action === "check_payment_status" && payment_id) {
      const { data: tx } = await supabase
        .from("transactions")
        .select("status, client_id")
        .eq("asaas_payment_id", payment_id)
        .eq("client_id", user.id)
        .maybeSingle();

      // Já confirmado no nosso banco
      if (tx?.status === "completed") {
        return new Response(JSON.stringify({ confirmed: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fallback: se webhook falhar/atrasar, consulta direto no Asaas
      try {
        const payment = await asaasRequest(`/payments/${payment_id}`, "GET");
        const status = String(payment?.status || "").toUpperCase();
        const paid = status === "RECEIVED" || status === "CONFIRMED";
        if (paid) {
          await supabase
            .from("transactions")
            .update({ status: "completed" })
            .eq("asaas_payment_id", payment_id)
            .eq("client_id", user.id);
        }
        return new Response(JSON.stringify({ confirmed: paid }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (_) {
        // Se o Asaas estiver indisponível, não trava o app: só mantém confirmado=false
        return new Response(JSON.stringify({ confirmed: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!request_id || !amount) {
      throw new Error("request_id and amount required");
    }
    // original_amount: valor original antes do cupom — usado para calcular professional_net
    // amount: valor que o cliente efetivamente paga (pode ter desconto de cupom)
    const originalAmountRaw = body.original_amount ?? amount;

    // ===============================
    // Buscar service request
    // ===============================
    const { data: serviceReq, error: serviceError } =
      await supabase
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

    const professionalId = serviceReq.professional_id;

    // ===============================
    // Reutilizar pagamento pendente
    // ===============================
    const { data: existingTx } = await supabase
      .from("transactions")
      .select("*")
      .eq("request_id", request_id)
      .eq("status", "pending")
      .maybeSingle();

    if (existingTx) {
      return new Response(
        JSON.stringify({
          success: true,
          payment_id: existingTx.asaas_payment_id,
          pix_qr_code: existingTx.pix_qr_code,
          pix_copy_paste: existingTx.pix_copy_paste,
          reused: true,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // ===============================
    // Cálculos — lê configurações da plataforma
    // ===============================
    const totalAmount    = Number(amount);           // valor que o Asaas cobra do cliente (pode ser com desconto)
    const originalAmount = Number(originalAmountRaw); // valor original sem desconto de cupom

    const settingsKeys = ["commission_pct", "pix_fee_pct", "pix_fee_fixed"];
    const { data: settingsRows } = await supabase
      .from("platform_settings")
      .select("key, value")
      .in("key", settingsKeys);

    const cfg: Record<string, number> = {};
    (settingsRows || []).forEach(r => { cfg[r.key] = parseFloat(r.value || "0"); });

    const commissionPct = cfg["commission_pct"] ?? 10;
    const pixFeePct    = cfg["pix_fee_pct"] ?? 0;
    const pixFeeFixed  = cfg["pix_fee_fixed"] ?? 0;

    // Taxas calculadas sobre o valor ORIGINAL (profissional não é penalizado pelo cupom)
    const commissionFee  = Number((originalAmount * commissionPct / 100).toFixed(2));
    const paymentFee     = Number((originalAmount * pixFeePct / 100 + pixFeeFixed).toFixed(2));
    const platformFee    = Number((commissionFee + paymentFee).toFixed(2));
    const professionalNet = Number((originalAmount - platformFee).toFixed(2));

    // ===============================
    // Customer
    // ===============================
    const customerId = await findOrCreateCustomer(
      supabase,
      user.id
    );

    // ===============================
    // Criar pagamento PIX
    // ===============================
    const asaasPayment = await asaasRequest("/payments", "POST", {
      customer: customerId,
      billingType: "PIX",
      value: totalAmount,
      dueDate: new Date().toISOString().split("T")[0],
      description: `Pagamento serviço #${request_id.slice(
        0,
        8
      )} - Chamô`,
    });

    const pixData = await asaasRequest(
      `/payments/${asaasPayment.id}/pixQrCode`,
      "GET"
    );

    if (!pixData?.encodedImage) {
      throw new Error("PIX não retornou encodedImage");
    }

    // ===============================
    // Salvar transaction
    // ===============================
    const { error: insertError } = await supabase
      .from("transactions")
      .insert({
        client_id: user.id,
        professional_id: professionalId,
        request_id: request_id,
        total_amount: totalAmount,
        original_amount: originalAmount,
        platform_fee: platformFee,
        commission_fee: commissionFee,
        payment_fee: paymentFee,
        professional_net: professionalNet,
        asaas_payment_id: asaasPayment.id,
        pix_qr_code: pixData.encodedImage,
        pix_copy_paste: pixData.payload,
        status: "pending",
      });

    if (insertError) {
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
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    console.error("create_payment error:", error.message);

    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});