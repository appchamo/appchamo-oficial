import { User, Briefcase } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type AccountType = "client" | "professional";

interface Props {
  onSelect: (type: AccountType) => void;
}

const StepAccountType = ({ onSelect }: Props) => {
  // ✅ FUNÇÃO HARD RESET: A mesma limpeza nuclear usada no Signup principal
  const forceExitToLogin = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      // 1. Tenta deslogar no servidor silenciosamente
      await supabase.auth.signOut().catch(() => {});

      // 2. Extermínio do cache local
      window.localStorage.clear();
      window.sessionStorage.clear();

      // 3. Extermínio dos cookies
      const cookies = document.cookie.split(";");
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i];
        const eqPos = cookie.indexOf("=");
        const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
      }

      // 4. Trava de segurança para o Login saber que foi um clique manual
      localStorage.setItem("manual_login_intent", "true");

      // 5. Redirecionamento cirúrgico sem hash na URL
      window.location.replace(window.location.origin + "/login");
    } catch (err) {
      window.location.replace(window.location.origin + "/login");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-gradient mb-2">Chamô</h1>
          <p className="text-sm text-muted-foreground">Escolha o tipo de conta</p>
        </div>
        <div className="flex flex-col gap-3">
          {[
            { type: "client" as const, icon: User, label: "Cliente", desc: "Contrate profissionais" },
            { type: "professional" as const, icon: Briefcase, label: "Profissional", desc: "Ofereça seus serviços" },
          ].map((opt) => (
            <button
              key={opt.type}
              onClick={() => onSelect(opt.type)}
              className="flex items-center gap-4 bg-card border rounded-2xl p-5 hover:border-primary/40 hover:shadow-card transition-all text-left"
            >
              <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center">
                <opt.icon className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground">{opt.label}</p>
                <p className="text-xs text-muted-foreground">{opt.desc}</p>
              </div>
            </button>
          ))}
        </div>
        <p className="text-center text-xs text-muted-foreground mt-4">
          Já tem conta?{" "}
          <button 
            onClick={forceExitToLogin} 
            className="text-primary font-medium hover:underline bg-transparent border-none cursor-pointer p-0"
          >
            Entrar
          </button>
        </p>
      </div>
    </div>
  );
};

export default StepAccountType;