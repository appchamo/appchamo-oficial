import { Link, useNavigate } from "react-router-dom";
import { LogOut, Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface SupportDeskLayoutProps {
  children: React.ReactNode;
}

const SupportDeskLayout = ({ children }: SupportDeskLayoutProps) => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header
        className="flex-shrink-0 z-30 bg-card border-b px-4 py-3 flex items-center justify-between gap-2"
        style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}
      >
        <h1 className="text-lg font-bold text-foreground truncate">Central de Atendimento</h1>
        <div className="flex items-center gap-2">
          <Link
            to="/suporte-desk/notificacoes"
            className="p-2.5 rounded-xl hover:bg-muted transition-colors relative"
            aria-label="Notificações"
          >
            <Bell className="w-5 h-5 text-foreground" />
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sair
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-auto px-4 py-4 max-w-screen-lg mx-auto w-full">
        {children}
      </main>
    </div>
  );
};

export default SupportDeskLayout;
