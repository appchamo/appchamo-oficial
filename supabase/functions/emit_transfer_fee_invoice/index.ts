import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CHAMO_EMAIL_INTRO_HTML = `
<p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#1a1a1a;font-family:system-ui,-apple-system,sans-serif;">
  Olá,
</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#333;font-family:system-ui,-apple-system,sans-serif;">
  Segue em anexo a <strong>nota fiscal de serviço</strong> referente à <strong>taxa de intermediação / comissão da plataforma Chamô</strong>
  sobre os repasses vinculados a esta emissão.
</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#333;font-family:system-ui,-apple-system,sans-serif;">
  O valor do serviço prestado pelo Chamô (disponibilização da plataforma e intermediação) corresponde à comissão indicada na nota.
  O pagamento efetuado pelo cliente final ao profissional não consta neste documento, pois não há vínculo fiscal direto com o Chamô nessa etapa.
</p>
<p style="margin:0 0 8px;font-size:15px;line-height:1.55;color:#333;font-family:system-ui,-apple-system,sans-serif;">
  Você também pode baixar o PDF quando quiser em <strong>Carteira</strong> no app Chamô.
</p>
<p style="margin:24px 0 0;font-size:14px;line-height:1.5;color:#666;font-family:system-ui,-apple-system,sans-serif;">
  Abraços,<br/>
  <strong style="color:#ea580c;">Equipe Chamô</strong>
</p>
`;

const ASAAS_ENV = Deno.env.get("ASAAS_ENV") ?? "production";
const ASAAS_BASE_URL = ASAAS_ENV === "production"
  ? "https://api.asaas.com/v3"
  : "https://api-sandbox.asaas.com/v3";

function defaultTaxes() {
  return {
    retainIss: false,
    iss: Number(Deno.env.get("ASAAS_NF_ISS") ?? "2"),
    pis: Number(Deno.env.get("ASAAS_NF_PIS") ?? "0.65"),
    cofins: Number(Deno.env.get("ASAAS_NF_COFINS") ?? "3"),
    csll: Number(Deno.env.get("ASAAS_NF_CSLL") ?? "1"),
    inss: Number(Deno.env.get("ASAAS_NF_INSS") ?? "0"),
    ir: Number(Deno.env.get("ASAAS_NF_IR") ?? "1.5"),
    pisCofinsRetentionType: Deno.env.get("ASAAS_NF_PIS_COFINS_RETENTION") ?? "NOT_WITHHELD",
    pisCofinsTaxStatus: Deno.env.get("ASAAS_NF_PIS_COFINS_TAX_STATUS") ?? "STANDARD_TAXABLE_OPERATION",
  };
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

async function findOrCreateAsaasCustomer(
  apiKey: string,
  fiscal: {
    fiscal_name: string;
    fiscal_email: string;
    fiscal_document: string;
    fiscal_address_street: string;
    fiscal_address_number: string;
    fiscal_address_complement: string | null;
    fiscal_address_neighborhood: string;
    fiscal_address_city: string;
    fiscal_address_state: string;
    fiscal_address_zip: string;
  },
) {
  const clean = (fiscal.fiscal_document || "").replace(/\D/g, "");
  if (clean.length !== 11 && clean.length !== 14) {
    throw new Error("CPF/CNPJ fiscal inválido para emissão no Asaas");
  }

  const search = await asaasReq(apiKey, `/customers?cpfCnpj=${clean}`, "GET");
  const existing = search.data?.[0];
  if (existing?.id) return existing.id as string;

  const zip = (fiscal.fiscal_address_zip || "").replace(/\D/g, "").slice(0, 8);

  const payload: Record<string, unknown> = {
    name: (fiscal.fiscal_name || "").trim() || "Profissional Chamô",
    email: (fiscal.fiscal_email || "").trim(),
    cpfCnpj: clean,
    address: (fiscal.fiscal_address_street || "").trim(),
    addressNumber: (fiscal.fiscal_address_number || "").trim() || "S/N",
    complement: (fiscal.fiscal_address_complement || "").trim() || undefined,
    province: (fiscal.fiscal_address_neighborhood || "").trim() || "Centro",
    postalCode: zip || undefined,
    city: (fiscal.fiscal_address_city || "").trim() || undefined,
    state: (fiscal.fiscal_address_state || "").trim().slice(0, 2) || undefined,
  };

  const created = await asaasReq(apiKey, "/customers", "POST", payload);
  return created.id as string;
}

function uint8ToBase64(buf: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    const sub = buf.subarray(i, Math.min(i + chunk, buf.length));
    bin += String.fromCharCode.apply(null, Array.from(sub));
  }
  return btoa(bin);
}

async function fetchPdfBase64(url: string, apiKey: string): Promise<string | null> {
  try {
    let res = await fetch(url, { headers: { access_token: apiKey } });
    if (!res.ok) res = await fetch(url);
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    return uint8ToBase64(buf);
  } catch {
    return null;
  }
}

async function sendResendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  pdfBase64: string | null;
  filename: string;
  pdfUrlFallback: string | null;
}) {
  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL") || "Chamô <onboarding@resend.dev>";
  if (!key) {
    console.warn("RESEND_API_KEY não configurada — e-mail não enviado.");
    return false;
  }

  let html = opts.html;
  if (!opts.pdfBase64 && opts.pdfUrlFallback) {
    html += `<p style="margin-top:16px;font-size:14px;"><a href="${opts.pdfUrlFallback}" style="color:#ea580c;font-weight:600;">Baixar PDF da nota fiscal</a></p>`;
  }

  const body: Record<string, unknown> = {
    from,
    to: [opts.to],
    subject: opts.subject,
    html,
  };
  if (opts.pdfBase64) {
    body.attachments = [{ filename: opts.filename, content: opts.pdfBase64 }];
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("Resend error:", data);
    return false;
  }
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY");
    const MUNICIPAL_SERVICE_ID = Deno.env.get("ASAAS_NF_MUNICIPAL_SERVICE_ID")?.trim();
    const MUNICIPAL_SERVICE_NAME = Deno.env.get("ASAAS_NF_MUNICIPAL_SERVICE_NAME")?.trim() ||
      "Intermediação de negócios / plataforma digital";

    if (!ASAAS_API_KEY) {
      return new Response(JSON.stringify({ error: "ASAAS_API_KEY não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!MUNICIPAL_SERVICE_ID) {
      return new Response(
        JSON.stringify({
          error:
            "Configure ASAAS_NF_MUNICIPAL_SERVICE_ID (ID do serviço municipal no Asaas — Notas Fiscais).",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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

    const { professional_id, wallet_transaction_ids } = await req.json();
    if (!professional_id || !Array.isArray(wallet_transaction_ids) || wallet_transaction_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: "professional_id e wallet_transaction_ids são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: existingItem } = await supabase
      .from("platform_fee_invoice_items")
      .select("wallet_transaction_id")
      .in("wallet_transaction_id", wallet_transaction_ids)
      .limit(1)
      .maybeSingle();

    if (existingItem?.wallet_transaction_id) {
      return new Response(
        JSON.stringify({ error: "Uma ou mais transações já possuem nota fiscal emitida." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: txs, error: txErr } = await supabase
      .from("wallet_transactions")
      .select("id, professional_id, status, platform_fee_amount")
      .in("id", wallet_transaction_ids)
      .eq("professional_id", professional_id)
      .eq("status", "transferred");

    if (txErr || !txs?.length || txs.length !== wallet_transaction_ids.length) {
      return new Response(
        JSON.stringify({
          error: "Transações inválidas: confira se todas já foram repassadas e pertencem ao profissional.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const platformFeeTotal = txs.reduce((s, t) => s + Number(t.platform_fee_amount || 0), 0);
    if (platformFeeTotal <= 0) {
      return new Response(
        JSON.stringify({ error: "Soma da comissão da plataforma é zero — nada a faturar." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: fiscal, error: fiscalErr } = await supabase
      .from("professional_fiscal_data")
      .select(
        "fiscal_name, fiscal_email, fiscal_document, fiscal_address_street, fiscal_address_number, fiscal_address_complement, fiscal_address_neighborhood, fiscal_address_city, fiscal_address_state, fiscal_address_zip",
      )
      .eq("professional_id", professional_id)
      .maybeSingle();

    if (fiscalErr || !fiscal?.fiscal_email || !fiscal?.fiscal_document) {
      return new Response(
        JSON.stringify({
          error: "Cadastro fiscal incompleto (e-mail e CPF/CNPJ da NF são obrigatórios).",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const customerId = await findOrCreateAsaasCustomer(ASAAS_API_KEY, fiscal as any);

    const today = new Date().toISOString().slice(0, 10);
    const serviceDescription =
      "Taxa de intermediação e uso da plataforma Chamô — comissão sobre valores repassados ao prestador, conforme transações vinculadas ao repasse.";

    const scheduleBody = {
      customer: customerId,
      serviceDescription,
      observations:
        "Documento emitido em nome do tomador (prestador de serviços cadastrado). Referente à comissão da plataforma sobre operações concluídas via Chamô.",
      value: Number(platformFeeTotal.toFixed(2)),
      deductions: 0,
      effectiveDate: today,
      municipalServiceId: MUNICIPAL_SERVICE_ID,
      municipalServiceName: MUNICIPAL_SERVICE_NAME,
      taxes: defaultTaxes(),
      externalReference: `chamo_fee_${professional_id}_${wallet_transaction_ids[0]}_${Date.now()}`,
    };

    const scheduled = await asaasReq(ASAAS_API_KEY, "/invoices", "POST", scheduleBody);
    const invoiceId = scheduled.id as string;

    await asaasReq(ASAAS_API_KEY, `/invoices/${invoiceId}/authorize`, "POST", {});

    let pdfUrl: string | null = null;
    let xmlUrl: string | null = null;
    let nfNumber: string | null = null;
    let invStatus = "AUTHORIZED";

    for (let i = 0; i < 24; i++) {
      const inv = await asaasReq(ASAAS_API_KEY, `/invoices/${invoiceId}`, "GET");
      invStatus = inv.status || invStatus;
      pdfUrl = inv.pdfUrl || pdfUrl;
      xmlUrl = inv.xmlUrl || xmlUrl;
      nfNumber = inv.number || inv.rpsNumber || nfNumber;
      if (inv.status === "ERROR") {
        throw new Error(inv.statusDescription || "Erro na emissão da NFS-e no Asaas");
      }
      if (pdfUrl && (inv.status === "AUTHORIZED" || inv.status === "SYNCHRONIZED")) break;
      if (pdfUrl && i >= 8) break;
      await new Promise((r) => setTimeout(r, 1500));
    }

    const { data: inserted, error: insErr } = await supabase
      .from("platform_fee_invoices")
      .insert({
        professional_id,
        asaas_invoice_id: invoiceId,
        asaas_customer_id: customerId,
        invoice_value: Number(platformFeeTotal.toFixed(2)),
        platform_fee_total: Number(platformFeeTotal.toFixed(2)),
        pdf_url: pdfUrl,
        xml_url: xmlUrl,
        nf_number: nfNumber,
        status: invStatus === "AUTHORIZED" ? "authorized" : invStatus.toLowerCase(),
        service_description: serviceDescription,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (insErr || !inserted?.id) {
      console.error("DB insert invoice:", insErr);
      return new Response(
        JSON.stringify({
          error: "Nota emitida no Asaas, mas falhou ao salvar no banco. Anote o ID: " + invoiceId,
          asaas_invoice_id: invoiceId,
          pdf_url: pdfUrl,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const invoiceRowId = inserted.id;

    const itemRows = wallet_transaction_ids.map((wid: string) => ({
      invoice_id: invoiceRowId,
      wallet_transaction_id: wid,
    }));
    const { error: itemErr } = await supabase.from("platform_fee_invoice_items").insert(itemRows);
    if (itemErr) {
      console.error("DB insert invoice items:", itemErr);
    }

    const toEmail = (fiscal.fiscal_email || "").trim();
    let emailSent = false;
    if (toEmail) {
      const pdfB64 = pdfUrl ? await fetchPdfBase64(pdfUrl, ASAAS_API_KEY) : null;
      emailSent = await sendResendEmail({
        to: toEmail,
        subject: "Chamô — sua nota fiscal de comissão da plataforma",
        html: `<div style="max-width:560px;margin:0 auto;padding:24px;">${CHAMO_EMAIL_INTRO_HTML}</div>`,
        pdfBase64: pdfB64,
        filename: `nota-fiscal-chamo-${nfNumber || invoiceId.slice(-8)}.pdf`,
        pdfUrlFallback: pdfUrl,
      });
      if (emailSent) {
        await supabase
          .from("platform_fee_invoices")
          .update({ email_sent_at: new Date().toISOString() })
          .eq("id", invoiceRowId);
      }
    }

    const { data: pro } = await supabase.from("professionals").select("user_id").eq("id", professional_id).maybeSingle();
    if (pro?.user_id) {
      await supabase.from("notifications").insert({
        user_id: pro.user_id,
        title: "Nota fiscal disponível",
        message: "Sua NFS-e da comissão Chamô foi emitida. Veja em Carteira ou no e-mail cadastrado.",
        type: "success",
        link: "/pro/financeiro",
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        id: invoiceRowId,
        asaas_invoice_id: invoiceId,
        pdf_url: pdfUrl,
        nf_number: nfNumber,
        email_sent: emailSent,
        value: platformFeeTotal,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("emit_transfer_fee_invoice:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
