import { Megaphone } from "lucide-react";

/** Aviso global no topo da Home — clientes e profissionais. */
export default function HomeLaunchBanner() {
  return (
    <div className="w-full max-w-screen-lg mx-auto px-4 pt-2 pb-1 shrink-0">
      <div
        role="status"
        className="flex gap-3 items-start rounded-xl border border-primary/30 bg-gradient-to-r from-primary/12 via-orange-500/10 to-amber-500/8 px-3.5 py-3 shadow-sm"
      >
        <Megaphone className="w-5 h-5 text-primary shrink-0 mt-0.5" aria-hidden />
        <p className="text-sm text-foreground leading-snug">
          <strong className="font-semibold text-primary">Lançamento oficial dia 15 de Abril.</strong> Até lá, conheça o
          aplicativo e se torne especialista em todas as funcionalidades!
        </p>
      </div>
    </div>
  );
}
