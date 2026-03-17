/** Lista de estados do Brasil (sigla + nome) para selects */
export const ESTADOS_BR: { sigla: string; nome: string }[] = [
  { sigla: "AC", nome: "Acre" }, { sigla: "AL", nome: "Alagoas" }, { sigla: "AP", nome: "Amapá" },
  { sigla: "AM", nome: "Amazonas" }, { sigla: "BA", nome: "Bahia" }, { sigla: "CE", nome: "Ceará" },
  { sigla: "DF", nome: "Distrito Federal" }, { sigla: "ES", nome: "Espírito Santo" }, { sigla: "GO", nome: "Goiás" },
  { sigla: "MA", nome: "Maranhão" }, { sigla: "MT", nome: "Mato Grosso" }, { sigla: "MS", nome: "Mato Grosso do Sul" },
  { sigla: "MG", nome: "Minas Gerais" }, { sigla: "PA", nome: "Pará" }, { sigla: "PB", nome: "Paraíba" },
  { sigla: "PR", nome: "Paraná" }, { sigla: "PE", nome: "Pernambuco" }, { sigla: "PI", nome: "Piauí" },
  { sigla: "RJ", nome: "Rio de Janeiro" }, { sigla: "RN", nome: "Rio Grande do Norte" }, { sigla: "RS", nome: "Rio Grande do Sul" },
  { sigla: "RO", nome: "Rondônia" }, { sigla: "RR", nome: "Roraima" }, { sigla: "SC", nome: "Santa Catarina" },
  { sigla: "SP", nome: "São Paulo" }, { sigla: "SE", nome: "Sergipe" }, { sigla: "TO", nome: "Tocantins" },
].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

/** Busca todas as cidades de um estado (UF). Usa Edge Function (proxy IBGE) para evitar CORS no app. */
export async function fetchCitiesByState(uf: string): Promise<string[]> {
  if (!uf || uf.length !== 2) return [];
  const normalizedUf = uf.trim().toUpperCase();
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await supabase.functions.invoke<{ cities?: string[] }>("cities-by-state", {
      body: { uf: normalizedUf },
    });
    if (!error && Array.isArray(data?.cities)) return data.cities;
  } catch {
    // Fallback: chamada direta ao IBGE (pode falhar por CORS no app nativo)
  }
  try {
    const url = `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${encodeURIComponent(normalizedUf)}/municipios`;
    const res = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    const names = (data as { nome?: string }[]).map((c) => c.nome ?? "").filter(Boolean);
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, "pt-BR"));
  } catch {
    return [];
  }
}
