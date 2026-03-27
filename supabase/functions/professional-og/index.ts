/**
 * Redirecionamento para a rota real de Open Graph no Vercel (`/api/professional-og`).
 *
 * As Edge Functions do Supabase não podem servir HTML: GET com `Content-Type: text/html`
 * é reescrito para `text/plain` (documentação oficial), o que impede pré-visualização no WhatsApp
 * e faz o Safari mostrar o markup como texto.
 *
 * Defina o secret `OG_SHARE_REDIRECT_BASE` (ex.: https://teu-projeto.vercel.app ou https://app.chamo.com
 * quando o SSL estiver correto) para onde o crawler deve ir obter o HTML com meta og:*.
 */
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const key = url.searchParams.get("key")?.trim() || "";
  if (!key || key.length > 200) {
    return new Response("Not found", { status: 404, headers: corsHeaders });
  }

  const base = (
    Deno.env.get("OG_SHARE_REDIRECT_BASE") ??
    Deno.env.get("PUBLIC_APP_URL") ??
    "https://app.chamo.com"
  ).replace(/\/$/, "");

  const target = `${base}/api/professional-og?key=${encodeURIComponent(key)}`;

  return new Response(null, {
    status: 302,
    headers: {
      ...corsHeaders,
      Location: target,
      "Cache-Control": "public, max-age=60",
    },
  });
});
