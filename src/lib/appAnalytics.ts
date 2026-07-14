// Rastreamento leve de uso por usuário (alimenta o Analytics do admin).
// Registra: page_view, heartbeat (minutos), error (bugs), milestones (reached_home, etc.).
// Inserção direta na tabela public.app_events (RLS: usuário insere os próprios eventos).
import { supabase } from "@/integrations/supabase/client";

let currentUserId: string | null = null;
let sessionId: string | null = null;

function getSessionId(): string {
  if (!sessionId) {
    try {
      sessionId = crypto.randomUUID();
    } catch {
      sessionId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
  }
  return sessionId;
}

function getPlatform(): string {
  try {
    const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    if (cap?.getPlatform) return cap.getPlatform(); // 'ios' | 'android' | 'web'
  } catch { /* ignore */ }
  return "web";
}

/** Define (ou limpa) o usuário atual. Chamado pelo AnalyticsTracker. */
export function setAnalyticsUser(id: string | null) {
  if (id !== currentUserId) {
    currentUserId = id;
    // nova sessão a cada login distinto
    if (id) sessionId = null;
  }
}

export type AppEventType =
  | "session_start"
  | "page_view"
  | "heartbeat"
  | "reached_home"
  | "login"
  | "signup_complete"
  | "action"
  | "error";

/** Registra um evento. Silencioso em qualquer falha (nunca quebra a UI). */
export async function trackAppEvent(
  type: AppEventType,
  opts?: { path?: string; label?: string; meta?: Record<string, unknown> },
): Promise<void> {
  try {
    if (!currentUserId) return;
    await supabase.from("app_events" as never).insert({
      user_id: currentUserId,
      session_id: getSessionId(),
      type,
      path: opts?.path ?? (typeof location !== "undefined" ? location.pathname : null),
      label: opts?.label ?? null,
      meta: opts?.meta ?? null,
      platform: getPlatform(),
    } as never);
  } catch { /* silencioso */ }
}

/** Registra uma busca do cliente (termo e/ou categoria). Ignora buscas vazias. */
export function trackSearch(query: string, category?: string | null): void {
  const q = (query || "").trim();
  const cat = category || null;
  if (!q && !cat) return;
  void trackAppEvent("action", {
    label: "search",
    meta: { query: q || null, category: cat },
  });
}

/** Registra a visita a um perfil de profissional. */
export function trackProfileView(
  professionalId: string,
  professionalName?: string | null,
  category?: string | null,
): void {
  void trackAppEvent("action", {
    label: "profile_view",
    meta: {
      professional_id: professionalId,
      professional_name: professionalName || null,
      category: category || null,
    },
  });
}
