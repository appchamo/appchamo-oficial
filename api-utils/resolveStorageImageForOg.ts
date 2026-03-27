import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Imagem pública para og:image / crawlers (WhatsApp, Facebook).
 * O bucket `uploads` é privado — URLs "public" devolvem 403 para anónimos; usamos signed URL.
 */
export async function resolveStorageImageForOg(
  supabase: SupabaseClient,
  imageRef: string | null | undefined,
  supabaseBase: string,
  fallbackHttpsUrl: string,
): Promise<string> {
  const raw = (imageRef || "").trim();
  if (!raw) return fallbackHttpsUrl;

  let host: string;
  try {
    host = new URL(supabaseBase).hostname;
  } catch {
    host = "";
  }

  let objectPath: string | null = null;
  if (!/^https?:\/\//i.test(raw)) {
    objectPath = raw.replace(/^\/+/, "");
  } else if (host && raw.includes(host)) {
    const m = raw.match(/\/object\/(?:public|sign)\/uploads\/([^?]+)/);
    if (m) {
      try {
        objectPath = decodeURIComponent(m[1]);
      } catch {
        objectPath = m[1];
      }
    }
  } else {
    return raw;
  }

  if (!objectPath) return fallbackHttpsUrl;

  const { data, error } = await supabase.storage.from("uploads").createSignedUrl(objectPath, 2592000);
  if (error || !data?.signedUrl) return fallbackHttpsUrl;
  return data.signedUrl;
}
