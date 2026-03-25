/** Ordem das abas principais (bottom nav) — usado também para swipe entre telas */
export const MAIN_APP_TAB_PATHS = ["/home", "/search", "/messages", "/notifications", "/profile"] as const;
export type MainAppTabPath = (typeof MAIN_APP_TAB_PATHS)[number];

/**
 * Índice da aba para navegação por swipe, ou -1 se a rota atual não deve reagir ao gesto
 * (ex.: /messages/:id — dentro do chat não troca de aba arrastando).
 */
export function getMainAppTabSwipeIndex(pathname: string): number {
  if (pathname.startsWith("/messages/")) return -1;
  return MAIN_APP_TAB_PATHS.indexOf(pathname as MainAppTabPath);
}
