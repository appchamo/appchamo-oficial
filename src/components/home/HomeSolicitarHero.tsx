import { useState } from "react";
import { Radio } from "lucide-react";
import OpenServiceRequestModal from "./OpenServiceRequestModal";

/**
 * Card grande "Solicite um profissional" (herói da home): ícone central de transmissão,
 * título, subtítulo e botão "Solicitar". Abre o fluxo de pedido aberto.
 */
const HomeSolicitarHero = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex flex-col items-center text-center py-6">
        <div className="relative mb-5">
          <div className="flex h-24 w-24 items-center justify-center rounded-[28px] bg-primary shadow-lg shadow-primary/30">
            <Radio className="h-11 w-11 text-primary-foreground" strokeWidth={2.25} aria-hidden />
          </div>
          <span className="absolute -top-1 -right-1 flex h-5 w-5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex h-5 w-5 rounded-full bg-primary ring-4 ring-background" />
          </span>
        </div>
        <h2 className="text-[28px] leading-tight font-extrabold tracking-tight text-foreground">
          Solicite um profissional
        </h2>
        <p className="mt-2 max-w-xs text-base text-muted-foreground leading-snug">
          Você diz o que precisa e vários profissionais te procuram.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-5 w-full max-w-md rounded-2xl bg-primary py-4 text-lg font-bold text-primary-foreground shadow-md shadow-primary/30 transition-all hover:brightness-105 active:scale-[0.99]"
        >
          Solicitar
        </button>
      </div>
      <OpenServiceRequestModal open={open} onOpenChange={setOpen} />
    </>
  );
};

export default HomeSolicitarHero;
