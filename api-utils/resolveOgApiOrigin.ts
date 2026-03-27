/**
 * Origem absoluta para `og:image` (`/api/professional-og-image`, etc.).
 * Por defeito usa o mesmo host do pedido (ex.: appchamo.com) para alinhar com o link partilhado.
 * Se o certificado do custom falhar para crawlers: `OG_SHARE_BASE_URL` ou `OG_IMAGE_ORIGIN` (HTTPS).
 * Último recurso: `VERCEL_URL` (*.vercel.app).
 */
export function resolveOgApiOrigin(req: Request): string {
  const explicit = (process.env.OG_SHARE_BASE_URL || process.env.OG_IMAGE_ORIGIN || "")
    .trim()
    .replace(/\/$/, "");
  if (explicit.startsWith("https://") || explicit.startsWith("http://")) {
    return explicit;
  }

  try {
    const origin = new URL(req.url).origin;
    if (origin.startsWith("https://") && !origin.includes("localhost")) {
      return origin;
    }
  } catch {
    /* ignore */
  }

  const vu = (process.env.VERCEL_URL || "").trim().replace(/\/$/, "");
  if (vu && !vu.includes("localhost")) {
    return `https://${vu}`;
  }

  try {
    return new URL(req.url).origin;
  } catch {
    return "https://appchamo.com";
  }
}
