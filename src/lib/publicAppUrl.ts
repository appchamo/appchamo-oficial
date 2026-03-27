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

/**
 * Origem HTTPS onde estão as rotas `/api/*-og` (Vercel).
 * Em builds na Vercel, usa automaticamente `VERCEL_URL` (HTTPS válido) quando `app.chamo.com` estiver com SSL inválido.
 */
export function getOgShareBaseUrl(): string {
  const raw = (import.meta.env.VITE_SHARE_OG_BASE_URL as string | undefined)?.trim();
  if (raw) {
    const u = raw.replace(/\/$/, "");
    if (u.startsWith("https://") || u.startsWith("http://")) return u;
  }
  const vercel = (import.meta.env.VITE_VERCEL_DEPLOYMENT_URL as string | undefined)?.trim();
  if (vercel && (vercel.startsWith("https://") || vercel.startsWith("http://"))) {
    return vercel.replace(/\/$/, "");
  }
  return getPublicAppBaseUrl();
}

/** Link que o cliente abre no navegador: perfil público (agendamento pelo botão no perfil). */
export function getPublicProfessionalProfileUrl(proKey: string): string {
  const key = (proKey || "").trim();
  if (!key) return "";
  return `${getPublicAppBaseUrl()}/professional/${encodeURIComponent(key)}`;
}

/**
 * URL para partilhar o perfil em redes (WhatsApp, etc.) com Open Graph.
 * Deve apontar para `api/professional-og` no Vercel — Edge Functions do Supabase reescrevem `text/html` para `text/plain` e quebram pré-visualização.
 */
export function getProfessionalProfileShareUrl(proKey: string): string {
  const key = (proKey || "").trim();
  if (!key) return "";
  return `${getOgShareBaseUrl()}/api/professional-og?key=${encodeURIComponent(key)}`;
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

/**
 * URL pública para partilhar um post da Comunidade (Open Graph no WhatsApp/Instagram).
 * No Vercel: requer a função `api/community-post-og` e variáveis SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */
export function getCommunityPostShareUrl(postId: string): string {
  const id = (postId || "").trim();
  if (!id) return "";
  return `${getOgShareBaseUrl()}/api/community-post-og?id=${encodeURIComponent(id)}`;
}

/** Rota in-app para abrir o post na Comunidade (canonical / partilha “bonita”). */
export function getCommunityPostInAppPath(postId: string): string {
  const id = (postId || "").trim();
  if (!id) return "/home?feed=comunidade";
  return `/p/comunidade/${encodeURIComponent(id)}`;
}
