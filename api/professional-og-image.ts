/**
 * Devolve os bytes da foto de perfil para og:image (WhatsApp / Facebook).
 * Usa download direto no Storage (service role) — sem signed URL + fetch.
 * Em falta: devolve o selo com 200 (redirect quebra alguns crawlers).
 */
import { createClient } from "@supabase/supabase-js";
import { resolveOgPublicAppOrigin } from "../api-utils/resolveOgPublicOrigin";
import { extractUploadsObjectPath } from "../api-utils/extractUploadsObjectPath";

export const config = { runtime: "edge" };

function mimeFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

async function sealBytesResponse(publicApp: string): Promise<Response> {
  const sealUrl = `${publicApp}/seals/push/seal_chamo.png`;
  try {
    const r = await fetch(sealUrl, { redirect: "follow" });
    if (!r.ok) {
      return new Response("Not found", { status: 404 });
    }
    const buf = await r.arrayBuffer();
    const ct = r.headers.get("content-type") || "image/png";
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": ct,
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

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

  if (!supabaseUrl || !serviceKey) {
    return sealBytesResponse(publicApp);
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
    return sealBytesResponse(publicApp);
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
    return sealBytesResponse(publicApp);
  }

  const objectPath = extractUploadsObjectPath(raw);

  if (objectPath) {
    const { data: blob, error: dlErr } = await supabase.storage.from("uploads").download(objectPath);
    if (dlErr || !blob) {
      return sealBytesResponse(publicApp);
    }
    const buf = await blob.arrayBuffer();
    const ct =
      blob.type && blob.type !== "application/octet-stream" ? blob.type : mimeFromPath(objectPath);
    if (!ct.startsWith("image/")) {
      return sealBytesResponse(publicApp);
    }
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": ct,
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    });
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const imgRes = await fetch(raw, {
        headers: { Accept: "image/*,*/*;q=0.8" },
        redirect: "follow",
      });
      if (!imgRes.ok) {
        return sealBytesResponse(publicApp);
      }
      const ct = imgRes.headers.get("content-type") || "application/octet-stream";
      if (!ct.startsWith("image/")) {
        return sealBytesResponse(publicApp);
      }
      const buf = await imgRes.arrayBuffer();
      if (buf.byteLength > 2_500_000) {
        return sealBytesResponse(publicApp);
      }
      return new Response(buf, {
        status: 200,
        headers: {
          "Content-Type": ct,
          "Cache-Control": "public, max-age=86400, s-maxage=86400",
        },
      });
    } catch {
      return sealBytesResponse(publicApp);
    }
  }

  return sealBytesResponse(publicApp);
}
