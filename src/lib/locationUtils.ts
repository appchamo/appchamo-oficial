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

/** Nome completo do estado (normalizado) -> sigla UF. Usado para aceitar "Minas Gerais" ou "MG". */
const STATE_NAME_TO_UF: Record<string, string> = {
  acre: "ac", alagoas: "al", amapa: "ap", amazonas: "am", bahia: "ba", ceara: "ce",
  "distrito federal": "df", "espirito santo": "es", goias: "go", maranhao: "ma",
  "mato grosso": "mt", "mato grosso do sul": "ms", "minas gerais": "mg", para: "pa",
  paraiba: "pb", parana: "pr", pernambuco: "pe", piaui: "pi", "rio de janeiro": "rj",
  "rio grande do norte": "rn", "rio grande do sul": "rs", rondonia: "ro", roraima: "rr",
  "santa catarina": "sc", "sao paulo": "sp", sergipe: "se", tocantins: "to",
};

/** Normaliza estado para sigla UF (aceita "MG" ou "Minas Gerais"). Exportado para uso na Busca. */
export function normalizeStateToUF(state: string | null | undefined): string {
  const s = normalizeLocation(state);
  if (!s) return "";
  if (s.length === 2) return s;
  return STATE_NAME_TO_UF[s] ?? s;
}

/** Retorna true se o profissional está na mesma cidade/estado do usuário (ou se usuário não tem filtro). */
export function sameCityState(
  userCity: string | null | undefined,
  userState: string | null | undefined,
  proCity: string | null | undefined,
  proState: string | null | undefined
): boolean {
  const uC = normalizeLocation(userCity);
  const uS = normalizeStateToUF(userState);
  const pC = normalizeLocation(proCity);
  const pS = normalizeStateToUF(proState);
  if (!uC && !uS) return true;
  if (uS && pS !== uS) return false;
  if (uC && pC !== uC) {
    // Profissional com mesmo estado mas cidade vazia: mostrar (evita sumir quem não preencheu cidade).
    if (pS === uS && !pC) return true;
    return false;
  }
  return true;
}
