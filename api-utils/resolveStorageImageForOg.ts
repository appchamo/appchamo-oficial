import type { SupabaseClient } from "@supabase/supabase-js";
import { extractSupabaseStorageObjectRef } from "./extractSupabaseStorageObjectRef";

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

  const ref = extractSupabaseStorageObjectRef(raw);
  if (ref) {
    const { data, error } = await supabase.storage.from(ref.bucket).createSignedUrl(ref.objectPath, 2592000);
    if (!error && data?.signedUrl) return data.signedUrl;
    return fallbackHttpsUrl;
  }

  if (/^https?:\/\//i.test(raw) && (!host || !raw.includes(host))) {
    return raw;
  }

  return fallbackHttpsUrl;
}
