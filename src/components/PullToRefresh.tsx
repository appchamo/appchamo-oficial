import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTriggerRefresh, useIsRefreshing } from "@/contexts/RefreshContext";

const PULL_THRESHOLD = 88;
const MAX_PULL = 140;
/** Só bloqueia scroll nativo depois desse arraste (evita refresh acidental no iOS). */
const PREVENT_DEFAULT_AFTER = 16;
/** Distância que a tela fica puxada enquanto roda o refresh */
const REFRESH_OFFSET = 56;

interface PullToRefreshProps {
  children: React.ReactNode;
  /** Ref do elemento que faz scroll (ex.: main). Se não passar, usa document. */
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  /** Elemento de scroll (alternativa ao ref; no iOS ajuda anexar os toques no próprio elemento). */
  scrollContainer?: HTMLElement | null;
}

export default function PullToRefresh({ children, scrollContainerRef, scrollContainer }: PullToRefreshProps) {
  const triggerRefresh = useTriggerRefresh();
  const isGlobalRefreshing = useIsRefreshing();
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [useTransition, setUseTransition] = useState(false);
  const startY = useRef(0);
  const pullDistanceRef = useRef(0);
  const refreshingRef = useRef(false);

  const el = scrollContainer ?? scrollContainerRef?.current;

  const getScrollTop = useCallback(() => {
    const target = scrollContainer ?? scrollContainerRef?.current;
    if (target) return target.scrollTop;
    return window.scrollY ?? document.documentElement.scrollTop ?? 0;
  }, [scrollContainerRef, scrollContainer]);

  pullDistanceRef.current = pullDistance;
  refreshingRef.current = refreshing;

  useEffect(() => {
    const isDoc = !el || el === document;
    const target = isDoc ? document : (el && typeof el.addEventListener === "function" ? el : document);

    const onTouchStart = (e: TouchEvent) => {
      startY.current = e.touches[0].clientY;
      setUseTransition(false);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      const scrollTop = getScrollTop();
      if (scrollTop > 1) return;
      const currentY = e.touches[0].clientY;
      const diff = currentY - startY.current;
      if (diff > 8) {
        const distance = Math.min(diff * 0.45, MAX_PULL);
        setPullDistance(distance);
        if (distance > PREVENT_DEFAULT_AFTER && e.cancelable) e.preventDefault();
      } else {
        setPullDistance(0);
      }
    };

    const onTouchEnd = async () => {
      setUseTransition(true);
      if (refreshingRef.current) return;
      const distance = pullDistanceRef.current;
      if (distance >= PULL_THRESHOLD) {
        setRefreshing(true);
        setPullDistance(0);
        try {
          await triggerRefresh();
        } finally {
          setRefreshing(false);
        }
      } else {
        setPullDistance(0);
      }
    };

    if (target === document) {
      document.addEventListener("touchstart", onTouchStart, { passive: true });
      document.addEventListener("touchmove", onTouchMove, { passive: false });
      document.addEventListener("touchend", onTouchEnd, { passive: true });
      return () => {
        document.removeEventListener("touchstart", onTouchStart);
        document.removeEventListener("touchmove", onTouchMove);
        document.removeEventListener("touchend", onTouchEnd);
      };
    }

    const scrollEl = target as HTMLElement;
    try {
      scrollEl.addEventListener("touchstart", onTouchStart, { passive: true });
      scrollEl.addEventListener("touchmove", onTouchMove, { passive: false });
      scrollEl.addEventListener("touchend", onTouchEnd, { passive: true });
    } catch {
      return;
    }
    return () => {
      try {
        scrollEl.removeEventListener("touchstart", onTouchStart);
        scrollEl.removeEventListener("touchmove", onTouchMove);
        scrollEl.removeEventListener("touchend", onTouchEnd);
      } catch {}
    };
  }, [getScrollTop, triggerRefresh, el]);

  const progress = Math.min(pullDistance / PULL_THRESHOLD, 1);
  const contentOffset = refreshing ? REFRESH_OFFSET : pullDistance;
  const showIndicator = contentOffset > 0;
  const indicatorOpacity = showIndicator ? Math.min(1, Math.max(0.35, progress * 1.4)) : 0;
  /** Estilo Instagram: gira o tempo todo enquanto arrasta ou enquanto o refresh roda. */
  const spinActive = pullDistance > 4 || refreshing || isGlobalRefreshing;
  const safeTop = "var(--safe-top, env(safe-area-inset-top, 0px))";

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Faixa fixa por cima de tudo – fundo igual ao tema (hsl), ícone laranja girando */}
      <div
        className="fixed left-0 right-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-background"
        style={{
          top: 0,
          boxSizing: "border-box",
          height: contentOffset > 0 ? `calc(${contentOffset}px + ${safeTop})` : 0,
          paddingTop: contentOffset > 0 ? safeTop : 0,
          minHeight: 0,
          backgroundColor: "hsl(var(--background))",
          transition: useTransition ? "height 0.25s ease-out, padding-top 0.25s ease-out" : "none",
          pointerEvents: "none",
        }}
      >
        <div
          className="flex min-h-0 flex-1 w-full items-center justify-center"
          style={{
            opacity: indicatorOpacity,
            transition: useTransition ? "opacity 0.2s ease-out" : "none",
          }}
        >
          <Loader2
            className={`h-7 w-7 shrink-0 text-primary ${spinActive ? "animate-spin" : ""}`}
            style={{ animationDuration: spinActive ? "0.65s" : undefined }}
          />
        </div>
      </div>
      {/* Conteúdo desce quando puxa */}
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col"
        style={{
          marginTop: contentOffset,
          transition: useTransition ? "margin-top 0.25s ease-out" : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}
