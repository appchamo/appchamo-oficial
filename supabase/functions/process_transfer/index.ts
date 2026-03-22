import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY");
    const ASAAS_BASE_URL = "https://api.asaas.com/v3";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verifica se é admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    if (user.email !== "admin@appchamo.com") return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });

    const { professional_id, wallet_transaction_ids } = await req.json();

    if (!professional_id || !wallet_transaction_ids?.length) {
      return new Response(JSON.stringify({ error: "professional_id e wallet_transaction_ids são obrigatórios" }), { status: 400, headers: corsHeaders });
    }

    // Busca dados fiscais do profissional (chave PIX)
    const { data: fiscal } = await supabase
      .from("professional_fiscal_info")
      .select("pix_key, pix_key_type, fiscal_name")
      .eq("professional_id", professional_id)
      .maybeSingle();

    if (!fiscal?.pix_key) {
      return new Response(JSON.stringify({ error: "Profissional não tem chave PIX cadastrada" }), { status: 400, headers: corsHeaders });
    }

    // Soma o valor total das transações pendentes selecionadas
    const { data: walletTxs } = await supabase
      .from("wallet_transactions")
      .select("id, amount")
      .in("id", wallet_transaction_ids)
      .eq("professional_id", professional_id)
      .eq("status", "pending");

    if (!walletTxs?.length) {
      return new Response(JSON.stringify({ error: "Nenhuma transação pendente encontrada" }), { status: 400, headers: corsHeaders });
    }

    const totalAmount = walletTxs.reduce((sum, t) => sum + Number(t.amount), 0);

    // Mapeia tipo de chave PIX para o formato do Asaas
    const pixKeyTypeMap: Record<string, string> = {
      cpf: "CPF",
      cnpj: "CNPJ",
      email: "EMAIL",
      phone: "PHONE",
      random: "EVP",
    };

    const asaasPixType = pixKeyTypeMap[fiscal.pix_key_type] || "CPF";

    // Chama API do Asaas para fazer a transferência via PIX
    console.log(`Iniciando transferência de R$ ${totalAmount.toFixed(2)} para ${fiscal.pix_key} (${asaasPixType})`);

    const transferRes = await fetch(`${ASAAS_BASE_URL}/transfers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "access_token": ASAAS_API_KEY!,
      },
      body: JSON.stringify({
        value: totalAmount,
        pixAddressKey: fiscal.pix_key,
        pixAddressKeyType: asaasPixType,
        description: `Repasse Chamô - ${fiscal.fiscal_name || "Profissional"}`,
      }),
    });

    const transferData = await transferRes.json();
    console.log("Asaas transfer response:", JSON.stringify(transferData));

    if (!transferRes.ok || transferData.errors?.length) {
      const errMsg = transferData.errors?.[0]?.description || transferData.description || "Erro ao realizar transferência no Asaas";
      return new Response(JSON.stringify({ error: errMsg }), { status: 400, headers: corsHeaders });
    }

    // Marca transações como transferidas
    const now = new Date().toISOString();
    await supabase
      .from("wallet_transactions")
      .update({
        status: "transferred",
        transferred_at: now,
        transferred_by: user.id,
        asaas_transfer_id: transferData.id,
      })
      .in("id", wallet_transaction_ids);

    // Notifica o profissional
    const { data: pro } = await supabase
      .from("professionals")
      .select("user_id")
      .eq("id", professional_id)
      .maybeSingle();

    if (pro?.user_id) {
      const totalStr = totalAmount.toFixed(2).replace(".", ",");
      await supabase.from("notifications").insert({
        user_id: pro.user_id,
        title: "💸 Repasse realizado!",
        message: `R$ ${totalStr} foram transferidos para sua chave PIX.`,
        type: "success",
        link: "/pro/financeiro",
      });
    }

    return new Response(JSON.stringify({
      success: true,
      transfer_id: transferData.id,
      amount: totalAmount,
      transactions_updated: walletTxs.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error("process_transfer error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
