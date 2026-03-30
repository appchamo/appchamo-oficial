import { supabase, hardClearNativeAuthSession } from "@/integrations/supabase/client";
import { PENDING_EMAIL_SIGNUP_KEY } from "@/lib/pendingEmailSignup";

function authStorageKeys(): string[] {
  const ref = String(import.meta.env.VITE_SUPABASE_URL ?? "")
    .replace(/^https?:\/\//, "")
    .split(".")[0];
  const tokenKey = ref ? `sb-${ref}-auth-token` : "";
  return [
    "chamo_cached_profile",
    "chamo_cached_roles",
    "signup_in_progress",
    "manual_login_intent",
    "chamo_oauth_just_landed",
    "chamo_featured_reload_after_oauth",
    "chamo_hang_reload_grace_until",
    ...(tokenKey ? [tokenKey] : []),
  ];
}

/**
 * Remove tokens e caches locais sem chamar a API de revoke (conta já inexistente no servidor).
 */
export async function clearLocalChamoSession(): Promise<void> {
  for (const k of authStorageKeys()) {
    try {
      localStorage.removeItem(k);
    } catch {
      void 0;
    }
  }
  try {
    sessionStorage.removeItem("chamo_featured_reload_after_oauth");
    sessionStorage.removeItem("chamo_oauth_just_landed");
    sessionStorage.removeItem("chamo_hang_reload_grace_until");
    sessionStorage.removeItem(PENDING_EMAIL_SIGNUP_KEY);
  } catch {
    void 0;
  }
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  await hardClearNativeAuthSession();
}
