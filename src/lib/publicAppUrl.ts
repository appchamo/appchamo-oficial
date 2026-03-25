/**
 * Base URL pública em https para links copiáveis (Instagram, WhatsApp).
 * No app nativo, `window.location.origin` é `capacitor://...` — não serve para compartilhar.
 */
export function getPublicAppBaseUrl(): string {
  const raw = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim();
  if (raw) {
    const u = raw.replace(/\/$/, "");
    if (u.startsWith("https://") || u.startsWith("http://")) return u;
  }
  if (typeof window !== "undefined") {
    const o = (window.location.origin || "").replace(/\/$/, "");
    if (o.startsWith("https://") || o.startsWith("http://")) return o;
  }
  return "https://app.chamo.com";
}

/** Link que o cliente abre no navegador: perfil público (agendamento pelo botão no perfil). */
export function getPublicProfessionalProfileUrl(proKey: string): string {
  const key = (proKey || "").trim();
  if (!key) return "";
  return `${getPublicAppBaseUrl()}/professional/${encodeURIComponent(key)}`;
}

/**
 * @deprecated Prefer `getPublicProfessionalProfileUrl`. Mantido para links antigos;
 * a rota `/agendar/:key` redireciona para `/professional/:key`.
 */
export function getPublicAgendaUrl(proKey: string): string {
  const key = (proKey || "").trim();
  if (!key) return "";
  return `${getPublicAppBaseUrl()}/agendar/${encodeURIComponent(key)}`;
}
