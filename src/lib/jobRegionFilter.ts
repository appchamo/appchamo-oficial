import type { SupabaseClient } from "@supabase/supabase-js";

/** UF em 2 letras (ex.: "sp" → "SP"). */
export function normalizeJobUf(uf: string | null | undefined): string {
  return (uf ?? "").trim().toUpperCase().slice(0, 2);
}

export function normalizeJobCity(city: string | null | undefined): string {
  return (city ?? "").trim();
}

function isValidBrazilUf(uf: string): boolean {
  return /^[A-Z]{2}$/.test(uf);
}

/** Evita que % e _ na cidade quebrem o ILIKE. */
function escapeIlikeExact(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Vagas ativas com filtro regional tolerante ao perfil:
 * - UF sempre normalizada; cidade com ILIKE (ignora maiúsculas).
 * - Se não houver nada na cidade com esse critério, mostra todas da mesma UF (evita lista vazia quando CEP da vaga ≠ texto do perfil).
 */
export async function fetchActiveJobPostings(
  supabase: SupabaseClient,
  opts: { select: string; profileCity: string | null | undefined; profileState: string | null | undefined },
) {
  const city = normalizeJobCity(opts.profileCity);
  const uf = normalizeJobUf(opts.profileState);
  const sel = opts.select;

  const base = () =>
    supabase.from("job_postings").select(sel).eq("active", true).order("created_at", { ascending: false });

  if (!city || !isValidBrazilUf(uf)) {
    const { data, error } = await base();
    return { data: (data ?? []) as unknown[], error };
  }

  const strict = await base().eq("state", uf).ilike("city", escapeIlikeExact(city));
  if (!strict.error && strict.data && strict.data.length > 0) {
    return { data: strict.data as unknown[], error: strict.error };
  }

  const loose = await base().eq("state", uf);
  return { data: (loose.data ?? []) as unknown[], error: loose.error };
}

export async function countActiveJobPostings(
  supabase: SupabaseClient,
  profileCity: string | null | undefined,
  profileState: string | null | undefined,
): Promise<number> {
  const city = normalizeJobCity(profileCity);
  const uf = normalizeJobUf(profileState);

  const head = () =>
    supabase.from("job_postings").select("id", { count: "exact", head: true }).eq("active", true);

  if (!city || !isValidBrazilUf(uf)) {
    const { count, error } = await head();
    if (error) return 0;
    return count ?? 0;
  }

  const strict = await head().eq("state", uf).ilike("city", escapeIlikeExact(city));
  if (!strict.error && (strict.count ?? 0) > 0) return strict.count ?? 0;

  const loose = await head().eq("state", uf);
  if (loose.error) return 0;
  return loose.count ?? 0;
}
