/**
 * Proxy da foto de perfil para og:image (WhatsApp / Facebook).
 * Mesma origem que a página OG, URL curta; evita signed URLs enormes e falhas do crawler em storage direto.
 */
import { createClient } from "@supabase/supabase-js";
import { resolveOgPublicAppOrigin } from "../api-utils/resolveOgPublicOrigin";
import { extractUploadsObjectPath } from "../api-utils/extractUploadsObjectPath";

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(req.url);
  const key = url.searchParams.get("key")?.trim() || "";
  if (!key || key.length > 200) {
    return new Response("Not found", { status: 404 });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publicApp = resolveOgPublicAppOrigin(req);
  const sealUrl = `${publicApp}/seals/push/seal_chamo.png`;

  const redirectSeal = () => Response.redirect(sealUrl, 302);

  if (!supabaseUrl || !serviceKey) {
    return redirectSeal();
  }

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const isUuid = uuidRe.test(key);

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: pro, error: proErr } = await supabase
    .from("professionals")
    .select("id, user_id, slug")
    .eq(isUuid ? "id" : "slug", key)
    .maybeSingle();

  if (proErr || !pro) {
    return redirectSeal();
  }

  const proRow = pro as { user_id: string };
  const { data: prof } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("user_id", proRow.user_id)
    .maybeSingle();

  const avatarRef = (prof as { avatar_url?: string | null } | null)?.avatar_url ?? null;
  const raw = (avatarRef || "").trim();

  if (!raw) {
    return redirectSeal();
  }

  let fetchUrl: string | null = null;
  const objectPath = extractUploadsObjectPath(raw);

  if (objectPath) {
    const { data, error } = await supabase.storage.from("uploads").createSignedUrl(objectPath, 3600);
    if (!error && data?.signedUrl) fetchUrl = data.signedUrl;
  } else if (/^https?:\/\//i.test(raw)) {
    fetchUrl = raw;
  }

  if (!fetchUrl) {
    return redirectSeal();
  }

  try {
    const imgRes = await fetch(fetchUrl, {
      headers: { Accept: "image/*,*/*;q=0.8" },
      redirect: "follow",
    });
    if (!imgRes.ok) {
      return redirectSeal();
    }
    const ct = imgRes.headers.get("content-type") || "application/octet-stream";
    if (!ct.startsWith("image/")) {
      return redirectSeal();
    }
    const len = imgRes.headers.get("content-length");
    if (len && Number(len) > 2_500_000) {
      return redirectSeal();
    }

    return new Response(imgRes.body, {
      status: 200,
      headers: {
        "Content-Type": ct,
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch {
    return redirectSeal();
  }
}
