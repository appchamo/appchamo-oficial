// Trava de região: limita cadastro/uso do Chamô a cidades/raio definidos no admin.
// Config em public.platform_settings (chaves region_*). Desligado por padrão.
import { supabase } from "@/integrations/supabase/client";

export interface RegionGateConfig {
  enabled: boolean;
  blockSignup: boolean;
  blockApp: boolean;
  allowedCities: string[];
  centerLat: number;
  centerLng: number;
  radiusKm: number;
}

const DEFAULTS: RegionGateConfig = {
  enabled: false,
  blockSignup: true,
  blockApp: true,
  allowedCities: ["Patrocínio"],
  centerLat: -18.9441,
  centerLng: -46.9925,
  radiusKm: 15,
};

let cache: RegionGateConfig | null = null;
let cacheAt = 0;

export function normalizeCity(s: string | null | undefined): string {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

function asBool(v: unknown, fallback: boolean): boolean {
  if (v === true || v === "true") return true;
  if (v === false || v === "false") return false;
  return fallback;
}

export async function fetchRegionGate(force = false): Promise<RegionGateConfig> {
  if (!force && cache && Date.now() - cacheAt < 5 * 60 * 1000) return cache;
  try {
    const { data } = await supabase.from("platform_settings").select("key, value").like("key", "region_%");
    const m: Record<string, unknown> = {};
    (data || []).forEach((r: { key: string; value: unknown }) => { m[r.key] = r.value; });
    const citiesRaw = m["region_allowed_cities"];
    const cities = Array.isArray(citiesRaw)
      ? citiesRaw.map(String)
      : String(citiesRaw ?? "Patrocínio").split(",").map((c) => c.trim()).filter(Boolean);
    cache = {
      enabled: asBool(m["region_gate_enabled"], DEFAULTS.enabled),
      blockSignup: asBool(m["region_block_signup"], DEFAULTS.blockSignup),
      blockApp: asBool(m["region_block_app"], DEFAULTS.blockApp),
      allowedCities: cities.length ? cities : DEFAULTS.allowedCities,
      centerLat: Number(m["region_center_lat"] ?? DEFAULTS.centerLat),
      centerLng: Number(m["region_center_lng"] ?? DEFAULTS.centerLng),
      radiusKm: Number(m["region_radius_km"] ?? DEFAULTS.radiusKm),
    };
    cacheAt = Date.now();
    return cache;
  } catch {
    return cache ?? DEFAULTS;
  }
}

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export interface RegionCheckInput { city?: string | null; lat?: number | null; lng?: number | null; }

/**
 * Modo estrito: só libera quando há PROVA de estar na região permitida
 * (cidade na lista OU ponto dentro do raio). Sem nenhum dado de localização
 * -> bloqueia e pede para ativar a localização / informar a cidade.
 */
export function checkRegion(cfg: RegionGateConfig, input: RegionCheckInput): { allowed: boolean; reason: string } {
  if (!cfg.enabled) return { allowed: true, reason: "" };
  const cityOk = input.city
    ? cfg.allowedCities.some((c) => normalizeCity(c) === normalizeCity(input.city))
    : null;
  const hasCoords = typeof input.lat === "number" && typeof input.lng === "number";
  const radiusOk = hasCoords
    ? distanceKm(input.lat as number, input.lng as number, cfg.centerLat, cfg.centerLng) <= cfg.radiusKm
    : null;

  // Qualquer prova positiva libera.
  if (cityOk === true || radiusOk === true) return { allowed: true, reason: "" };
  // Reprovou por cidade ou raio -> está fora da área.
  if (cityOk === false || radiusOk === false) {
    return {
      allowed: false,
      reason: `O Chamô está disponível apenas em ${cfg.allowedCities.join(", ")}.`,
    };
  }
  // Sem nenhuma informação de localização -> bloqueia (modo estrito).
  return {
    allowed: false,
    reason: `Ative a localização ou informe sua cidade para usar o Chamô. Ele está disponível apenas em ${cfg.allowedCities.join(", ")}.`,
  };
}
