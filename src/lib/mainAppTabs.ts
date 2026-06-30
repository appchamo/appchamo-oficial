/** Zona na borda esquerda para gesto “voltar” no histórico (EdgeSwipeBack). Swipe entre abas ignora toques que começam aqui. */
export const EDGE_SWIPE_BACK_ZONE_PX = 36;

/** Ordem das abas principais (bottom nav) — usado também para swipe entre telas */
export const MAIN_APP_TAB_PATHS = ["/home", "/search", "/messages", "/rewards", "/profile"] as const;
export type MainAppTabPath = (typeof MAIN_APP_TAB_PATHS)[number];

/** `data-chamo-tab-persist` por rota de aba (peek no gesto voltar). */
export const MAIN_TAB_PERSIST_ATTR: Record<MainAppTabPath, string> = {
  "/home": "home",
  "/search": "search",
  "/messages": "messages",
  "/rewards": "rewards",
  "/profile": "profile",
};

export function isMainAppTabPath(pathname: string): boolean {
  return MAIN_APP_TAB_PATHS.includes(pathname as MainAppTabPath);
}

/**
 * Telas que precisam rolar como página inteira (body-style) dentro do shell.
 * Sem isso, `RoutesOverlayShell` usa overflow-hidden e o formulário de cadastro/login fica “travado” no app nativo.
 */
const FULL_PAGE_SCROLL_EXACT = new Set([
  "/",
  "/signup",
  "/complete-signup",
  "/login",
  "/auth/email-confirm",
  "/reset-password",
  "/oauth-callback",
  "/post-login",
  "/hard-reload",
  "/terms-of-use",
  "/privacy",
  "/exclusao-de-conta",
  "/admin/login",
  "/signup-pro",
]);

export function isFullPageScrollRoute(pathname: string): boolean {
  if (FULL_PAGE_SCROLL_EXACT.has(pathname)) return true;
  // Painel admin: rola a página inteira (senão o shell corta o conteúdo no app).
  if (pathname.startsWith("/admin")) return true;
  if (pathname.startsWith("/profile/settings")) return true;
  if (pathname === "/solicitar-servico") return true;
  if (pathname === "/client/pedidos-abertos" || pathname.startsWith("/client/pedidos-abertos/")) return true;
  if (pathname === "/pro/pedidos-abertos") return true;
  if (pathname === "/profile/relatorios") return true;
  if (pathname === "/pro/comunidade") return true;
  if (/^\/p\/comunidade\/[^/]+$/.test(pathname)) return true;
  return false;
}

/** Rotas “empilhadas” por cima das abas (perfil público, categorias, chat…). */
export function isOverlayStackRoute(pathname: string): boolean {
  return !isMainAppTabPath(pathname);
}

export function persistAttrForTabPath(pathname: string): string | null {
  if (!isMainAppTabPath(pathname)) return null;
  return MAIN_TAB_PERSIST_ATTR[pathname as MainAppTabPath];
}

/**
 * Índice da aba para navegação por swipe, ou -1 se a rota atual não deve reagir ao gesto
 * (ex.: /messages/:id — dentro do chat não troca de aba arrastando).
 */
export function getMainAppTabSwipeIndex(pathname: string): number {
  if (pathname.startsWith("/messages/")) return -1;
  return MAIN_APP_TAB_PATHS.indexOf(pathname as MainAppTabPath);
}
