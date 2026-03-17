import React, { memo, useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import Header from "./Header";
import BottomNav from "./BottomNav";
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
  const usePullToRefresh = isHome || isProProfile;

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
      key={location.pathname}
      className={`flex-1 animate-in fade-in duration-300 ${isHome ? "bg-secondary pt-2" : "pt-3"}`}
    >
      {children}
    </main>
  );

  return (
    <MenuProvider>
      <div className={`min-h-[100dvh] pb-20 flex flex-col ${isHome ? "bg-secondary" : "bg-background"}`}>
        {showHeader && <MemoizedHeader />}
        {usePullToRefresh ? <PullToRefresh>{mainContent}</PullToRefresh> : mainContent}
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