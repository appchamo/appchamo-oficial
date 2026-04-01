/**
 * Devolve os bytes da foto de perfil do autor (ou imagem do post) para og:image — WhatsApp/Meta.
 * Igual ao fluxo de /api/professional-og-image: crawlers não dependem de signed URL efémera.
 */
import { createClient } from "@supabase/supabase-js";
import { extractSupabaseStorageObjectRef } from "../api-utils/extractSupabaseStorageObjectRef";
import { resolveSealFetchOrigins } from "../api-utils/resolveSealAssetOrigin";

export const config = { runtime: "edge" };

function mimeFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

const FALLBACK_SEAL_PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAHgAAAB4CAYAAAA5ZDbSAAAAs0lEQVR42u3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOA8WLAAAdk5JckAAAAASUVORK5CYII=",
  ),
  (c) => c.charCodeAt(0),
);

function imageResponse(req: Request, body: ArrayBuffer | Uint8Array, contentType: string, cache: string): Response {
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Cache-Control": cache,
    "Access-Control-Allow-Origin": "*",
  };
  const len = body.byteLength;
  headers["Content-Length"] = String(len);
  if (req.method === "HEAD") {
    return new Response(null, { status: 200, headers });
  }
  return new Response(body, { status: 200, headers });
}

async function sealBytesResponse(req: Request): Promise<Response> {
  for (const origin of resolveSealFetchOrigins(req)) {
    try {
      const url = `${origin.replace(/\/$/, "")}/seals/push/seal_chamo.png`;
      const r = await fetch(url, {
        method: req.method === "HEAD" ? "HEAD" : "GET",
        redirect: "follow",
      });
      if (!r.ok) continue;
      const ct = r.headers.get("content-type") || "image/png";
      if (req.method === "HEAD") {
        const len = r.headers.get("content-length");
        return new Response(null, {
          status: 200,
          headers: {
            "Content-Type": ct,
            ...(len ? { "Content-Length": len } : {}),
            "Cache-Control": "public, max-age=300, s-maxage=300",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
      const buf = await r.arrayBuffer();
      return imageResponse(req, buf, ct, "public, max-age=300, s-maxage=300");
    } catch {
      /* próxima origem */
    }
  }
  return imageResponse(req, FALLBACK_SEAL_PNG, "image/png", "public, max-age=300, s-maxage=300");
}

async function downloadStorageImage(
  supabase: ReturnType<typeof createClient>,
  raw: string,
  maxBytes: number,
): Promise<{ buf: ArrayBuffer; ct: string } | null> {
  const trimmed = (raw || "").trim();
  if (!trimmed) return null;

  const storageRef = extractSupabaseStorageObjectRef(trimmed);
  if (storageRef) {
    const { data: blob, error: dlErr } = await supabase.storage
      .from(storageRef.bucket)
      .download(storageRef.objectPath);
    if (!dlErr && blob) {
      const buf = await blob.arrayBuffer();
      const ct =
        blob.type && blob.type !== "application/octet-stream"
          ? blob.type
          : mimeFromPath(storageRef.objectPath);
      if (ct.startsWith("image/") && buf.byteLength > 0 && buf.byteLength <= maxBytes) {
        return { buf, ct };
      }
    }
    return null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const imgRes = await fetch(trimmed, {
        method: "GET",
        headers: {
          Accept: "image/*,*/*;q=0.8",
          "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        },
        redirect: "follow",
      });
      if (!imgRes.ok) return null;
      const ct = imgRes.headers.get("content-type") || "application/octet-stream";
      if (!ct.startsWith("image/")) return null;
      const buf = await imgRes.arrayBuffer();
      if (buf.byteLength > maxBytes) return null;
      return { buf, ct };
    } catch {
      return null;
    }
  }

  return null;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(req.url);
  const postId = url.searchParams.get("id")?.trim() || "";
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!postId || !uuidRe.test(postId)) {
    return new Response("Not found", { status: 404 });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const maxOgImageBytes = 1_800_000;

  if (!supabaseUrl || !serviceKey) {
    return sealBytesResponse(req);
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: post, error: postErr } = await supabase
    .from("community_posts")
    .select("id, image_url, author_id")
    .eq("id", postId)
    .maybeSingle();

  if (postErr || !post) {
    return sealBytesResponse(req);
  }

  const row = post as { image_url?: string | null; author_id?: string };
  const { data: prof } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("user_id", row.author_id)
    .maybeSingle();

  const avatarRef = ((prof as { avatar_url?: string | null } | null)?.avatar_url || "").trim();
  const postImageRef = (row.image_url || "").trim();

  /** Prioridade: avatar do autor (pedido do produto); depois mídia do post. */
  for (const ref of [avatarRef, postImageRef]) {
    const got = await downloadStorageImage(supabase, ref, maxOgImageBytes);
    if (got) {
      return imageResponse(req, got.buf, got.ct, "public, max-age=86400, s-maxage=86400");
    }
  }

  return sealBytesResponse(req);
}
