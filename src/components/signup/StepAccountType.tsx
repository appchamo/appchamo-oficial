import { User, Briefcase } from "lucide-react";
import { Link } from "react-router-dom";

type AccountType = "client" | "professional";

interface Props {
  onSelect: (type: AccountType) => void;
}

const StepAccountType = ({ onSelect }: Props) => (
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
        <Link to="/login" className="text-primary font-medium hover:underline">Entrar</Link>
      </p>
    </div>
  </div>
);

export default StepAccountType;
