/**
 * Reverse geocode: lat/lng → endereço (Nominatim).
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
const USER_AGENT = "ChamoApp/1.0 (contato@appchamo.com)";

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

export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: "json",
  });
  const res = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: { "Accept-Language": "pt-BR", "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`Nominatim: ${res.status}`);
  }
  const data = await res.json();
  const addr = data?.address || {};
  const city =
    addr.city ||
    addr.town ||
    addr.village ||
    addr.municipality ||
    addr.county ||
    "";
  const stateRaw =
    (addr["ISO3166-2-lvl4"] && String(addr["ISO3166-2-lvl4"]).split("-")[1]) ||
    addr.state ||
    "";
  const state = stateToUF(stateRaw);
  const street = addr.road || addr.street || addr.pedestrian || "";
  const neighborhood =
    addr.suburb || addr.neighbourhood || addr.quarter || addr.district || "";
  return {
    city,
    state,
    street,
    neighborhood,
    road: addr.road,
  };
}
