/** Zona na borda esquerda para gesto “voltar” no histórico (EdgeSwipeBack). Swipe entre abas ignora toques que começam aqui. */
export const EDGE_SWIPE_BACK_ZONE_PX = 36;

/** Ordem das abas principais (bottom nav) — usado também para swipe entre telas */
export const MAIN_APP_TAB_PATHS = ["/home", "/search", "/messages", "/notifications", "/profile"] as const;
export type MainAppTabPath = (typeof MAIN_APP_TAB_PATHS)[number];

/** `data-chamo-tab-persist` por rota de aba (peek no gesto voltar). */
export const MAIN_TAB_PERSIST_ATTR: Record<MainAppTabPath, string> = {
  "/home": "home",
  "/search": "search",
  "/messages": "messages",
  "/notifications": "notifications",
  "/profile": "profile",
};

export function isMainAppTabPath(pathname: string): boolean {
  return MAIN_APP_TAB_PATHS.includes(pathname as MainAppTabPath);
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
