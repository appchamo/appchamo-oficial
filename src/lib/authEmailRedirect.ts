import { Capacitor } from "@capacitor/core";
import { getPublicAppBaseUrl } from "@/lib/publicAppUrl";

/**
 * URL para o e-mail de confirmação do Supabase.
 * No app nativo: página HTTPS que redireciona para `com.chamo.app://` (evita ficar no login web no Safari).
 * Na web: `/login` com hash de sessão (detectSessionInUrl).
 *
 * Supabase Dashboard → Authentication → URL Configuration → Redirect URLs:
 * inclua `https://SEU_DOMINIO/auth/email-confirm` (ex.: appchamo.com e app.chamo.com, conforme VITE_PUBLIC_APP_URL).
 */
export function getAuthEmailRedirectUrl(): string {
  const base = getPublicAppBaseUrl().replace(/\/$/, "");
  if (Capacitor.isNativePlatform()) {
    return `${base}/auth/email-confirm`;
  }
  return `${base}/login`;
}
