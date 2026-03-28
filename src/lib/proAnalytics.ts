import { supabase } from "@/integrations/supabase/client";

export type ProfessionalAnalyticsEvent =
  | "profile_view"
  | "profile_click"
  | "call_click"
  | "appointment_booking"
  | "name_search";

/** Normaliza nome para comparação (minúsculas, sem acentos, espaços colapsados). */
export function normalizeNameForSearchMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Verifica se a busca corresponde ao nome exibido no perfil (ignora maiúsculas e acentos). */
export function searchQueryMatchesDisplayName(queryRaw: string, displayName: string): boolean {
  const q = normalizeNameForSearchMatch(queryRaw);
  if (!q) return false;
  return normalizeNameForSearchMatch(displayName) === q;
}

/**
 * Incrementa contador de métrica para o user_id do profissional.
 * Falhas são ignoradas (não bloqueia UI).
 */
export function incrementProfessionalAnalytics(
  targetUserId: string | undefined | null,
  event: ProfessionalAnalyticsEvent,
): void {
  if (!targetUserId) return;
  void supabase.rpc("increment_professional_analytics", {
    p_target_user_id: targetUserId,
    p_event: event,
  });
}

export interface ProfessionalAnalyticsPayload {
  profile_views: number;
  profile_clicks: number;
  call_clicks: number;
  appointment_bookings: number;
  name_searches: number;
}

/** Intervalo half-open: [from, to) em UTC (envie datas já no fuso desejado via ISO). */
export type ProfessionalAnalyticsRange = { from: Date; to: Date };

/**
 * Sem intervalo: totais acumulados (tabela de contadores).
 * Com intervalo: contagens só dentro do período (tabela de eventos; exige migração aplicada).
 */
export async function fetchMyProfessionalAnalytics(
  range?: ProfessionalAnalyticsRange | null,
): Promise<ProfessionalAnalyticsPayload | null> {
  const useLifetime = range == null;
  const { data, error } = await supabase.rpc(
    "get_my_professional_analytics",
    useLifetime
      ? { p_from: null, p_to: null }
      : { p_from: range.from.toISOString(), p_to: range.to.toISOString() },
  );
  if (error || data == null || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  return {
    profile_views: Number(o.profile_views) || 0,
    profile_clicks: Number(o.profile_clicks) || 0,
    call_clicks: Number(o.call_clicks) || 0,
    appointment_bookings: Number(o.appointment_bookings) || 0,
    name_searches: Number(o.name_searches) || 0,
  };
}
