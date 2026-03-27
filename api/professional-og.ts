/**
 * Open Graph para partilha de perfil profissional (pré-visualização no WhatsApp).
 * Requer: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY no Vercel.
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
  const key = url.searchParams.get("key")?.trim() || "";
  if (!key || key.length > 200) {
    return new Response("Not found", { status: 404 });
  }

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const isUuid = uuidRe.test(key);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publicApp = resolveOgPublicAppOrigin(req);

  const fallbackRedirect = `${publicApp}/professional/${encodeURIComponent(key)}`;

  if (!supabaseUrl || !serviceKey) {
    const t = escAttr("Profissional no Chamô");
    const seal = escAttr(`${publicApp}/seals/push/seal_chamo.png`);
    const desc = escAttr("Ver perfil no Chamô — serviços verificados e chat direto.");
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/>
<meta property="og:title" content="${t}" />
<meta property="og:description" content="${desc}" />
<meta property="og:image" content="${seal}" />
<meta property="og:site_name" content="Chamô" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="${seal}" />
<meta http-equiv="refresh" content="0;url=${escAttr(fallbackRedirect)}" />
</head><body><p><a href="${escAttr(fallbackRedirect)}">Abrir no Chamô</a></p></body></html>`;
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const proQuery = supabase
    .from("professionals")
    .select("id, user_id, slug, profession_id, category_id")
    .eq(isUuid ? "id" : "slug", key)
    .maybeSingle();

  const { data: pro, error: proErr } = await proQuery;
  if (proErr || !pro) {
    return new Response("Not found", { status: 404 });
  }

  const proRow = pro as {
    id: string;
    user_id: string;
    slug: string | null;
    profession_id: string | null;
    category_id: string | null;
  };

  let professionName: string | null = null;
  let categoryName: string | null = null;
  if (proRow.profession_id) {
    const { data: pr } = await supabase.from("professions").select("name").eq("id", proRow.profession_id).maybeSingle();
    professionName = (pr as { name?: string } | null)?.name ?? null;
  }
  if (proRow.category_id) {
    const { data: cat } = await supabase.from("categories").select("name").eq("id", proRow.category_id).maybeSingle();
    categoryName = (cat as { name?: string } | null)?.name ?? null;
  }

  const { data: prof } = await supabase
    .from("profiles")
    .select("full_name, display_name, avatar_url, user_type")
    .eq("user_id", proRow.user_id)
    .maybeSingle();

  const profRow = prof as {
    full_name?: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
    user_type?: string | null;
  } | null;

  const displayName = (profRow?.display_name || profRow?.full_name || "Profissional").trim();
  const rolePart =
    professionName && professionName !== "—"
      ? professionName
      : categoryName && categoryName !== "—"
        ? categoryName
        : profRow?.user_type === "company"
          ? "Empresa"
          : "Profissional";
  const title = `${displayName} - ${rolePart} - Perfil Oficial | Chamô`;
  const description = `Contrate ${displayName} no Chamô — serviços verificados e chat direto.`;

  /** Mesma origem que a página OG — o crawler do WhatsApp acede aqui e nós servimos bytes (evita WebP/signed URL direto no meta). */
  const ogImage = `${publicApp}/api/professional-og-image?key=${encodeURIComponent(key)}`;

  const canonicalKey = (proRow.slug || proRow.id).trim();
  const canonical = `${publicApp}/professional/${encodeURIComponent(canonicalKey)}`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escText(title)}</title>
<meta property="og:type" content="profile" />
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
<meta http-equiv="refresh" content="0;url=${escAttr(canonical)}" />
<script>location.replace(${JSON.stringify(canonical)});</script>
</head>
<body style="font-family:system-ui,sans-serif;padding:1.5rem;color:#333;">
<p>${escText(description)}</p>
<p><a href="${escAttr(canonical)}">Abrir perfil no Chamô</a></p>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
