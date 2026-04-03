/**
 * Busca imagem por HTTPS com UA compatível com Meta/WhatsApp e tentativa de URL render do Supabase.
 */

export function mimeFromPathForOg(pathOrUrl: string): string {
  let path = pathOrUrl;
  try {
    if (/^https?:\/\//i.test(pathOrUrl)) path = new URL(pathOrUrl).pathname;
  } catch {
    /* manter */
  }
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

const OG_IMAGE_FETCH_UA =
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

function normalizeImageContentType(urlOrPath: string, headerCt: string | null): string {
  const inferred = mimeFromPathForOg(urlOrPath);
  const h = (headerCt || "").split(";")[0].trim().toLowerCase();
  if (h.startsWith("image/") && h !== "image/octet-stream") return h;
  if (inferred.startsWith("image/") && inferred !== "application/octet-stream") return inferred;
  return "image/jpeg";
}

/** URL de transformação Supabase (menor, mais fiável para crawlers). */
export function supabaseRenderImageUrl(publicObjectUrl: string): string | null {
  try {
    const u = new URL(publicObjectUrl);
    if (!/\.supabase\.co$/i.test(u.hostname)) return null;
    const marker = "/storage/v1/object/public/";
    const i = u.pathname.indexOf(marker);
    if (i === -1) return null;
    const rest = u.pathname.slice(i + marker.length);
    if (!rest) return null;
    return `${u.origin}/storage/v1/render/image/public/${rest}?width=1200&height=1200&resize=contain&quality=86`;
  } catch {
    return null;
  }
}

/**
 * Monta URL pública do Storage a partir da base do projeto (para crawlers).
 */
export function supabasePublicObjectHttpUrl(
  supabaseUrl: string,
  bucket: string,
  objectPath: string,
): string {
  const base = supabaseUrl.replace(/\/$/, "");
  const enc = objectPath
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${base}/storage/v1/object/public/${encodeURIComponent(bucket)}/${enc}`;
}

export async function fetchImageOverHttp(
  imageUrl: string,
  maxBytes: number,
): Promise<{ buf: ArrayBuffer; ct: string } | null> {
  const trimmed = imageUrl.trim();
  if (!/^https:\/\//i.test(trimmed)) return null;

  const tryUrls = [trimmed];
  const render = supabaseRenderImageUrl(trimmed);
  if (render && render !== trimmed) tryUrls.push(render);

  for (const u of tryUrls) {
    try {
      const imgRes = await fetch(u, {
        method: "GET",
        headers: {
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "User-Agent": OG_IMAGE_FETCH_UA,
        },
        redirect: "follow",
      });
      if (!imgRes.ok) continue;
      const buf = await imgRes.arrayBuffer();
      if (buf.byteLength === 0 || buf.byteLength > maxBytes) continue;
      const ct = normalizeImageContentType(u, imgRes.headers.get("content-type"));
      if (!ct.startsWith("image/")) continue;
      return { buf, ct };
    } catch {
      /* próximo URL */
    }
  }
  return null;
}
