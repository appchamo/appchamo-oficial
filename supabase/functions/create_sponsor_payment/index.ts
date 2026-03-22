import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ASAAS_ENV = Deno.env.get("ASAAS_ENV") ?? "sandbox";
const ASAAS_BASE_URL = ASAAS_ENV === "production"
  ? "https://api.asaas.com/v3"
  : "https://api-sandbox.asaas.com/v3";
const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY");

async function asaasReq(path: string, method: string, body?: unknown) {
  if (!ASAAS_API_KEY) throw new Error("ASAAS_API_KEY não configurada");
  const res = await fetch(`${ASAAS_BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", access_token: ASAAS_API_KEY },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("Asaas error:", data);
    throw new Error(data.errors?.[0]?.description || "Erro Asaas");
  }
  return data;
}

async function findOrCreateCustomer(supabase: any, sponsorUserId: string, name: string, email: string, cpfCnpj: string) {
  // Verifica se já tem asaas_customer_id no perfil
  const { data: profile } = await supabase
    .from("profiles")
    .select("asaas_customer_id")
    .eq("user_id", sponsorUserId)
    .maybeSingle();

  if (profile?.asaas_customer_id) return profile.asaas_customer_id;

  const clean = cpfCnpj.replace(/\D/g, "");

  // Busca por CPF/CNPJ no Asaas
  const search = await asaasReq(`/customers?cpfCnpj=${clean}`, "GET");
  let customerId: string;

  if (search.data?.length > 0) {
    customerId = search.data[0].id;
  } else {
    const customer = await asaasReq("/customers", "POST", { name, email, cpfCnpj: clean });
    customerId = customer.id;
  }

  // Salva no perfil
  await supabase.from("profiles").update({ asaas_customer_id: customerId }).eq("user_id", sponsorUserId);
  return customerId;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const body = await req.json();
    const { action } = body;

    // ── Verificar status de pagamento PIX ──────────────────────────────────────
    if (action === "check_status") {
      const { payment_id } = body;
      const { data: sp } = await supabase
        .from("sponsor_payments")
        .select("status, sponsor_id")
        .eq("asaas_payment_id", payment_id)
        .maybeSingle();

      if (sp?.status === "active") {
        return new Response(JSON.stringify({ confirmed: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fallback: consulta direto no Asaas
      try {
        const payment = await asaasReq(`/payments/${payment_id}`, "GET");
        const status = String(payment?.status || "").toUpperCase();
        const paid = status === "RECEIVED" || status === "CONFIRMED";
        if (paid && sp) {
          await activateSponsorPlan(supabase, sp.sponsor_id, sp.pack ?? "pack_14", payment_id, null);
        }
        return new Response(JSON.stringify({ confirmed: paid }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch {
        return new Response(JSON.stringify({ confirmed: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── Criar pagamento ────────────────────────────────────────────────────────
    const { sponsor_id, pack, payment_method, cpf_cnpj, holder_name, email, card } = body;

    if (!sponsor_id || !pack || !payment_method) {
      throw new Error("sponsor_id, pack e payment_method são obrigatórios");
    }

    // Verifica que o usuário é dono desse sponsor
    const { data: sponsor } = await supabase
      .from("sponsors")
      .select("id, name, user_id")
      .eq("id", sponsor_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!sponsor) throw new Error("Patrocinador não encontrado");

    // Busca preço do pacote
    const priceKey = pack === "pack_28" ? "sponsor_pack_28_price" : "sponsor_pack_14_price";
    const { data: settingRow } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", priceKey)
      .maybeSingle();

    const amount = parseFloat(String(settingRow?.value || "0"));
    if (!amount || amount <= 0) throw new Error("Preço do pacote não configurado");

    // Reutiliza pagamento PIX pendente se existir
    if (payment_method === "PIX") {
      const { data: existing } = await supabase
        .from("sponsor_payments")
        .select("*")
        .eq("sponsor_id", sponsor_id)
        .eq("pack", pack)
        .eq("payment_method", "PIX")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing?.pix_qr_code) {
        return new Response(JSON.stringify({
          success: true,
          payment_id: existing.asaas_payment_id,
          pix_qr_code: existing.pix_qr_code,
          pix_copy_paste: existing.pix_copy_paste,
          amount,
          reused: true,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const customerId = await findOrCreateCustomer(
      supabase, user.id,
      holder_name || sponsor.name,
      email || user.email || "",
      cpf_cnpj || "",
    );

    const today = new Date().toISOString().split("T")[0];
    const packLabel = pack === "pack_28" ? "28 novidades/semana" : "14 novidades/semana";

    if (payment_method === "PIX") {
      // Pagamento único PIX (o patrocinador renova manualmente todo mês)
      const asaasPayment = await asaasReq("/payments", "POST", {
        customer: customerId,
        billingType: "PIX",
        value: amount,
        dueDate: today,
        description: `Pacote Chamô Patrocinador — ${packLabel}`,
      });

      const pixData = await asaasReq(`/payments/${asaasPayment.id}/pixQrCode`, "GET");
      if (!pixData?.encodedImage) throw new Error("PIX não retornou QR code");

      await supabase.from("sponsor_payments").insert({
        sponsor_id,
        pack,
        payment_method: "PIX",
        amount,
        asaas_payment_id: asaasPayment.id,
        pix_qr_code: pixData.encodedImage,
        pix_copy_paste: pixData.payload,
        status: "pending",
      });

      return new Response(JSON.stringify({
        success: true,
        payment_id: asaasPayment.id,
        pix_qr_code: pixData.encodedImage,
        pix_copy_paste: pixData.payload,
        amount,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } else {
      // Assinatura mensal via Cartão de Crédito
      if (!card || !cpf_cnpj) throw new Error("Dados do cartão e CPF/CNPJ obrigatórios");

      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const nextDueDate = nextMonth.toISOString().split("T")[0];

      const subscription = await asaasReq("/subscriptions", "POST", {
        customer: customerId,
        billingType: "CREDIT_CARD",
        value: amount,
        nextDueDate,
        cycle: "MONTHLY",
        description: `Pacote Chamô Patrocinador — ${packLabel}`,
        creditCard: {
          holderName: card.holderName,
          number: card.number.replace(/\s/g, ""),
          expiryMonth: card.expiryMonth,
          expiryYear: card.expiryYear,
          ccv: card.ccv,
        },
        creditCardHolderInfo: {
          name: holder_name || sponsor.name,
          email: email || user.email || "",
          cpfCnpj: cpf_cnpj.replace(/\D/g, ""),
          postalCode: card.postalCode || "00000000",
          addressNumber: card.addressNumber || "0",
          phone: card.phone || "",
        },
      });

      await supabase.from("sponsor_payments").insert({
        sponsor_id,
        pack,
        payment_method: "CREDIT_CARD",
        amount,
        asaas_subscription_id: subscription.id,
        status: "active",
      });

      // Atualiza plano do patrocinador imediatamente (cartão é síncrono)
      await activateSponsorPlan(supabase, sponsor_id, pack, null, subscription.id);

      return new Response(JSON.stringify({
        success: true,
        subscription_id: subscription.id,
        activated: true,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

  } catch (err: any) {
    console.error("create_sponsor_payment error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── Ativa o plano do patrocinador no banco ─────────────────────────────────
async function activateSponsorPlan(
  supabase: any,
  sponsorId: string,
  pack: string,
  asaasPaymentId: string | null,
  asaasSubscriptionId: string | null,
) {
  const expiresAt = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString();

  await supabase.from("sponsors").update({
    weekly_plan: pack,
    plan_expires_at: expiresAt,
    ...(asaasSubscriptionId ? { asaas_subscription_id: asaasSubscriptionId } : {}),
  }).eq("id", sponsorId);

  if (asaasPaymentId) {
    await supabase.from("sponsor_payments")
      .update({ status: "active" })
      .eq("asaas_payment_id", asaasPaymentId);
  }

  // Notifica o patrocinador
  const { data: sp } = await supabase
    .from("sponsors")
    .select("user_id, name")
    .eq("id", sponsorId)
    .maybeSingle();

  if (sp?.user_id) {
    const packLabel = pack === "pack_28" ? "28 novidades/semana" : "14 novidades/semana";
    await supabase.from("notifications").insert({
      user_id: sp.user_id,
      title: "🎉 Pacote ativado!",
      message: `Seu pacote de ${packLabel} foi ativado com sucesso!`,
      type: "success",
      link: "/sponsor/dashboard",
    });
  }
}
