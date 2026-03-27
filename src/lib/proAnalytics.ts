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

export async function fetchMyProfessionalAnalytics(): Promise<ProfessionalAnalyticsPayload | null> {
  const { data, error } = await supabase.rpc("get_my_professional_analytics");
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
