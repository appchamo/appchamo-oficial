/**
 * Origem HTTPS de onde buscar `/seals/push/seal_chamo.png` no servidor.
 * Quando o domínio custom (ex.: appchamo.com) tem certificado inválido, fetch para esse host falha —
 * usamos primeiro VERCEL_URL (deploy com TLS válido) ou OG_SEAL_ORIGIN.
 */
export function resolveSealFetchOrigins(req: Request): string[] {
  const out: string[] = [];

  const explicit = (process.env.OG_SEAL_ORIGIN || "").trim().replace(/\/$/, "");
  if (explicit.startsWith("https://") || explicit.startsWith("http://")) {
    out.push(explicit);
  }

  const vu = (process.env.VERCEL_URL || "").trim().replace(/\/$/, "");
  if (vu && !vu.includes("localhost")) {
    const u = `https://${vu}`;
    if (!out.includes(u)) out.push(u);
  }

  try {
    const origin = new URL(req.url).origin;
    if (!out.includes(origin)) out.push(origin);
  } catch {
    /* ignore */
  }

  return out;
}

export function sealImageUrlForMeta(req: Request): string {
  const origins = resolveSealFetchOrigins(req);
  const base = origins[0] || "https://app.chamo.com";
  return `${base.replace(/\/$/, "")}/seals/push/seal_chamo.png`;
}
