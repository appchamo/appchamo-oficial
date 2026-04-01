/**
 * Só devemos expulsar o utilizador quando a API confirma sessão inválida.
 * Erros de rede / timeout / 5xx / rate limit após OAuth costumavam disparar logout imediato
 * (Home → /login em ~1s) porque getUser() falhava de forma transitória.
 */
export function isFatalAuthUserError(error: { message?: string; status?: number } | null | undefined): boolean {
  if (!error) return false;
  const msg = (error.message || "").toLowerCase();
  const st = error.status;

  if (st === 408 || st === 429) return false;
  if (typeof st === "number" && st >= 500 && st < 600) return false;

  if (msg.includes("failed to fetch") || msg.includes("network error") || msg.includes("load failed")) return false;
  if (msg.includes("timeout") || msg.includes("timed out") || msg.includes("aborted")) return false;
  if (msg.includes("err_network") || msg.includes("econnreset") || msg.includes("enotfound")) return false;

  if (st === 401 || st === 403) return true;

  if (msg.includes("invalid refresh token") || msg.includes("refresh token")) return true;
  if (msg.includes("invalid jwt") || msg.includes("jwt expired") || msg.includes("jwt")) return true;
  if (msg.includes("user not found") || msg.includes("session not found")) return true;

  return false;
}
