import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingSponsorIdColumnError, jobPostingsSelectLegacyCompatible } from "./jobPostingsSelectCompat";

/**
 * Todas as vagas com active=true, para qualquer utilizador (cliente, profissional, qualquer UF).
 * Os campos de perfil são ignorados — mantidos na assinatura só para não quebrar chamadas existentes.
 */
export async function fetchActiveJobPostings(
  supabase: SupabaseClient,
  opts: {
    select: string;
    profileCity?: string | null | undefined;
    profileState?: string | null | undefined;
  },
) {
  let sel = opts.select;
  let { data, error } = await supabase
    .from("job_postings")
    .select(sel)
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (error && isMissingSponsorIdColumnError(error)) {
    sel = jobPostingsSelectLegacyCompatible(sel);
    const second = await supabase
      .from("job_postings")
      .select(sel)
      .eq("active", true)
      .order("created_at", { ascending: false });
    data = second.data;
    error = second.error;
  }

  return { data: (data ?? []) as unknown[], error };
}

/** Conta vagas ativas no projeto inteiro (sem filtro regional). */
export async function countActiveJobPostings(
  supabase: SupabaseClient,
  _profileCity?: string | null | undefined,
  _profileState?: string | null | undefined,
): Promise<number> {
  const { count, error } = await supabase
    .from("job_postings")
    .select("id", { count: "exact", head: true })
    .eq("active", true);
  if (error) return 0;
  return count ?? 0;
}
