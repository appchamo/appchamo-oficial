const KEY = "chamo_post_auth_redirect";

export function setPostAuthRedirect(path: string): void {
  if (typeof window === "undefined") return;
  if (path.startsWith("/") && !path.startsWith("//")) {
    sessionStorage.setItem(KEY, path);
  }
}

/** Caminho atual (pathname + search + hash) para voltar após login/cadastro. */
export function getCurrentPathForAuthReturn(): string {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function peekPostAuthRedirect(): string | null {
  if (typeof window === "undefined") return null;
  const v = sessionStorage.getItem(KEY);
  if (v && v.startsWith("/") && !v.startsWith("//")) return v;
  return null;
}

export function clearPostAuthRedirect(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(KEY);
}

/** Lê e remove o destino pendente (usar uma vez após auth OK). */
export function consumePostAuthRedirect(): string | null {
  const v = peekPostAuthRedirect();
  clearPostAuthRedirect();
  return v;
}

/** Resolve destino: prioriza sessionStorage (ex.: voltou do OAuth) e depois o state do React Router. */
export function resolveAuthReturnPath(fromState: string | undefined | null): string | null {
  const fromStorage = peekPostAuthRedirect();
  if (fromStorage) return fromStorage;
  if (fromState && fromState.startsWith("/") && !fromState.startsWith("//")) return fromState;
  return null;
}
