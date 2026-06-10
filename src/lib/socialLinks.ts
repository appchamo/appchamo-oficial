/** Builders de link das redes sociais do profissional. */

/** WhatsApp: só dígitos; assume Brasil (prefixo 55) se vier sem DDI. */
export function buildWhatsappUrl(raw: string | null | undefined): string | null {
  const d = (raw || "").replace(/\D/g, "");
  if (d.length < 10) return null;
  const withCc = d.startsWith("55") ? d : (d.length <= 11 ? "55" + d : d);
  return `https://wa.me/${withCc}`;
}

/** Instagram: tira @, espaços e URL; fica só o handle. */
export function buildInstagramUrl(raw: string | null | undefined): string | null {
  let h = (raw || "").trim();
  if (!h) return null;
  h = h.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/\/+$/, "").trim();
  if (!h) return null;
  return `https://instagram.com/${h}`;
}

/** Outro link: garante https://. */
export function buildOtherUrl(raw: string | null | undefined): string | null {
  const s = (raw || "").trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}
