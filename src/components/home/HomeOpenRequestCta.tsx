import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Radio, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import OpenServiceRequestModal from "./OpenServiceRequestModal";

/**
 * Ação principal da Home do cliente: publicar um pedido aberto.
 * - Logado → abre o wizard em modal (3 etapas).
 * - Deslogado → leva ao login, pois o wizard exige conta na 1ª etapa.
 */
const HomeOpenRequestCta = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleClick = () => {
    if (!user) {
      navigate("/login");
      return;
    }
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="group flex w-full items-center gap-4 rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/15 via-primary/[0.07] to-transparent px-5 py-4 text-left shadow-sm transition-all hover:border-primary/60 hover:shadow-md active:scale-[0.99]"
      >
        <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/30">
          <Radio className="h-6 w-6" strokeWidth={2.25} aria-hidden />
          <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-primary ring-2 ring-background" />
          </span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[17px] font-bold text-foreground tracking-tight leading-tight">
            Precisa de um serviço?
          </span>
          <span className="mt-1 text-xs text-muted-foreground leading-snug sm:text-[13px]">
            Descreve o que você precisa e os profissionais vêm até você.
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
