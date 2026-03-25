import { supabase } from "@/integrations/supabase/client";

/** Margem antes do exp do JWT para forçar refresh (fluxos longos, ex.: cadastro em várias etapas). */
const EXPIRY_SKEW_SEC = 180;

/**
 * Retorna access_token válido para Edge Functions (complete-signup, upload-document, etc.).
 * Não use o token do React context — pode estar expirado após vários minutos no formulário.
 */
export async function getAccessTokenForEdgeFunctions(): Promise<string | null> {
  const { data: { session: initial } } = await supabase.auth.getSession();
  const now = Math.floor(Date.now() / 1000);
  const exp = initial?.expires_at;
  const tokenOk =
    !!initial?.access_token &&
    (exp == null || exp > now + EXPIRY_SKEW_SEC);

  if (tokenOk) return initial!.access_token!;

  const { data: { session: refreshed }, error } = await supabase.auth.refreshSession();
  if (!error && refreshed?.access_token) return refreshed.access_token;

  return null;
}
