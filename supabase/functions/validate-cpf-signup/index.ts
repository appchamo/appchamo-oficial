/**
 * Valida CPF/CNPJ + nome tentando criar um cliente no Asaas.
 * O Asaas valida formato e consistência do documento; se aceitar, retornamos o asaas_customer_id
 * para o app salvar no perfil e reutilizar em assinaturas/pagamentos.
 */
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const ASAAS_ENV = Deno.env.get("ASAAS_ENV") ?? "sandbox";
const ASAAS_BASE_URL =
  ASAAS_ENV === "production"
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";
const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Método não permitido" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    const { name, cpfCnpj } = body as { name?: string; cpfCnpj?: string };

    if (!name?.trim() || !cpfCnpj?.trim()) {
      return new Response(
        JSON.stringify({ valid: false, message: "Nome e CPF/CNPJ são obrigatórios." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const clean = String(cpfCnpj).replace(/\D/g, "");
    if (clean.length !== 11 && clean.length !== 14) {
      return new Response(
        JSON.stringify({ valid: false, message: "CPF deve ter 11 dígitos ou CNPJ 14 dígitos." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!ASAAS_API_KEY) {
      console.error("ASAAS_API_KEY não configurada");
      return new Response(
        JSON.stringify({ valid: false, message: "Validação temporariamente indisponível." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const res = await fetch(`${ASAAS_BASE_URL}/customers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        access_token: ASAAS_API_KEY,
      },
      body: JSON.stringify({
        name: name.trim(),
        cpfCnpj: clean,
      }),
    });

    const data = await res.json();

    if (res.ok) {
      return new Response(
        JSON.stringify({ valid: true, asaas_customer_id: data.id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // POST falhou — verificar se é "cliente já existe" (GET acha) ou "CPF inválido" (Asaas rejeitou)
    const listRes = await fetch(
      `${ASAAS_BASE_URL}/customers?cpfCnpj=${encodeURIComponent(clean)}&limit=1`,
      {
        headers: {
          "Content-Type": "application/json",
          access_token: ASAAS_API_KEY,
        },
      }
    );
    const listData = await listRes.json().catch(() => ({}));
    const arr = Array.isArray(listData?.data) ? listData.data : Array.isArray(listData) ? listData : [];
    const existing = arr[0];

    if (existing?.id) {
      return new Response(
        JSON.stringify({ valid: false, message: "Esse CPF já está cadastrado." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const asaasMsg = data?.errors?.[0]?.description ?? "CPF/CNPJ inválido.";
    return new Response(
      JSON.stringify({ valid: false, message: asaasMsg }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("validate-cpf-signup error:", err);
    return new Response(
      JSON.stringify({
        valid: false,
        message: err instanceof Error ? err.message : "Erro ao validar. Tente novamente.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
