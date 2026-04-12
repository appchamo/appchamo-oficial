/** Cadastro considerado concluído: coluna nova ou legado (termos aceites antes de signup_completed_at). */
export function isProfileSignupComplete(p: {
  user_type?: string | null;
  signup_completed_at?: string | null;
  accepted_terms_version?: string | null;
}): boolean {
  if (p.user_type === "sponsor") return true;
  if (p.signup_completed_at) return true;
  const v = p.accepted_terms_version?.trim();
  return Boolean(v);
}
