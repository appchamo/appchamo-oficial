import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useTriggerRefresh } from "@/contexts/RefreshContext";

const PULL_THRESHOLD = 72;
const MAX_PULL = 140;
const INDICATOR_SIZE = 44;
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
      if (scrollTop > 2) return;
      const currentY = e.touches[0].clientY;
      const diff = currentY - startY.current;
      if (diff > 0) {
        const distance = Math.min(diff * 0.5, MAX_PULL);
        setPullDistance(distance);
        if (distance > 6) e.preventDefault();
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
  const rotation = progress * 360;
  const contentOffset = refreshing ? REFRESH_OFFSET : pullDistance;
  const showIndicator = contentOffset > 0;

  return (
    <div className="flex flex-col min-h-0">
      {/* Faixa que cresce ao puxar – a tela “arrasta” porque o conteúdo desce junto */}
      <div
        className="flex-shrink-0 flex items-center justify-center overflow-hidden"
        style={{
          height: contentOffset,
          minHeight: 0,
          background: "var(--background)",
          transition: useTransition ? "height 0.25s ease-out" : "none",
        }}
      >
        <div
          className="flex items-center justify-center flex-shrink-0 transition-[opacity,transform] duration-150"
          style={{
            width: INDICATOR_SIZE,
            height: INDICATOR_SIZE,
            opacity: showIndicator ? 1 : 0,
            transform: `translateY(${showIndicator ? 0 : -8}px)`,
          }}
        >
          <div className="rounded-full bg-card border-2 border-border shadow-lg flex items-center justify-center w-full h-full">
            {refreshing ? (
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            ) : (
              <RefreshCw
                className="w-5 h-5 text-primary transition-transform duration-150"
                style={{ transform: `rotate(${rotation}deg)` }}
              />
            )}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
