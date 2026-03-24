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
          // Atualiza status da transação
          await supabase
            .from("transactions")
            .update({ status: "completed" })
            .eq("asaas_payment_id", payment_id)
            .eq("client_id", user.id);

          // Fallback: cria wallet_transaction se o webhook não criou ainda
          try {
            const { data: txFull } = await supabase
              .from("transactions")
              .select("id, professional_id, total_amount, original_amount, professional_net, platform_fee, commission_fee, payment_fee")
              .eq("asaas_payment_id", payment_id)
              .maybeSingle();

            if (txFull?.professional_id) {
              const { data: existingWallet } = await supabase
                .from("wallet_transactions")
                .select("id")
                .eq("transaction_id", txFull.id)
                .maybeSingle();

              if (!existingWallet) {
                const { data: fiscal } = await supabase
                  .from("professional_fiscal_data")
                  .select("anticipation_enabled, payment_method")
                  .eq("professional_id", txFull.professional_id)
                  .maybeSingle();

                const { data: settingsRows } = await supabase
                  .from("platform_settings")
                  .select("key, value")
                  .in("key", ["transfer_period_pix_hours", "transfer_period_card_days", "transfer_period_card_anticipated_days", "anticipation_fee_pct", "commission_pct", "pix_fee_pct", "pix_fee_fixed", "card_fee_pct", "card_fee_fixed"]);

                const cfg: Record<string, number> = {};
                (settingsRows || []).forEach((r: any) => { cfg[r.key] = parseFloat(r.value || "0"); });

                const payMethod = fiscal?.payment_method || "pix";
                const anticipationEnabled = fiscal?.anticipation_enabled || false;
                const grossAmount = Number(txFull.total_amount);
                const originalAmt = Number(txFull.original_amount || txFull.total_amount);
                const commissionPct = cfg["commission_pct"] ?? 10;
                const feePct = payMethod === "pix" ? (cfg["pix_fee_pct"] ?? 0) : (cfg["card_fee_pct"] ?? 0);
                const feeFixed = payMethod === "pix" ? (cfg["pix_fee_fixed"] ?? 0) : (cfg["card_fee_fixed"] ?? 0);

                const commissionFeeAmt = txFull.commission_fee != null ? Number(txFull.commission_fee) : Number((originalAmt * commissionPct / 100).toFixed(2));
                const paymentFeeAmt = txFull.payment_fee != null ? Number(txFull.payment_fee) : Number((originalAmt * feePct / 100 + feeFixed).toFixed(2));
                const professionalNetAmt = txFull.professional_net != null ? Number(txFull.professional_net) : Number((originalAmt - commissionFeeAmt - paymentFeeAmt).toFixed(2));

                let anticipationFeeAmt = 0;
                if (anticipationEnabled && payMethod !== "pix") {
                  anticipationFeeAmt = Number((professionalNetAmt * (cfg["anticipation_fee_pct"] || 15) / 100).toFixed(2));
                }
                const netAmt = Number((professionalNetAmt - anticipationFeeAmt).toFixed(2));

                let availableAt = new Date();
                if (payMethod === "pix") {
                  availableAt = new Date(Date.now() + (cfg["transfer_period_pix_hours"] || 12) * 3600000);
                } else if (anticipationEnabled) {
                  availableAt = new Date(Date.now() + (cfg["transfer_period_card_anticipated_days"] || 7) * 86400000);
                } else {
                  availableAt = new Date(Date.now() + (cfg["transfer_period_card_days"] || 32) * 86400000);
                }

                await supabase.from("wallet_transactions").insert({
                  professional_id: txFull.professional_id,
                  transaction_id: txFull.id,
                  gross_amount: grossAmount,
                  platform_fee_amount: commissionFeeAmt,
                  payment_fee_amount: paymentFeeAmt,
                  anticipation_fee_amount: anticipationFeeAmt,
                  amount: netAmt,
                  payment_method: payMethod,
                  anticipation_enabled: anticipationEnabled,
                  description: `Serviço recebido via ${payMethod === "pix" ? "PIX" : "Cartão"}`,
                  status: "pending",
                  available_at: availableAt.toISOString(),
                });
                console.log("wallet_transaction criada via fallback para profissional:", txFull.professional_id);
              }
            }
          } catch (walletFallbackErr) {
            console.error("Erro no fallback de wallet_transaction:", walletFallbackErr);
          }
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
    // amount: valor que o cliente efetivamente paga (pode ter desconto de cupom ou já inclui taxas de cartão)
    const originalAmountRaw = body.original_amount ?? amount;
    const installmentCount  = Math.max(1, parseInt(body.installment_count || "1"));
    const isCreditCard      = !!(body.credit_card && body.credit_card.number);

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
    // Reutilizar pagamento pendente (apenas PIX)
    // ===============================
    if (!isCreditCard) {
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
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ===============================
    // Cálculos — lê configurações da plataforma
    // ===============================
    const totalAmount    = Number(amount);
    const originalAmount = Number(originalAmountRaw);

    const settingsKeys = ["commission_pct", "pix_fee_pct", "pix_fee_fixed", "card_fee_pct", "card_fee_fixed"];
    const { data: settingsRows } = await supabase
      .from("platform_settings")
      .select("key, value")
      .in("key", settingsKeys);

    const cfg: Record<string, number> = {};
    (settingsRows || []).forEach(r => { cfg[r.key] = parseFloat(r.value || "0"); });

    const commissionPct  = cfg["commission_pct"] ?? 10;
    const feePct         = isCreditCard ? (cfg["card_fee_pct"] ?? 0) : (cfg["pix_fee_pct"] ?? 0);
    const feeFixed       = isCreditCard ? (cfg["card_fee_fixed"] ?? 0) : (cfg["pix_fee_fixed"] ?? 0);

    // Taxas calculadas sobre o valor ORIGINAL (profissional não é penalizado pelo cupom)
    const commissionFee   = Number((originalAmount * commissionPct / 100).toFixed(2));
    const paymentFee      = Number((originalAmount * feePct / 100 + feeFixed).toFixed(2));
    const platformFee     = Number((commissionFee + paymentFee).toFixed(2));
    const professionalNet = Number((originalAmount - platformFee).toFixed(2));

    // ===============================
    // Customer
    // ===============================
    const customerId = await findOrCreateCustomer(supabase, user.id);

    // ===============================
    // CARTÃO DE CRÉDITO
    // ===============================
    if (isCreditCard) {
      const cc   = body.credit_card;
      const chi  = body.credit_card_holder_info || {};

      const cardPayload: Record<string, unknown> = {
        customer: customerId,
        billingType: "CREDIT_CARD",
        value: totalAmount,
        dueDate: new Date().toISOString().split("T")[0],
        description: `Pagamento serviço #${request_id.slice(0, 8)} - Chamô`,
        creditCard: {
          holderName: cc.holder_name,
          number: String(cc.number).replace(/\s/g, ""),
          expiryMonth: String(cc.expiry_month).padStart(2, "0"),
          expiryYear: String(cc.expiry_year),
          ccv: String(cc.cvv),
        },
        creditCardHolderInfo: {
          name: chi.name || cc.holder_name,
          email: chi.email || "",
          cpfCnpj: String(chi.cpf_cnpj || "").replace(/\D/g, ""),
          postalCode: String(chi.postal_code || "").replace(/\D/g, ""),
          addressNumber: String(chi.address_number || ""),
          ...(chi.phone ? { phone: String(chi.phone).replace(/\D/g, "") } : {}),
        },
      };

      if (installmentCount > 1) {
        cardPayload.installmentCount = installmentCount;
        cardPayload.installmentValue = Number((totalAmount / installmentCount).toFixed(2));
      }

      const asaasPayment = await asaasRequest("/payments", "POST", cardPayload);
      console.log("Asaas card payment created:", asaasPayment.id, "status:", asaasPayment.status);

      const confirmed = asaasPayment.status === "CONFIRMED" || asaasPayment.status === "RECEIVED";

      // Salvar transação
      const { error: insertErr } = await supabase.from("transactions").insert({
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
        status: confirmed ? "completed" : "pending",
      });

      if (insertErr) throw new Error(insertErr.message);

      // Se já confirmado aqui (cobrança instantânea), cria wallet_transaction imediatamente
      if (confirmed && professionalId) {
        const { data: fiscal } = await supabase
          .from("professional_fiscal_data")
          .select("anticipation_enabled, payment_method")
          .eq("professional_id", professionalId)
          .maybeSingle();

        const { data: settingsAll } = await supabase
          .from("platform_settings")
          .select("key, value")
          .in("key", ["transfer_period_card_days", "transfer_period_card_anticipated_days", "anticipation_fee_pct"]);

        const cfgAll: Record<string, number> = {};
        (settingsAll || []).forEach((r: any) => { cfgAll[r.key] = parseFloat(r.value || "0"); });

        const anticipationEnabled = fiscal?.anticipation_enabled || false;
        let anticipationFeeAmt = 0;
        if (anticipationEnabled) {
          anticipationFeeAmt = Number((professionalNet * (cfgAll["anticipation_fee_pct"] || 15) / 100).toFixed(2));
        }
        const netAmt = Number((professionalNet - anticipationFeeAmt).toFixed(2));
        const cardDays = anticipationEnabled
          ? (cfgAll["transfer_period_card_anticipated_days"] || 7)
          : (cfgAll["transfer_period_card_days"] || 32);
        const availableAt = new Date(Date.now() + cardDays * 86400000).toISOString();

        const { data: newTx } = await supabase
          .from("transactions")
          .select("id")
          .eq("asaas_payment_id", asaasPayment.id)
          .maybeSingle();

        if (newTx?.id) {
          await supabase.from("wallet_transactions").upsert({
            professional_id: professionalId,
            transaction_id: newTx.id,
            gross_amount: totalAmount,
            platform_fee_amount: commissionFee,
            payment_fee_amount: paymentFee,
            anticipation_fee_amount: anticipationFeeAmt,
            amount: netAmt,
            payment_method: "card",
            anticipation_enabled: anticipationEnabled,
            description: "Serviço recebido via Cartão",
            status: "pending",
            available_at: availableAt,
          }, { onConflict: "transaction_id", ignoreDuplicates: true });
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          confirmed,
          payment_id: asaasPayment.id,
          status: asaasPayment.status,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===============================
    // PIX
    // ===============================
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

    if (!pixData?.encodedImage) {
      throw new Error("PIX não retornou encodedImage");
    }

    // ===============================
    // Salvar transaction (PIX)
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
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
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