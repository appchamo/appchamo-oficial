/**
 * Proxy para a API de municípios do IBGE.
 * Evita CORS/rede no app (Capacitor) chamando o IBGE pelo servidor.
 */
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const IBGE_URL = "https://servicodados.ibge.gov.br/api/v1/localidades/estados";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let uf = "";
  if (req.method === "GET") {
    const url = new URL(req.url);
    uf = (url.searchParams.get("uf") ?? "").trim().toUpperCase();
  } else {
    try {
      const body = await req.json();
      uf = String((body as { uf?: string }).uf ?? "").trim().toUpperCase();
    } catch {
      return new Response(JSON.stringify({ error: "Body JSON inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  if (!uf || uf.length !== 2) {
    return new Response(JSON.stringify({ error: "UF inválida (use sigla de 2 letras)" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const res = await fetch(`${IBGE_URL}/${uf}/municipios`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return new Response(JSON.stringify({ error: "IBGE indisponível", cities: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const data = await res.json();
    if (!Array.isArray(data)) {
      return new Response(JSON.stringify({ cities: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const names = (data as { nome?: string }[])
      .map((c) => (c.nome ?? "").trim())
      .filter(Boolean);
    const cities = Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, "pt-BR"));
    return new Response(JSON.stringify({ cities }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("cities-by-state:", e);
    return new Response(JSON.stringify({ error: "Erro ao buscar cidades", cities: [] }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
