import React, { memo, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import Header from "./Header";
import BottomNav from "./BottomNav";
import { DesktopSidebar } from "./SideMenu";
import PullToRefresh from "./PullToRefresh";
import { MenuProvider } from "@/contexts/MenuContext";
import DiagPanel from "@/components/DiagPanel";

interface AppLayoutProps {
  children: React.ReactNode;
  showHeader?: boolean;
}

const MemoizedHeader = memo(Header);
const MemoizedBottomNav = memo(BottomNav);

const AppLayout = ({ children, showHeader = true }: AppLayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin, user } = useAuth();

  // Contas de admin (sócios com papel *_admin) não usam o app comum: qualquer
  // tela do app manda direto pro painel /admin. Cobre o caso do celular abrir
  // no /home. Não afeta: usuário do suporte (layout próprio) nem o preview da
  // Home dentro do admin (iframe com ?preview=1).
  useEffect(() => {
    if (!isAdmin) return;
    let isPreview = false;
    try { isPreview = new URLSearchParams(window.location.search).get("preview") === "1"; } catch { /* */ }
    if (isPreview) return;
    const email = (user?.email || "").toLowerCase().trim();
    if (email === "suporte@appchamo.com") return;
    navigate("/admin", { replace: true });
  }, [isAdmin, user, navigate]);

  const isHome = location.pathname === "/home";
  const isProProfile = /^\/pro\/[^/]+$/.test(location.pathname) || /^\/professional\/[^/]+$/.test(location.pathname);
  const isMainPullTab =
    location.pathname === "/search" ||
    location.pathname === "/messages" ||
    location.pathname === "/notifications";
  const usePullToRefresh = isHome || isProProfile || isMainPullTab;

  const mainScrollRef = useRef<HTMLElement | null>(null);

  // Pós-OAuth: limpa a flag de "acabou de logar" (o modal de boas-vindas foi removido).
  useEffect(() => {
    try {
      sessionStorage.removeItem("chamo_oauth_just_landed");
      localStorage.removeItem("chamo_oauth_just_landed");
    } catch (_) {}
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
          <DiagPanel />
        </div>
      </div>
    </MenuProvider>
  );
};

export default AppLayout;