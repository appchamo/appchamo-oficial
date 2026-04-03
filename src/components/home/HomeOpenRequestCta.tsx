import { useState } from "react";
import { Radio, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import OpenServiceRequestModal from "./OpenServiceRequestModal";

/**
 * Atalho na Home para publicar um pedido aberto — abre wizard em modal (3 etapas).
 */
const HomeOpenRequestCta = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-3 w-full rounded-2xl border-2 border-primary/40 bg-gradient-to-r from-primary/[0.12] via-amber-50/80 to-primary/[0.08] dark:from-primary/15 dark:via-background dark:to-primary/10 px-4 py-3.5 shadow-md shadow-primary/10 hover:border-primary/55 hover:shadow-lg hover:shadow-primary/15 active:scale-[0.99] transition-all text-left ring-1 ring-primary/10"
      >
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0 shadow-inner shadow-black/10">
          <Radio className="w-5 h-5 text-primary-foreground" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground tracking-tight">Solicitar serviço</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
            Passo a passo rápido — publique o que precisa na sua região
          </p>
        </div>
        <ChevronRight className="w-5 h-5 text-primary shrink-0" aria-hidden />
      </button>
      <OpenServiceRequestModal open={open} onOpenChange={setOpen} />
    </>
  );
};

export default HomeOpenRequestCta;
