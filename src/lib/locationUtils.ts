/** Cache partilhado (Home, destaques, patrocinadores) — evita leituras duplicadas e mantém filtros alinhados em todos os dispositivos. */
export const HOME_LOCATION_CACHE_KEY = "chamo_user_location_v1";
export const HOME_LOCATION_CACHE_TTL_MS = 5 * 60 * 1000;

export function getHomeLocationCache(): { city: string | null; state: string | null } | null {
  try {
    const raw = localStorage.getItem(HOME_LOCATION_CACHE_KEY);
    if (!raw) return null;
    const { city, state, ts } = JSON.parse(raw);
    if (Date.now() - ts > HOME_LOCATION_CACHE_TTL_MS) return null;
    return { city: city ?? null, state: state ?? null };
  } catch {
    return null;
  }
}

/** Sincroniza cache com o que veio do servidor, sem disparar evento (evita duplo fetch no mesmo mount). */
export function writeHomeLocationCacheOnly(city: string | null, state: string | null): void {
  try {
    localStorage.setItem(
      HOME_LOCATION_CACHE_KEY,
      JSON.stringify({ city, state, ts: Date.now() }),
    );
  } catch {
    /* ignore */
  }
}

/** Atualiza cache e notifica listas (destaques / patrocinadores) para recarregarem sem esperar TTL. */
export function setHomeLocationCache(city: string | null, state: string | null): void {
  writeHomeLocationCacheOnly(city, state);
  try {
    window.dispatchEvent(
      new CustomEvent("chamo_home_location_updated", { detail: { city, state } }),
    );
  } catch {
    /* ignore */
  }
}

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

/** Cidade do perfil pode vir como "Patrocínio", "Patrocínio - MG" etc. — compara pelo núcleo normalizado. */
function normalizedCityMatches(userCityNorm: string, proCityNorm: string): boolean {
  if (!userCityNorm || !proCityNorm) return false;
  if (proCityNorm === userCityNorm) return true;
  const after = proCityNorm.startsWith(userCityNorm) ? proCityNorm.slice(userCityNorm.length) : "";
  if (after && /^[\s\-\/,—]/.test(after)) return true;
  return false;
}

/**
 * Filtro dos destaques na Home: com cidade definida, só profissionais dessa cidade
 * (e mesma UF quando ambos têm estado). Sem cidade no utilizador: só UF; sem nenhum: sem filtro.
 */
export function matchesFeaturedRegion(
  userCity: string | null | undefined,
  userState: string | null | undefined,
  proCity: string | null | undefined,
  proState: string | null | undefined,
): boolean {
  const uC = normalizeLocation(userCity);
  const uS = normalizeStateToUF(userState);
  const pC = normalizeLocation(proCity);
  const pS = normalizeStateToUF(proState);

  if (!uC && !uS) return true;

  if (uC) {
    if (!pC || !normalizedCityMatches(uC, pC)) return false;
    if (uS && pS && pS !== uS) return false;
    return true;
  }

  if (uS) return !!pS && pS === uS;
  return true;
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
