/**
 * Devolve os bytes da foto de perfil para og:image (WhatsApp / Facebook).
 * Suporta GET e HEAD — crawlers da Meta usam HEAD primeiro; 405 quebrava o depurador.
 * Ordem: HTTPS (UA Meta + URL render) → URL pública do bucket → download SDK.
 */
import { createClient } from "@supabase/supabase-js";
import { extractSupabaseStorageObjectRef } from "../api-utils/extractSupabaseStorageObjectRef";
import { resolveSealFetchOrigins } from "../api-utils/resolveSealAssetOrigin";
import {
  fetchImageOverHttp,
  mimeFromPathForOg,
  supabasePublicObjectHttpUrl,
} from "../api-utils/ogImageHttpFetch";
import { resolveProfessionalByPublicKey } from "../api-utils/resolveProfessionalByPublicKey";

export const config = { runtime: "edge" };

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

const FALLBACK_SEAL_PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAHgAAAB4CAYAAAA5ZDbSAAAAs0lEQVR42u3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOA8WLAAAdk5JckAAAAASUVORK5CYII=",
  ),
  (c) => c.charCodeAt(0),
);

async function sealBytesResponse(req: Request): Promise<Response> {
  const tryPaths = ["/icon-512.png", "/seals/push/seal_chamo.png", "/seals/push/seal_chamo.svg"];
  for (const path of tryPaths) {
    for (const origin of resolveSealFetchOrigins(req)) {
      try {
        const url = `${origin.replace(/\/$/, "")}${path}`;
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
  }
  return imageResponse(req, FALLBACK_SEAL_PNG, "image/png", "public, max-age=300, s-maxage=300");
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key")?.trim() || "";
    if (!key || key.length > 200) {
      return new Response("Not found", { status: 404 });
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const maxOgImageBytes = 2_800_000;

    if (!supabaseUrl || !serviceKey) {
      return sealBytesResponse(req);
    }

    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const proRowRaw = await resolveProfessionalByPublicKey(
      supabase,
      key,
      "id, user_id, slug, cover_image_url",
    );
    if (!proRowRaw) {
      return sealBytesResponse(req);
    }
    const proRow = proRowRaw as { user_id: string; cover_image_url?: string | null };

    const { data: prof } = await supabase
      .from("profiles")
      .select("avatar_url")
      .eq("user_id", proRow.user_id)
      .maybeSingle();

    const avatarRef = ((prof as { avatar_url?: string | null } | null)?.avatar_url || "").trim();
    const coverRef = (proRow.cover_image_url || "").trim();
    const raw = avatarRef || coverRef;

    if (!raw) {
      return sealBytesResponse(req);
    }

    if (/^https:\/\//i.test(raw)) {
      const viaHttp = await fetchImageOverHttp(raw, maxOgImageBytes);
      if (viaHttp) {
        return imageResponse(req, viaHttp.buf, viaHttp.ct, "public, max-age=86400, s-maxage=86400");
      }
    }

    const storageRef = extractSupabaseStorageObjectRef(raw);
    if (storageRef) {
      const publicUrl = supabasePublicObjectHttpUrl(supabaseUrl, storageRef.bucket, storageRef.objectPath);
      const viaPublic = await fetchImageOverHttp(publicUrl, maxOgImageBytes);
      if (viaPublic) {
        return imageResponse(req, viaPublic.buf, viaPublic.ct, "public, max-age=86400, s-maxage=86400");
      }

      const { data: blob, error: dlErr } = await supabase.storage
        .from(storageRef.bucket)
        .download(storageRef.objectPath);
      if (!dlErr && blob) {
        const buf = await blob.arrayBuffer();
        const ct =
          blob.type && blob.type !== "application/octet-stream"
            ? blob.type
            : mimeFromPathForOg(storageRef.objectPath);
        if (ct.startsWith("image/") && buf.byteLength > 0 && buf.byteLength <= maxOgImageBytes) {
          return imageResponse(req, buf, ct, "public, max-age=86400, s-maxage=86400");
        }
      }
    }

    if (/^https?:\/\//i.test(raw)) {
      const viaHttp = await fetchImageOverHttp(
        raw.startsWith("http://") ? raw.replace(/^http:/i, "https:") : raw,
        maxOgImageBytes,
      );
      if (viaHttp) {
        return imageResponse(req, viaHttp.buf, viaHttp.ct, "public, max-age=86400, s-maxage=86400");
      }
    }

    return sealBytesResponse(req);
  } catch {
    return sealBytesResponse(req);
  }
}
