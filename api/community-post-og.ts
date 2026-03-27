/**
 * Gera HTML com Open Graph para pré-visualização rica (WhatsApp, Instagram, etc.).
 * Requer no Vercel: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";
import { resolveOgPublicAppOrigin } from "../api-utils/resolveOgPublicOrigin";

function escAttr(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escText(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const postId = url.searchParams.get("id")?.trim() || "";
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!postId || !uuidRe.test(postId)) {
    return new Response("Not found", { status: 404 });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publicApp = resolveOgPublicAppOrigin(req);

  if (!supabaseUrl || !serviceKey) {
    const title = escAttr("Comunidade Chamô");
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/>
<meta property="og:title" content="${title}" />
<meta property="og:description" content="Publicação na Comunidade Chamô" />
<meta property="og:site_name" content="Chamô" />
<meta http-equiv="refresh" content="0;url=${escAttr(`${publicApp}/home?feed=comunidade&post=${postId}`)}" />
</head><body><p><a href="${escAttr(`${publicApp}/home?feed=comunidade&post=${postId}`)}">Abrir no Chamô</a></p></body></html>`;
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: post } = await supabase
    .from("community_posts")
    .select("id, body, image_url, author_id, created_at")
    .eq("id", postId)
    .maybeSingle();

  if (!post) {
    return new Response("Not found", { status: 404 });
  }

  const { data: prof } = await supabase
    .from("profiles")
    .select("display_name, full_name")
    .eq("user_id", post.author_id)
    .maybeSingle();

  const authorName = (prof?.display_name || prof?.full_name || "Profissional Chamô").trim();
  const bodySnippet = (post.body || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
  const description = bodySnippet.length > 0 ? bodySnippet : "Publicação na Comunidade Chamô";
  const title = `${authorName} no Chamô`;
  const ogImage =
    post.image_url && String(post.image_url).startsWith("http")
      ? String(post.image_url)
      : `${publicApp}/seals/push/seal_chamo.png`;

  const canonical = `${publicApp}/p/comunidade/${postId}`;
  const appOpen = `${publicApp}/home?feed=comunidade&post=${encodeURIComponent(postId)}`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escText(title)}</title>
<meta property="og:type" content="article" />
<meta property="og:title" content="${escAttr(title)}" />
<meta property="og:description" content="${escAttr(description)}" />
<meta property="og:image" content="${escAttr(ogImage)}" />
<meta property="og:url" content="${escAttr(canonical)}" />
<meta property="og:site_name" content="Chamô" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escAttr(title)}" />
<meta name="twitter:description" content="${escAttr(description)}" />
<meta name="twitter:image" content="${escAttr(ogImage)}" />
<link rel="canonical" href="${escAttr(canonical)}" />
<meta http-equiv="refresh" content="0;url=${escAttr(appOpen)}" />
<script>location.replace(${JSON.stringify(appOpen)});</script>
</head>
<body style="font-family:system-ui,sans-serif;padding:1.5rem;color:#333;">
<p>${escText(description)}</p>
<p><a href="${escAttr(appOpen)}">Abrir no Chamô</a></p>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
