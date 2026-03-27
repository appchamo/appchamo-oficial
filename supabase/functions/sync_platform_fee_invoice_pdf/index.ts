import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ASAAS_ENV = Deno.env.get("ASAAS_ENV") ?? "production";
const ASAAS_BASE_URL = ASAAS_ENV === "production"
  ? "https://api.asaas.com/v3"
  : "https://api-sandbox.asaas.com/v3";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function asaasReq(apiKey: string, path: string, method: string, body?: unknown) {
  const res = await fetch(`${ASAAS_BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", access_token: apiKey },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data.errors?.[0]?.description || data.message || JSON.stringify(data);
    throw new Error(msg || `Asaas HTTP ${res.status}`);
  }
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY");

    if (!ASAAS_API_KEY) {
      return new Response(JSON.stringify({ error: "ASAAS_API_KEY não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const { data: isAdm, error: admErr } = await supabase.rpc("is_admin", { _user_id: user.id });
    if (admErr || !isAdm) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    const { platform_fee_invoice_id } = await req.json();
    if (!platform_fee_invoice_id || typeof platform_fee_invoice_id !== "string") {
      return new Response(
        JSON.stringify({ error: "platform_fee_invoice_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: row, error: rowErr } = await supabase
      .from("platform_fee_invoices")
      .select("id, asaas_invoice_id")
      .eq("id", platform_fee_invoice_id)
      .maybeSingle();

    if (rowErr || !row?.asaas_invoice_id) {
      return new Response(JSON.stringify({ error: "Nota fiscal não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let pdfUrl: string | null = null;
    let xmlUrl: string | null = null;
    let nfNumber: string | null = null;
    let invStatus = "AUTHORIZED";

    for (let i = 0; i < 25; i++) {
      const inv = await asaasReq(ASAAS_API_KEY, `/invoices/${row.asaas_invoice_id}`, "GET");
      invStatus = inv.status || invStatus;
      if (inv.pdfUrl) pdfUrl = inv.pdfUrl;
      if (inv.xmlUrl) xmlUrl = inv.xmlUrl;
      if (inv.number || inv.rpsNumber) nfNumber = inv.number || inv.rpsNumber || nfNumber;
      if (inv.status === "ERROR") {
        throw new Error(inv.statusDescription || "Erro na NFS-e no Asaas");
      }
      if (pdfUrl) break;
      if (i < 24) await sleep(2000);
    }

    if (!pdfUrl) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "PDF ainda não disponível no Asaas. Tente novamente em alguns minutos.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await supabase
      .from("platform_fee_invoices")
      .update({
        pdf_url: pdfUrl,
        xml_url: xmlUrl,
        nf_number: nfNumber,
        status: invStatus === "AUTHORIZED" ? "authorized" : String(invStatus).toLowerCase(),
      })
      .eq("id", row.id);

    return new Response(
      JSON.stringify({ success: true, pdf_url: pdfUrl, nf_number: nfNumber }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("sync_platform_fee_invoice_pdf:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
