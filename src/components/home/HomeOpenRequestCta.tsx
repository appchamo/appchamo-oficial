import { Link } from "react-router-dom";
import { Radio, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

/**
 * Atalho na Home para publicar um pedido aberto (solicitação regional).
 */
const HomeOpenRequestCta = () => {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <Link
      to="/solicitar-servico"
      className="flex items-center gap-3 w-full rounded-2xl border-2 border-primary/35 bg-gradient-to-r from-primary/10 to-primary/5 px-4 py-3.5 shadow-sm hover:border-primary/50 hover:shadow-md active:scale-[0.99] transition-all"
    >
      <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
        <Radio className="w-5 h-5 text-primary-foreground" aria-hidden />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <p className="text-sm font-bold text-foreground">Solicitar serviço</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
          Publique o que precisa e receba interesse de profissionais da sua região
        </p>
      </div>
      <ChevronRight className="w-5 h-5 text-primary shrink-0" aria-hidden />
    </Link>
  );
};

export default HomeOpenRequestCta;
