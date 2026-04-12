/**
 * IBGE: lista de municípios por UF é grande (~5k no RJ). Sem cache, cada debounce
 * refaz fetch + parse e trava a UI (especialmente no WebView).
 */

const inflight = new Map<string, Promise<string[]>>();
const resolved = new Map<string, string[]>();

export async function fetchMunicipioLabelsForUf(uf: string): Promise<string[]> {
  const u = uf.trim().toUpperCase();
  if (u.length !== 2) return [];
  const cached = resolved.get(u);
  if (cached) return cached;
  let p = inflight.get(u);
  if (!p) {
    p = (async () => {
      const res = await fetch(
        `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${encodeURIComponent(u)}/municipios?orderBy=nome`,
      );
      const data = await res.json();
      if (!Array.isArray(data)) return [];
      return data.map((c: { nome?: string }) => `${String(c.nome ?? "").trim()} - ${u}`);
    })();
    inflight.set(u, p);
  }
  try {
    const labels = await p;
    resolved.set(u, labels);
    inflight.delete(u);
    return labels;
  } catch {
    inflight.delete(u);
    return [];
  }
}

export function filterMunicipioLabels(labels: string[], query: string, limit: number): string[] {
  const q = query.toLowerCase().trim();
  if (q.length < 2) return [];
  return labels.filter((name) => name.toLowerCase().includes(q)).slice(0, limit);
}
