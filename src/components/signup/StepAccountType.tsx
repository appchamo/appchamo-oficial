import { IdCard, ScanSearch } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type AccountType = "client" | "professional";

interface Props {
  onSelect: (type: AccountType) => void;
}

const StepAccountType = ({ onSelect }: Props) => {
  const forceExitToLogin = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      await supabase.auth.signOut().catch(() => {});

      window.localStorage.clear();
      window.sessionStorage.clear();

      const cookies = document.cookie.split(";");
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i];
        const eqPos = cookie.indexOf("=");
        const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
      }

      localStorage.setItem("manual_login_intent", "true");

      window.location.replace(window.location.origin + "/login");
    } catch {
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
            {
              type: "client" as const,
              icon: ScanSearch,
              label: "Cliente",
              desc: "Contrate profissionais",
              disabled: false,
            },
            {
              type: "professional" as const,
              icon: IdCard,
              label: "Profissional",
              desc: "Ofereça seus serviços",
              disabled: true,
            },
          ].map((opt) => (
            <button
              key={opt.type}
              type="button"
              disabled={opt.disabled}
              onClick={() => !opt.disabled && onSelect(opt.type)}
              className={`group flex items-center gap-4 bg-card border border-border/80 rounded-2xl p-5 text-left transition-all ${
                opt.disabled
                  ? "opacity-55 cursor-not-allowed border-dashed"
                  : "hover:border-primary/35 hover:shadow-md"
              }`}
            >
              <div
                className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/[0.14] via-primary/[0.07] to-transparent ring-1 ring-primary/15 shadow-sm ${
                  opt.disabled ? "" : "transition-transform duration-200 group-hover:scale-[1.02] group-hover:ring-primary/25"
                }`}
                aria-hidden
              >
                <opt.icon className="h-7 w-7 text-primary" strokeWidth={1.5} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-foreground">{opt.label}</p>
                  {opt.disabled ? (
                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                      Em breve
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">{opt.desc}</p>
              </div>
            </button>
          ))}
        </div>
        <p className="text-center text-xs text-muted-foreground mt-4">
          Já tem conta?{" "}
          <button
            type="button"
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
