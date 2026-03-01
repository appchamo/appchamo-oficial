import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useTriggerRefresh } from "@/contexts/RefreshContext";

const PULL_THRESHOLD = 72;
const MAX_PULL = 100;
const INDICATOR_SIZE = 44;

export default function PullToRefresh({ children }: { children: React.ReactNode }) {
  const triggerRefresh = useTriggerRefresh();
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const pullDistanceRef = useRef(0);
  const refreshingRef = useRef(false);

  const getScrollTop = useCallback(() => {
    return window.scrollY ?? document.documentElement.scrollTop ?? 0;
  }, []);

  pullDistanceRef.current = pullDistance;
  refreshingRef.current = refreshing;

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      startY.current = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      const scrollTop = getScrollTop();
      if (scrollTop > 0) return;
      const currentY = e.touches[0].clientY;
      const diff = currentY - startY.current;
      if (diff > 0) {
        const distance = Math.min(diff * 0.5, MAX_PULL);
        setPullDistance(distance);
        if (distance > 10) e.preventDefault();
      }
    };

    const onTouchEnd = async () => {
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

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [getScrollTop, triggerRefresh]);

  const progress = Math.min(pullDistance / PULL_THRESHOLD, 1);
  const rotation = progress * 360;
  const showIndicator = pullDistance > 0 || refreshing;

  return (
    <>
      <div
        className="fixed left-0 right-0 z-50 flex items-center justify-center pointer-events-none transition-[opacity,transform] duration-200"
        style={{
          top: `calc(env(safe-area-inset-top, 0px) + ${refreshing ? 24 : Math.min(pullDistance * 0.4, 36)}px)`,
          opacity: showIndicator ? 1 : 0,
          transform: `translateY(${showIndicator ? 0 : -10}px)`,
        }}
      >
        <div
          className="rounded-full bg-card border-2 border-border shadow-lg flex items-center justify-center flex-shrink-0"
          style={{
            width: INDICATOR_SIZE,
            height: INDICATOR_SIZE,
            boxShadow: "0 4px 14px rgba(0,0,0,0.15)",
          }}
        >
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
      {children}
    </>
  );
}
