/**
 * Normaliza cidade ou estado para comparação (remove acentos, trim, lowercase).
 * Usado para filtrar profissionais pela mesma cidade/estado do cliente.
 */
export function normalizeLocation(value: string | null | undefined): string {
  if (value == null || typeof value !== "string") return "";
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\u0300-\u036f/g, "");
}

/** Retorna true se o profissional está na mesma cidade/estado do usuário (ou se usuário não tem filtro). */
export function sameCityState(
  userCity: string | null | undefined,
  userState: string | null | undefined,
  proCity: string | null | undefined,
  proState: string | null | undefined
): boolean {
  const uC = normalizeLocation(userCity);
  const uS = normalizeLocation(userState);
  const pC = normalizeLocation(proCity);
  const pS = normalizeLocation(proState);
  if (!uC && !uS) return true;
  if (uS && pS !== uS) return false;
  if (uC && pC !== uC) return false;
  return true;
}
