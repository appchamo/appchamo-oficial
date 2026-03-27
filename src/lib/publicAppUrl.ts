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
 * Usa o mesmo domínio canónico do app (`VITE_PUBLIC_APP_URL` / origem no browser), para links de partilha
 * ficarem curtos (ex.: appchamo.com). Só force outra base com `VITE_SHARE_OG_BASE_URL` (ex.: SSL fraco no custom).
 */
export function getOgShareBaseUrl(): string {
  const raw = (import.meta.env.VITE_SHARE_OG_BASE_URL as string | undefined)?.trim();
  if (raw) {
    const u = raw.replace(/\/$/, "");
    if (u.startsWith("https://") || u.startsWith("http://")) return u;
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
 * URL para partilhar o perfil em redes (WhatsApp, etc.) com Open Graph (`/api/professional-og`).
 *
 * Opcional: `VITE_SHARE_OG_BASE_URL` se precisares de outra origem para `/api/*-og` (SSL no custom).
 * Na Vercel: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` para o HTML/ imagem OG dinâmicos (senão cai no selo genérico).
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
