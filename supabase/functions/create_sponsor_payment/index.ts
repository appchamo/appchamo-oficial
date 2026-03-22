import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

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

async function findOrCreateCustomer(
  supabase: any,
  sponsorUserId: string,
  name: string,
  email: string,
  cpfCnpj: string,
) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("asaas_customer_id")
    .eq("user_id", sponsorUserId)
    .maybeSingle();

  if (profile?.asaas_customer_id) return profile.asaas_customer_id;

  const clean = cpfCnpj.replace(/\D/g, "");
  const search = await asaasReq(`/customers?cpfCnpj=${clean}`, "GET");
  let customerId: string;

  if (search.data?.length > 0) {
    customerId = search.data[0].id;
  } else {
    const customer = await asaasReq("/customers", "POST", { name, email, cpfCnpj: clean });
    customerId = customer.id;
  }

  await supabase.from("profiles").update({ asaas_customer_id: customerId }).eq("user_id", sponsorUserId);
  return customerId;
}

// ── Ativa o pacote do patrocinador (compra única — sem expiração) ─────────────
async function activateSponsorPack(
  supabase: any,
  sponsorId: string,
  pack: string,
  asaasPaymentId: string | null,
) {
  // Atualiza weekly_plan do patrocinador
  await supabase
    .from("sponsors")
    .update({ weekly_plan: pack })
    .eq("id", sponsorId);

  if (asaasPaymentId) {
    await supabase
      .from("sponsor_payments")
      .update({ status: "active" })
      .eq("asaas_payment_id", asaasPaymentId);
  }

  // Notifica o patrocinador
  const { data: sp } = await supabase
    .from("sponsors")
    .select("user_id")
    .eq("id", sponsorId)
    .maybeSingle();

  if (sp?.user_id) {
    const packLabel = pack === "pack_28" ? "28 novidades/semana" : "14 novidades/semana";
    await supabase.from("notifications").insert({
      user_id: sp.user_id,
      title: "🎉 Pacote ativado!",
      message: `Seu pacote de ${packLabel} foi ativado! Boas novidades!`,
      type: "success",
      link: "/sponsor/dashboard",
    });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Usa service role para todas as operações de banco
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Autenticação: valida JWT do usuário via service role ─────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return jsonRes({ error: "Token não fornecido" }, 401);

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      console.error("Auth error:", authErr?.message);
      return jsonRes({ error: "Não autorizado" }, 401);
    }

    const body = await req.json();
    const { action } = body;

    // ── Verificar status de pagamento PIX (polling) ───────────────────────────
    if (action === "check_status") {
      const { payment_id } = body;

      // Primeiro checa no banco
      const { data: sp } = await supabase
        .from("sponsor_payments")
        .select("status, sponsor_id, pack")
        .eq("asaas_payment_id", payment_id)
        .maybeSingle();

      if (sp?.status === "active") {
        return jsonRes({ confirmed: true });
      }

      // Fallback: consulta direta no Asaas
      try {
        const payment = await asaasReq(`/payments/${payment_id}`, "GET");
        const status = String(payment?.status || "").toUpperCase();
        const paid = status === "RECEIVED" || status === "CONFIRMED";
        if (paid && sp) {
          await activateSponsorPack(supabase, sp.sponsor_id, sp.pack ?? "pack_14", payment_id);
        }
        return jsonRes({ confirmed: paid });
      } catch {
        return jsonRes({ confirmed: false });
      }
    }

    // ── Criar pagamento (compra única) ────────────────────────────────────────
    const { sponsor_id, pack, payment_method, cpf_cnpj, holder_name, email, card } = body;

    if (!sponsor_id || !pack || !payment_method) {
      return jsonRes({ error: "sponsor_id, pack e payment_method são obrigatórios" }, 400);
    }

    // Verifica que o usuário é dono desse sponsor
    const { data: sponsor } = await supabase
      .from("sponsors")
      .select("id, name, user_id")
      .eq("id", sponsor_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!sponsor) return jsonRes({ error: "Patrocinador não encontrado" }, 404);

    // Busca preço do pacote
    const priceKey = pack === "pack_28" ? "sponsor_pack_28_price" : "sponsor_pack_14_price";
    const { data: settingRow } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", priceKey)
      .maybeSingle();

    const amount = parseFloat(String(settingRow?.value ?? "0"));
    if (!amount || amount <= 0) return jsonRes({ error: "Preço do pacote não configurado" }, 400);

    const packLabel = pack === "pack_28" ? "28 novidades/semana" : "14 novidades/semana";
    const today = new Date().toISOString().split("T")[0];

    // ── Reutiliza PIX pendente se já existir ─────────────────────────────────
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
        return jsonRes({
          success: true,
          payment_id: existing.asaas_payment_id,
          pix_qr_code: existing.pix_qr_code,
          pix_copy_paste: existing.pix_copy_paste,
          amount,
          reused: true,
        });
      }
    }

    // Busca/cria cliente Asaas
    const customerId = await findOrCreateCustomer(
      supabase,
      user.id,
      holder_name || sponsor.name,
      email || user.email || "",
      cpf_cnpj || "",
    );

    // ── PIX — pagamento único ─────────────────────────────────────────────────
    if (payment_method === "PIX") {
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

      return jsonRes({
        success: true,
        payment_id: asaasPayment.id,
        pix_qr_code: pixData.encodedImage,
        pix_copy_paste: pixData.payload,
        amount,
      });
    }

    // ── Cartão de Crédito — pagamento único (não é assinatura) ───────────────
    if (!card || !cpf_cnpj) {
      return jsonRes({ error: "Dados do cartão e CPF/CNPJ obrigatórios" }, 400);
    }

    const asaasPayment = await asaasReq("/payments", "POST", {
      customer: customerId,
      billingType: "CREDIT_CARD",
      value: amount,
      dueDate: today,
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
      asaas_payment_id: asaasPayment.id,
      status: "active",
    });

    // Ativa imediatamente (cartão é síncrono)
    await activateSponsorPack(supabase, sponsor_id, pack, asaasPayment.id);

    return jsonRes({ success: true, payment_id: asaasPayment.id, activated: true });

  } catch (err: any) {
    console.error("create_sponsor_payment error:", err.message);
    return jsonRes({ error: err.message }, 400);
  }
});
