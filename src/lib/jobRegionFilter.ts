import type { SupabaseClient } from "@supabase/supabase-js";

/** UFs válidas (evita tratar "Minas Gerais".slice(0,2) como "MI"). */
const BRAZIL_UFS = new Set([
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
  "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
]);

/** Nome do estado (sem acento, maiúsculas) → sigla */
const STATE_NAME_TO_UF: Record<string, string> = {
  ACRE: "AC",
  ALAGOAS: "AL",
  AMAZONAS: "AM",
  AMAPA: "AP",
  BAHIA: "BA",
  CEARA: "CE",
  "DISTRITO FEDERAL": "DF",
  "ESPIRITO SANTO": "ES",
  GOIAS: "GO",
  MARANHAO: "MA",
  "MATO GROSSO": "MT",
  "MATO GROSSO DO SUL": "MS",
  "MINAS GERAIS": "MG",
  PARA: "PA",
  PARAIBA: "PB",
  PARANA: "PR",
  PERNAMBUCO: "PE",
  PIAUI: "PI",
  "RIO DE JANEIRO": "RJ",
  "RIO GRANDE DO NORTE": "RN",
  "RIO GRANDE DO SUL": "RS",
  RONDONIA: "RO",
  RORAIMA: "RR",
  "SANTA CATARINA": "SC",
  "SAO PAULO": "SP",
  SERGIPE: "SE",
  TOCANTINS: "TO",
};

function stripAccents(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase();
}

/**
 * Converte o campo de estado do perfil para sigla de 2 letras.
 * Não usa mais slice(0,2) em textos longos ("Minas Gerais" → era "MI" e zerava a lista).
 */
export function normalizeJobUf(uf: string | null | undefined): string {
  const raw = (uf ?? "").trim();
  if (!raw) return "";

  const upper = raw.toUpperCase().replace(/\s+/g, " ");
  const firstSegment = upper.split(/[-–—,/|]/)[0]?.trim() ?? upper;
  if (firstSegment.length === 2 && /^[A-Z]{2}$/.test(firstSegment) && BRAZIL_UFS.has(firstSegment)) {
    return firstSegment;
  }

  const folded = stripAccents(upper);
  if (STATE_NAME_TO_UF[folded]) return STATE_NAME_TO_UF[folded];
  if (STATE_NAME_TO_UF[upper]) return STATE_NAME_TO_UF[upper];

  const foldedSeg = stripAccents(firstSegment);
  if (STATE_NAME_TO_UF[foldedSeg]) return STATE_NAME_TO_UF[foldedSeg];

  return "";
}

export function normalizeJobCity(city: string | null | undefined): string {
  return (city ?? "").trim();
}

function isValidBrazilUf(uf: string): boolean {
  return uf.length === 2 && BRAZIL_UFS.has(uf);
}

type JobRegionRow = {
  city?: string | null;
  state?: string | null;
  location?: string | null;
};

function sameCityAccentInsensitive(a: string, b: string): boolean {
  if (!a || !b) return false;
  return stripAccents(a).toLowerCase() === stripAccents(b).toLowerCase();
}

/**
 * Quando a coluna `state` da vaga não normaliza para UF (vazia/ilegível), tenta o texto em `location`.
 */
function jobMatchesRegionByLocationOnly(row: JobRegionRow, profileCity: string, profileUf: string): boolean {
  if (normalizeJobUf(row.state)) return false;
  const raw = (row.location ?? "").trim();
  if (!raw) return false;
  const loc = stripAccents(raw).toUpperCase();
  const city = normalizeJobCity(profileCity);
  const citySt = city ? stripAccents(city).toUpperCase() : "";
  const uf = profileUf.toUpperCase();
  const hasUfToken =
    loc.includes(`/${uf}`) ||
    loc.includes(`-${uf}`) ||
    loc.includes(`, ${uf}`) ||
    new RegExp(`\\b${uf}\\b`).test(loc);
  if (citySt && loc.includes(citySt) && hasUfToken) return true;
  return hasUfToken;
}

/**
 * Mesma regra para lista e contador (Home vs /jobs):
 * - UF da vaga via normalizeJobUf(state) === UF do perfil (aceita sigla ou nome completo na coluna).
 * - Se houver vagas nesse estado, prioriza mesma cidade (coluna city); senão mostra todo o estado.
 * - Se nenhuma vaga com UF reconhecida, fallback por location (vagas antigas só com texto).
 */
export function filterJobPostingsToProfileRegion<T extends JobRegionRow>(rows: T[], profileCity: string, profileUf: string): T[] {
  const city = normalizeJobCity(profileCity);
  const uf = profileUf;

  const inState = rows.filter((r) => normalizeJobUf(r.state) === uf);
  if (inState.length > 0) {
    const strict = inState.filter((r) => {
      const rc = normalizeJobCity(r.city);
      return rc.length > 0 && sameCityAccentInsensitive(rc, city);
    });
    return strict.length > 0 ? strict : inState;
  }

  return rows.filter((r) => jobMatchesRegionByLocationOnly(r, city, uf));
}

/**
 * Vagas ativas com filtro regional tolerante ao perfil:
 * - Se UF/cidade do perfil forem inválidos, lista todas as vagas ativas.
 * - Caso contrário, busca todas as ativas e filtra no cliente (evita mismatch SQL com state="Minas Gerais" vs "MG").
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

  const { data, error } = await base();
  const filtered = filterJobPostingsToProfileRegion((data ?? []) as JobRegionRow[], city, uf);
  return { data: filtered as unknown[], error };
}

export async function countActiveJobPostings(
  supabase: SupabaseClient,
  profileCity: string | null | undefined,
  profileState: string | null | undefined,
): Promise<number> {
  const city = normalizeJobCity(profileCity);
  const uf = normalizeJobUf(profileState);

  if (!city || !isValidBrazilUf(uf)) {
    const { count, error } = await supabase.from("job_postings").select("id", { count: "exact", head: true }).eq("active", true);
    if (error) return 0;
    return count ?? 0;
  }

  const { data, error } = await supabase.from("job_postings").select("id, city, state, location").eq("active", true);
  if (error) return 0;
  return filterJobPostingsToProfileRegion(data ?? [], city, uf).length;
}
