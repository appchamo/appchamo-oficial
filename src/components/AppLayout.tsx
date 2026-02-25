import React, { memo } from "react"; // Adicionado memo para evitar re-renderizações inúteis
import Header from "./Header";
import BottomNav from "./BottomNav";

interface AppLayoutProps {
  children: React.ReactNode;
  showHeader?: boolean;
}

// 🚀 OTIMIZAÇÃO: Memorizamos o Header e o BottomNav para que eles não 
// sejam processados novamente cada vez que você troca de página, 
// a menos que as propriedades deles mudem.
const MemoizedHeader = memo(Header);
const MemoizedBottomNav = memo(BottomNav);

const AppLayout = ({ children, showHeader = true }: AppLayoutProps) => {
  return (
    <div className="min-h-screen bg-background pb-20">
      {/* ✨ Renderização inteligente: Se o componente pai AppLayout atualizar, 
         o Header e o BottomNav só vão atualizar se houver mudança real neles.
      */}
      {showHeader && <MemoizedHeader />}
      
      <main className="animate-in fade-in duration-300">
        {children}
      </main>

      <MemoizedBottomNav />
    </div>
  );
};

export default AppLayout;