/**
 * Origem pública usada em redirects/canonical nas rotas OG (Vercel Edge).
 * Prioridade: OG_PUBLIC_APP_URL (quando o domínio principal tiver SSL válido) → host do próprio pedido
 * (ex.: *.vercel.app) → envs públicos → fallback.
 */
export function resolveOgPublicAppOrigin(req: Request): string {
  const explicit = (process.env.OG_PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
  if (explicit.startsWith("https://") || explicit.startsWith("http://")) {
    return explicit;
  }
  try {
    const u = new URL(req.url);
    if (u.host) return u.origin;
  } catch {
    /* ignore */
  }
  return (process.env.VITE_PUBLIC_APP_URL || process.env.PUBLIC_APP_URL || "https://appchamo.com").replace(/\/$/, "");
}
