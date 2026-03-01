import React, { memo } from "react";
import { useLocation } from "react-router-dom";
import Header from "./Header";
import BottomNav from "./BottomNav";
import PullToRefresh from "./PullToRefresh";

interface AppLayoutProps {
  children: React.ReactNode;
  showHeader?: boolean;
}

const MemoizedHeader = memo(Header);
const MemoizedBottomNav = memo(BottomNav);

const AppLayout = ({ children, showHeader = true }: AppLayoutProps) => {
  const location = useLocation();
  const isHome = location.pathname === "/home";

  const mainContent = (
    <main key={location.pathname} className="flex-1 animate-in fade-in duration-300 pt-3">
      {children}
    </main>
  );

  return (
    <div className="min-h-[100dvh] bg-background pb-20 flex flex-col">
      {showHeader && <MemoizedHeader />}
      {isHome ? <PullToRefresh>{mainContent}</PullToRefresh> : mainContent}
      <MemoizedBottomNav />
    </div>
  );
};

export default AppLayout;