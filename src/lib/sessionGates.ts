/**
 * Controlador central dos "gates" de sessão (telas/modais que disputam a atenção
 * logo que o app abre): atualização obrigatória, conta bloqueada, região,
 * confirmação de WhatsApp, paywall, popups do admin e a roleta.
 *
 * Problema que resolve: cada gate tinha sua própria trava e nenhum sabia do outro,
 * então um modal (roleta/popup) subia POR CIMA de uma tela de onboarding ou de um
 * overlay de bloqueio. Aqui centralizamos a prioridade.
 *
 * Prioridade (maior primeiro): forceupdate > blocked > region > (redirects: phone/plan)
 * > popup > roleta. Overlays/telas sempre vencem; entre os modais, popup vence a roleta.
 */
import { useSyncExternalStore } from "react";

export const SESSION_GATE = {
  forceUpdate: "forceupdate",
  blocked: "blocked",
  region: "region",
  popup: "popup",
  roleta: "roleta",
} as const;

const active = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version += 1;
  listeners.forEach((l) => l());
}

/** Marca um gate como ativo/inativo. Idempotente. */
export function setSessionGate(id: string, isActive: boolean): void {
  const had = active.has(id);
  if (isActive && !had) {
    active.add(id);
    emit();
  } else if (!isActive && had) {
    active.delete(id);
    emit();
  }
}

/** Há algum gate ativo? Se `ids` for passado, checa só esses. */
export function isSessionGateActive(ids?: readonly string[]): boolean {
  if (!ids) return active.size > 0;
  return ids.some((id) => active.has(id));
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Hook reativo: re-renderiza o consumidor sempre que qualquer gate muda. */
export function useSessionGateSignal(): number {
  return useSyncExternalStore(subscribe, () => version, () => version);
}

/**
 * Rotas onde NENHUM modal (roleta/popup) pode aparecer — auth, cadastro, fluxos
 * e telas de decisão (paywall, confirmar WhatsApp).
 */
const FIRST_RUN_BLOCKED_PREFIXES = [
  "/login", "/signup", "/complete-signup", "/reset-password", "/oauth-callback",
  "/post-login", "/auth", "/admin", "/suporte-desk", "/signup-pro", "/qr-auth",
  "/checkout", "/c/", "/hard-reload", "/exclusao-de-conta", "/privacy", "/terms-of-use",
  "/verificar-whatsapp", "/assinar",
];

export function isFirstRunBlockedPath(path: string): boolean {
  if (path === "/") return true; // landing/redirect
  return FIRST_RUN_BLOCKED_PREFIXES.some((p) => path === p || path.startsWith(p));
}

/**
 * Verificação de WhatsApp pendente (mesma regra do PhoneVerificationGuard):
 * contas novas (a partir do CUTOFF) precisam confirmar o número antes de tudo.
 */
const PHONE_VERIFY_CUTOFF = new Date("2026-08-17T00:00:00Z").getTime();
export function phoneVerificationPending(
  profile: { created_at?: string | null; phone_verified?: boolean | null } | null | undefined,
): boolean {
  if (!profile) return false;
  const isNew = profile.created_at ? new Date(profile.created_at).getTime() >= PHONE_VERIFY_CUTOFF : false;
  if (!isNew) return false;
  return !profile.phone_verified;
}
