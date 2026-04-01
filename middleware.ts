import { next, rewrite } from "@vercel/edge";

/**
 * WhatsApp / Meta pedem `/professional/:key` ou `/p/comunidade/:id` mas o SPA só devolve `index.html` sem OG.
 * Para crawlers, reescrevemos para as rotas `/api/*-og`.
 */
/** Inclui `meta-externalagent` — é o que o Depurador de compartilhamento da Meta usa (não só facebookexternalhit). */
const OG_CRAWLER_UA =
  /facebookexternalhit|Facebot|meta-externalagent|WhatsApp|Instagram|LinkedInBot|Slackbot|Twitterbot|SkypeUriPreview|TelegramBot|Discordbot|Bytespider|Pinterest|vkShare|redditbot|Applebot|Googlebot|bingbot/i;

const POST_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** `:postId+` em alguns deploys Vite/Vercel não fazia match; um segmento `:postId` basta para o UUID. */
export const config = {
  matcher: ["/professional/:path+", "/p/comunidade/:postId"],
};

export default function middleware(request: Request): Response {
  const ua = request.headers.get("user-agent") || "";
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);

  if (segments[0] === "p" && segments[1] === "comunidade" && segments.length === 3) {
    if (!OG_CRAWLER_UA.test(ua)) {
      return next();
    }
    const postId = decodeURIComponent(segments[2]).trim();
    if (!postId || !POST_UUID_RE.test(postId)) {
      return next();
    }
    return rewrite(new URL(`/api/community-post-og?id=${encodeURIComponent(postId)}`, request.url));
  }

  if (!OG_CRAWLER_UA.test(ua)) {
    return next();
  }

  if (segments[0] !== "professional" || segments.length !== 2) {
    return next();
  }

  const key = decodeURIComponent(segments[1]).trim();
  if (!key || key.length > 200) {
    return next();
  }

  return rewrite(new URL(`/api/professional-og?key=${encodeURIComponent(key)}`, request.url));
}
