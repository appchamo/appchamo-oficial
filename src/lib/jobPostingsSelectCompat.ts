import type { PostgrestError } from "@supabase/supabase-js";

/**
 * BD antiga sem migração `job_postings_sponsor_id`: remover `sponsor_id` e embeds `sponsors(...)`
 * do select para não receber 400 "column ... sponsor_id does not exist".
 */
export function jobPostingsSelectLegacyCompatible(select: string): string {
  return select
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((col) => col !== "sponsor_id" && !/^sponsors\s*\(/i.test(col))
    .join(", ");
}

export function isMissingSponsorIdColumnError(err: PostgrestError | null): boolean {
  if (!err) return false;
  const m = (err.message || "").toLowerCase();
  if (!m.includes("sponsor_id")) return false;
  return err.code === "42703" || m.includes("does not exist");
}
