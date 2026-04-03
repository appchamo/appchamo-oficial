import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Resolve `professionals` por UUID ou slug (tentativa exata, minúsculo, ilike sem wildcards no key).
 */
export async function resolveProfessionalByPublicKey(
  supabase: SupabaseClient,
  key: string,
  selectFields: string,
): Promise<Record<string, unknown> | null> {
  const trimmed = key.trim();
  if (!trimmed) return null;

  const isUuid = UUID_RE.test(trimmed);

  if (isUuid) {
    const { data, error } = await supabase.from("professionals").select(selectFields).eq("id", trimmed).maybeSingle();
    if (error || !data) return null;
    return data as Record<string, unknown>;
  }

  const tryEq = async (slug: string) => {
    const { data, error } = await supabase.from("professionals").select(selectFields).eq("slug", slug).maybeSingle();
    if (error || !data) return null;
    return data as Record<string, unknown>;
  };

  let row = await tryEq(trimmed);
  if (row) return row;

  const lower = trimmed.toLowerCase();
  if (lower !== trimmed) {
    row = await tryEq(lower);
    if (row) return row;
  }

  if (!/[%_]/.test(trimmed)) {
    const { data, error } = await supabase.from("professionals").select(selectFields).ilike("slug", trimmed).limit(1);
    if (!error && data && data.length > 0) return data[0] as Record<string, unknown>;
  }

  return null;
}
