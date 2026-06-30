import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import Header from "./Header";
import BottomNav from "./BottomNav";
import { DesktopSidebar } from "./SideMenu";
import PullToRefresh from "./PullToRefresh";
import { MenuProvider } from "@/contexts/MenuContext";
import OnboardingTutorial from "./OnboardingTutorial";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import DiagPanel from "@/components/DiagPanel";

interface AppLayoutProps {
  children: React.ReactNode;
  showHeader?: boolean;
}

const MemoizedHeader = memo(Header);
const MemoizedBottomNav = memo(BottomNav);

const AppLayout = ({ children, showHeader = true }: AppLayoutProps) => {
  const location = useLocation();
  const isHome = location.pathname === "/home";
  const isProProfile = /^\/pro\/[^/]+$/.test(location.pathname) || /^\/professional\/[^/]+$/.test(location.pathname);
  const isMainPullTab =
    location.pathname === "/search" ||
    location.pathname === "/messages" ||
    location.pathname === "/notifications";
  const usePullToRefresh = isHome || isProProfile || isMainPullTab;

  const mainScrollRef = useRef<HTMLElement | null>(null);

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
    // Limpa a flag imediatamente para que, se o usuário matar o app antes de
    // interagir com o modal, a flag não persista no localStorage e o modal
    // "Bem-vindo" não reapareça numa abertura seguinte fora de contexto.
    try {
      sessionStorage.removeItem("chamo_oauth_just_landed");
      localStorage.removeItem("chamo_oauth_just_landed");
    } catch (_) {}
    const t = setTimeout(() => setOauthWelcomeOpen(true), 700);
    return () => clearTimeout(t);
  }, []);

  // Modo preview (iframe do Layout da Home no admin): só visualização, sem cliques.
  useEffect(() => {
    let isPreview = false;
    try { isPreview = new URLSearchParams(window.location.search).get("preview") === "1"; } catch { /* */ }
    if (isPreview) {
      document.body.classList.add("chamo-preview-mode");
      return () => document.body.classList.remove("chamo-preview-mode");
    }
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
      className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain animate-in fade-in duration-300 touch-pan-y ${isHome ? "bg-secondary pt-2" : "pt-3"} lg:px-5 xl:px-8 2xl:px-12`}
    >
      {children}
    </main>
  );

  return (
    <MenuProvider>
      <div
        className={`flex min-h-0 flex-1 flex-col lg:flex-row pb-20 lg:pb-0 ${isHome ? "bg-secondary lg:bg-neutral-200/60 dark:lg:bg-background" : "bg-background lg:bg-muted/30"}`}
      >
        <DesktopSidebar />
        <div
          className={`flex min-h-0 flex-1 flex-col min-w-0 ${isHome ? "lg:bg-secondary" : "lg:bg-background"}`}
        >
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
      </div>
    </MenuProvider>
  );
};

export default AppLayout;