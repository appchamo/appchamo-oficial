/**
 * Origem onde as rotas `/api/professional-og-image` (e similares) estão realmente hospedadas.
 *
 * O HTML de OG pode ser servido em domínio custom com TLS problemático; o WhatsApp/Facebook
 * precisam buscar `og:image` por HTTPS válido — na Vercel usamos `VERCEL_URL` (ex.: *.vercel.app).
 *
 * Opcional no Vercel: `OG_SHARE_BASE_URL` ou `OG_IMAGE_ORIGIN` = mesma base que `VITE_SHARE_OG_BASE_URL`.
 */
export function resolveOgApiOrigin(req: Request): string {
  const explicit = (process.env.OG_SHARE_BASE_URL || process.env.OG_IMAGE_ORIGIN || "")
    .trim()
    .replace(/\/$/, "");
  if (explicit.startsWith("https://") || explicit.startsWith("http://")) {
    return explicit;
  }

  const vu = (process.env.VERCEL_URL || "").trim().replace(/\/$/, "");
  if (vu && !vu.includes("localhost")) {
    return `https://${vu}`;
  }

  try {
    return new URL(req.url).origin;
  } catch {
    return "https://app.chamo.com";
  }
}
