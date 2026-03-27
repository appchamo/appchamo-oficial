/**
 * Reverse geocode: lat/lng → endereço.
 * Usa Nominatim (OpenStreetMap); se falhar, tenta BigDataCloud (fallback, sem chave).
 * Usado na Home (localização) e no cadastro (Obter localização).
 */
export interface ReverseGeocodeResult {
  city: string;
  state: string;
  street: string;
  neighborhood: string;
  road?: string;
}

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";
const NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "ChamoApp/1.0 (contato@appchamo.com)";
const BIGDATACLOUD_URL = "https://api.bigdatacloud.net/data/reverse-geocode-client";

/** Converte nome completo do estado para UF (2 letras) quando possível. */
function stateToUF(raw: string): string {
  const s = (raw || "").trim();
  if (s.length === 2) return s.toUpperCase();
  const map: Record<string, string> = {
    "minas gerais": "MG", "são paulo": "SP", "rio de janeiro": "RJ",
    "bahia": "BA", "paraná": "PR", "parana": "PR", "rio grande do sul": "RS",
    "pernambuco": "PE", "ceará": "CE", "ceara": "CE", "santa catarina": "SC",
    "goiás": "GO", "goias": "GO", "maranhão": "MA", "maranhao": "MA",
    "paraíba": "PB", "paraiba": "PB", "amazonas": "AM", "espírito santo": "ES",
    "espirito santo": "ES", "rio grande do norte": "RN", "alagoas": "AL",
    "piauí": "PI", "piaui": "PI", "distrito federal": "DF", "mato grosso": "MT",
    "mato grosso do sul": "MS", "sergipe": "SE", "tocantins": "TO",
    "rondônia": "RO", "rondonia": "RO", "acre": "AC", "amapá": "AP",
    "amapa": "AP", "roraima": "RR",
  };
  const key = s.toLowerCase().normalize("NFD").replace(/\u0300-\u036f/g, "");
  return map[key] || s.slice(0, 2).toUpperCase();
}

/** Nominatim (OpenStreetMap). */
async function reverseGeocodeNominatim(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: "json",
  });
  const res = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: { "Accept-Language": "pt-BR", "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`Nominatim: ${res.status}`);
  const data = await res.json();
  const addr = data?.address || {};
  const city =
    addr.city || addr.town || addr.village || addr.municipality || addr.county || "";
  const stateRaw =
    (addr["ISO3166-2-lvl4"] && String(addr["ISO3166-2-lvl4"]).split("-")[1]) ||
    addr.state || "";
  const state = stateToUF(stateRaw);
  const street = addr.road || addr.street || addr.pedestrian || "";
  const neighborhood =
    addr.suburb || addr.neighbourhood || addr.quarter || addr.district || "";
  return { city, state, street, neighborhood, road: addr.road };
}

/** Fallback: BigDataCloud (sem API key, uso cliente). */
async function reverseGeocodeBigDataCloud(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  const res = await fetch(
    `${BIGDATACLOUD_URL}?latitude=${lat}&longitude=${lng}&localityLanguage=pt`
  );
  if (!res.ok) throw new Error(`BigDataCloud: ${res.status}`);
  const data = await res.json();
  const city = data?.city || data?.locality || "";
  const subdivCode = data?.principalSubdivisionCode || "";
  const state = subdivCode.includes("-") ? subdivCode.split("-")[1].toUpperCase() : stateToUF(data?.principalSubdivision || "");
  return {
    city,
    state,
    street: "",
    neighborhood: "",
  };
}

export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  try {
    return await reverseGeocodeNominatim(lat, lng);
  } catch {
    return await reverseGeocodeBigDataCloud(lat, lng);
  }
}

export type ForwardGeocodeBrazilInput = {
  cep?: string | null;
  city: string;
  state: string;
  street?: string | null;
  neighborhood?: string | null;
};

/**
 * CEP/endereço (Brasil) → coordenadas aproximadas (Nominatim).
 * Usado ao salvar perfil após ViaCEP para distância na busca e no perfil.
 */
export async function forwardGeocodeBrazil(parts: ForwardGeocodeBrazilInput): Promise<{ lat: number; lng: number } | null> {
  const city = (parts.city || "").trim();
  const state = (parts.state || "").trim().toUpperCase();
  if (!city || state.length !== 2) return null;
  const cepDigits = (parts.cep || "").replace(/\D/g, "");
  const street = (parts.street || "").trim();
  const neighborhood = (parts.neighborhood || "").trim();

  const headers = { Accept: "application/json", "User-Agent": USER_AGENT } as const;

  const parseFirst = (raw: unknown): { lat: number; lng: number } | null => {
    const arr = raw as { lat?: string; lon?: string }[] | null;
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const lat = parseFloat(String(arr[0].lat));
    const lng = parseFloat(String(arr[0].lon));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  };

  try {
    const structured = new URLSearchParams({
      format: "json",
      limit: "1",
      country: "Brasil",
      city,
      state,
    });
    if (cepDigits.length === 8) structured.set("postalcode", cepDigits);
    const streetLine = [street, neighborhood].filter(Boolean).join(", ");
    if (streetLine) structured.set("street", streetLine);

    const res1 = await fetch(`${NOMINATIM_SEARCH}?${structured}`, { headers });
    if (res1.ok) {
      const parsed = parseFirst(await res1.json());
      if (parsed) return parsed;
    }
  } catch {
    /* tenta busca livre */
  }

  try {
    const chunks = [street, neighborhood, city, state];
    if (cepDigits.length === 8) {
      chunks.push(cepDigits.replace(/^(\d{5})(\d{3})$/, "$1-$2"));
    }
    chunks.push("Brasil");
    const q = chunks.filter(Boolean).join(", ");
    const params = new URLSearchParams({
      q,
      format: "json",
      limit: "1",
      countrycodes: "br",
    });
    const res2 = await fetch(`${NOMINATIM_SEARCH}?${params}`, { headers });
    if (!res2.ok) return null;
    return parseFirst(await res2.json());
  } catch {
    return null;
  }
}
