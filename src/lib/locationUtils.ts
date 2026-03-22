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
    .replace(/[\u0300-\u036f]/g, ""); // Fix: brackets required for Unicode range
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

  // Usuário sem localização: exibe todos
  if (!uC && !uS) return true;

  // Profissional sem nenhuma localização cadastrada: exibe (não penalizar quem não preencheu)
  if (!pC && !pS) return true;

  // Estado diferente: filtra fora
  if (uS && pS && pS !== uS) return false;

  // Profissional sem cidade mas mesmo estado: exibe
  if (!pC && pS === uS) return true;

  // Profissional sem estado mas mesma cidade: exibe
  if (!pS && pC === uC) return true;

  // Cidade diferente: filtra fora
  if (uC && pC && pC !== uC) return false;

  return true;
}
