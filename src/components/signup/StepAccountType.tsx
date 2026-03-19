import { User, Briefcase } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

type AccountType = "client" | "professional";

interface Props {
  onSelect: (type: AccountType) => void;
}

const StepAccountType = ({ onSelect }: Props) => {
  // ✅ FUNÇÃO HARD RESET: A mesma limpeza nuclear usada no Signup principal
  const [proModalOpen, setProModalOpen] = useState(false);

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
              onClick={() => {
                if (opt.type === "professional") {
                  setProModalOpen(true);
                } else {
                  onSelect(opt.type);
                }
              }}
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

      <Dialog open={proModalOpen} onOpenChange={setProModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Você presta serviços (não vende produtos)?</DialogTitle>
            <DialogDescription>
              Nossa plataforma é direcionada para prestadores de serviço. Se você vende produtos e não presta serviços, seu cadastro pode ser reprovado.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <div className="flex w-full gap-2">
              <button
                type="button"
                onClick={() => setProModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors"
              >
                NÃO
              </button>
              <button
                type="button"
                onClick={() => {
                  setProModalOpen(false);
                  onSelect("professional");
                }}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                SIM
              </button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StepAccountType;