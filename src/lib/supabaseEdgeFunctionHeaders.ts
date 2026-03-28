/**
 * Headers para invocar Edge Functions a partir do browser.
 * Chaves publishable (`sb_publishable_*`) não são JWT — o gateway do Supabase
 * rejeita `Authorization: Bearer <publishable>` com erro de formatação.
 * Chave legada `anon` (três segmentos, começa com eyJ) continua com Bearer + apikey.
 */
export function supabaseEdgeAnonymousHeaders(apiKey: string): Record<string, string> {
  const key = apiKey.trim();
  const headers: Record<string, string> = { apikey: key };
  const parts = key.split(".");
  const looksLikeJwtAnon = parts.length === 3 && parts[0].startsWith("eyJ");
  if (looksLikeJwtAnon) {
    headers.Authorization = `Bearer ${key}`;
  }
  return headers;
}
