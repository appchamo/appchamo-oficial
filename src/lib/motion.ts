/**
 * Fundação de motion do Chamô (Framer Motion).
 * Variantes reutilizáveis pra dar fluidez "de app" — entrada de página,
 * stagger de listas, micro-interações. Mantido sutil e acelerado por GPU
 * (só opacity/transform) pra não pesar.
 */
import type { Variants } from "framer-motion";

/** Easing "app-like": ease-out suave, sensação rápida e fluida. */
export const easeApp = [0.22, 1, 0.36, 1] as const;

/** Entrada de página/seção: fade + leve subida. */
export const pageEnter: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: easeApp } },
};

/** Container que escalona a entrada dos filhos (usar com fadeUpItem). */
export const staggerContainer: Variants = {
  hidden: { opacity: 1 },
  show: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

/** Item que sobe e aparece — usar nos filhos diretos de staggerContainer. */
export const fadeUpItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: easeApp } },
};

/** Micro-interação de toque (pressionar). */
export const tapScale = { scale: 0.97 };
/** Leve elevação no hover (desktop). */
export const hoverLift = { y: -2 };
