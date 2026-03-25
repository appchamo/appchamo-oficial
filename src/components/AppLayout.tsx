import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Header from "./Header";
import BottomNav from "./BottomNav";
import PullToRefresh from "./PullToRefresh";
import { MenuProvider } from "@/contexts/MenuContext";
import OnboardingTutorial from "./OnboardingTutorial";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import DiagPanel from "@/components/DiagPanel";
import { EDGE_SWIPE_BACK_ZONE_PX, MAIN_APP_TAB_PATHS, getMainAppTabSwipeIndex } from "@/lib/mainAppTabs";

interface AppLayoutProps {
  children: React.ReactNode;
  showHeader?: boolean;
}

const MemoizedHeader = memo(Header);
const MemoizedBottomNav = memo(BottomNav);

const SWIPE_MIN_PX = 64;
const SWIPE_VERTICAL_RATIO = 1.25; // ignora se movimento vertical dominar (scroll da página)

const AppLayout = ({ children, showHeader = true }: AppLayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === "/home";
  const isProProfile = /^\/pro\/[^/]+$/.test(location.pathname) || /^\/professional\/[^/]+$/.test(location.pathname);
  const isMainPullTab =
    location.pathname === "/search" ||
    location.pathname === "/messages" ||
    location.pathname === "/notifications";
  const usePullToRefresh = isHome || isProProfile || isMainPullTab;

  const swipeTouch = useRef<{ x: number; y: number; ignore: boolean } | null>(null);
  const mainScrollRef = useRef<HTMLElement | null>(null);

  const onTabSwipeTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.targetTouches[0];
    if (!t) return;
    if (t.clientX <= EDGE_SWIPE_BACK_ZONE_PX) return;
    const target = e.target as HTMLElement | null;
    const ignore = !!(target && typeof target.closest === "function" && target.closest("[data-tab-swipe-ignore]"));
    swipeTouch.current = { x: t.clientX, y: t.clientY, ignore };
  }, []);

  const onTabSwipeTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const start = swipeTouch.current;
      swipeTouch.current = null;
      if (!start || start.ignore) return;
      const t = e.changedTouches[0];
      if (!t) return;

      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (absX < SWIPE_MIN_PX) return;
      if (absY * SWIPE_VERTICAL_RATIO > absX) return;

      const idx = getMainAppTabSwipeIndex(location.pathname);
      if (idx < 0) return;

      if (dx < 0 && idx < MAIN_APP_TAB_PATHS.length - 1) {
        navigate(MAIN_APP_TAB_PATHS[idx + 1]);
      } else if (dx > 0 && idx > 0) {
        navigate(MAIN_APP_TAB_PATHS[idx - 1]);
      }
    },
    [location.pathname, navigate]
  );

  // Modal global pós-OAuth: precisa ficar acima da Home (não dentro da Home)
  const [oauthWelcomeOpen, setOauthWelcomeOpen] = useState(false);
  useEffect(() => {
    const hasFlag = (() => {
      try {
        if (localStorage.getItem("chamo_oauth_just_landed") === "1") return true;
        if (sessionStorage.getItem("chamo_oauth_just_landed") === "1") return true;
      } catch (_) {}
      return false;
    })();
    if (!hasFlag) return;
    const t = setTimeout(() => setOauthWelcomeOpen(true), 700);
    return () => clearTimeout(t);
  }, []);

  const closeOauthWelcome = useCallback(() => {
    try {
      sessionStorage.removeItem("chamo_oauth_just_landed");
      localStorage.removeItem("chamo_oauth_just_landed");
    } catch (_) {}
    setOauthWelcomeOpen(false);
  }, []);

  const mainContent = (
    <main
      ref={mainScrollRef}
      key={location.pathname}
      className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain animate-in fade-in duration-300 touch-pan-y ${isHome ? "bg-secondary pt-2" : "pt-3"}`}
      onTouchStart={onTabSwipeTouchStart}
      onTouchEnd={onTabSwipeTouchEnd}
    >
      {children}
    </main>
  );

  return (
    <MenuProvider>
      <div className={`flex min-h-0 flex-1 flex-col pb-20 ${isHome ? "bg-secondary" : "bg-background"}`}>
        {showHeader && <MemoizedHeader />}
        {usePullToRefresh ? (
          <PullToRefresh scrollContainerRef={mainScrollRef}>{mainContent}</PullToRefresh>
        ) : (
          mainContent
        )}
        <MemoizedBottomNav />
        <OnboardingTutorial />
        <DiagPanel />

        {/* Modal global pós-OAuth (Apple/Google): deve ficar acima da Home */}
        <Dialog open={oauthWelcomeOpen} onOpenChange={() => {}}>
          <DialogContent
            className="max-w-sm text-center"
            onPointerDownOutside={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle className="text-center">Seja bem-vindo</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground py-2">
              Toque em Fechar para carregar seu app com tudo certinho.
            </p>
            <button
              type="button"
              onClick={closeOauthWelcome}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              Fechar
            </button>
          </DialogContent>
        </Dialog>
      </div>
    </MenuProvider>
  );
};

export default AppLayout;