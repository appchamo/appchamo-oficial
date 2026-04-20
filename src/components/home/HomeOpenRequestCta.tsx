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
        className="group flex w-full items-center gap-3 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent px-4 py-3.5 text-left shadow-sm transition-all hover:border-primary/50 hover:shadow-md active:scale-[0.99]"
      >
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/30">
          <Radio className="h-[22px] w-[22px]" strokeWidth={2.25} aria-hidden />
          <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-primary ring-2 ring-background" />
          </span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] font-bold text-foreground tracking-tight leading-tight">
            Solicitar serviço
          </span>
          <span className="mt-0.5 text-[11px] text-muted-foreground leading-snug">
            Diga o que você precisa e os profissionais aparecem para você
          </span>
        </span>
        <ChevronRight
          className="h-5 w-5 shrink-0 text-primary transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </button>
      <OpenServiceRequestModal open={open} onOpenChange={setOpen} />
    </>
  );
};

export default HomeOpenRequestCta;
