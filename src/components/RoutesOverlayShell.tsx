import { useLocation } from "react-router-dom";
import { isOverlayStackRoute } from "@/lib/mainAppTabs";

/**
 * Rotas “empilhadas” ficam neste shell fixo; ao arrastar para voltar só ele se move,
 * revelando a aba persistente por baixo. Nas abas principais o conteúdo fica oculto aqui
 * (pointer-events none) e as telas reais vêm de MainTabPersistentLayers.
 */
export default function RoutesOverlayShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const overlay = isOverlayStackRoute(location.pathname);

  return (
    <div
      id="chamo-route-slide-shell"
      data-overlay={overlay ? "1" : "0"}
      className={
        overlay
          ? "fixed inset-0 z-[12] box-border flex min-h-0 flex-col bg-background pt-[var(--safe-top,env(safe-area-inset-top,0px))]"
          : "pointer-events-none fixed inset-0 z-[12] box-border flex min-h-0 flex-col pt-[var(--safe-top,env(safe-area-inset-top,0px))]"
      }
    >
      <div
        className={
          overlay ? "flex min-h-0 w-full flex-1 flex-col overflow-hidden" : "hidden"
        }
        aria-hidden={!overlay}
      >
        {children}
      </div>
    </div>
  );
}
