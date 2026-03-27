import { next, rewrite } from "@vercel/edge";

/**
 * WhatsApp / Meta pedem `/professional/:key` mas o SPA só devolve `index.html` sem OG.
 * Para crawlers, reescrevemos para `/api/professional-og` (HTML com meta + redirect humano).
 */
const OG_CRAWLER_UA =
  /facebookexternalhit|Facebot|WhatsApp|Instagram|LinkedInBot|Slackbot|Twitterbot|SkypeUriPreview|TelegramBot|Discordbot|Bytespider|Pinterest|vkShare|redditbot|Applebot/i;

export const config = {
  matcher: ["/professional/:path+"],
};

export default function middleware(request: Request): Response {
  const ua = request.headers.get("user-agent") || "";
  if (!OG_CRAWLER_UA.test(ua)) {
    return next();
  }

  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments[0] !== "professional" || segments.length !== 2) {
    return next();
  }

  const key = decodeURIComponent(segments[1]).trim();
  if (!key || key.length > 200) {
    return next();
  }

  return rewrite(new URL(`/api/professional-og?key=${encodeURIComponent(key)}`, request.url));
}
