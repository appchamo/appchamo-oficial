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
        className="group flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-3.5 py-3 text-left transition-colors hover:bg-muted/40 active:scale-[0.99] dark:bg-card/80"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <Radio
            className="h-[18px] w-[18px] shrink-0 text-primary opacity-90"
            strokeWidth={2}
            aria-hidden
          />
          <span className="text-sm font-semibold text-foreground tracking-tight">Solicitar serviço</span>
        </span>
        <ChevronRight
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </button>
      <OpenServiceRequestModal open={open} onOpenChange={setOpen} />
    </>
  );
};

export default HomeOpenRequestCta;
