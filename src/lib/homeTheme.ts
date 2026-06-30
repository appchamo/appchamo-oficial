// Tema configurável da Home (cores). Guardado em platform_settings.home_theme.
import { supabase } from "@/integrations/supabase/client";

export interface HomeTheme {
  accent?: string | null;   // cor de destaque (hex) -> aplica em --primary globalmente
  homeBg?: string | null;   // cor de fundo da home (hex)
}

/** Converte #RRGGBB para "H S% L%" (formato do CSS var --primary do app). */
export function hexToHslParts(hex?: string | null): string | null {
  if (!hex) return null;
  const m = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** Aplica a cor de destaque globalmente (CSS var --primary). */
export function applyAccent(hex?: string | null) {
  const root = document.documentElement;
  const hsl = hexToHslParts(hex);
  if (hsl) root.style.setProperty("--primary", hsl);
  else root.style.removeProperty("--primary");
}

export async function fetchHomeTheme(): Promise<HomeTheme> {
  try {
    const { data } = await supabase.from("platform_settings").select("value").eq("key", "home_theme").single();
    const t = data?.value as HomeTheme | null;
    return t && typeof t === "object" ? t : {};
  } catch {
    return {};
  }
}
