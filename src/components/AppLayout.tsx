import React, { memo } from "react";
import { useLocation } from "react-router-dom";
import Header from "./Header";
import BottomNav from "./BottomNav";
import PullToRefresh from "./PullToRefresh";
import { MenuProvider } from "@/contexts/MenuContext";
import OnboardingTutorial from "./OnboardingTutorial";

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
      </div>
    </MenuProvider>
  );
};

export default AppLayout;