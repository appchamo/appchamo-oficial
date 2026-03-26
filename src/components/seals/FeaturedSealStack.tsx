import { ProfessionalSealIcon } from "@/components/seals/ProfessionalSealIcon";
import { cn } from "@/lib/utils";

export type FeaturedSealItem = { icon_variant: string };

/** Maior destaque: selos especiais primeiro, depois maior sort_order. */
export function sortPublicSealsForDisplay<T extends { sort_order?: number | null; is_special?: boolean | null }>(
  rows: T[]
): T[] {
  return [...rows].sort((a, b) => {
    const as = a.is_special ? 1 : 0;
    const bs = b.is_special ? 1 : 0;
    if (as !== bs) return bs - as;
    return (b.sort_order ?? 0) - (a.sort_order ?? 0);
  });
}

type Placement = "card" | "avatar";

/**
 * Home — destaque: 1 selo; 2 selos; 3 selos; 4+ = 1 grande + 2 atrás + "+N".
 * `placement="avatar"`: versão menor sobreposta à foto (sem ocupar faixa extra no card).
 */
export function FeaturedSealStack({
  seals,
  className,
  placement = "card",
}: {
  seals: FeaturedSealItem[];
  className?: string;
  placement?: Placement;
}) {
  const n = seals.length;
  if (n === 0) return null;

  const a = placement === "avatar";

  if (n === 1) {
    return (
      <div className={cn("flex items-center justify-center pointer-events-none", className)} aria-hidden>
        <ProfessionalSealIcon variant={seals[0].icon_variant} size={a ? 30 : 50} earned />
      </div>
    );
  }

  if (n === 2) {
    return (
      <div
        className={cn(
          "relative flex items-center justify-center pointer-events-none",
          a ? "h-[34px] w-[58px]" : "h-[52px] w-[88px]",
          className
        )}
        aria-hidden
      >
        <div
          className={cn(
            "absolute top-1/2 -translate-y-1/2 z-[1] opacity-95",
            a ? "left-0 scale-[0.78]" : "left-1 scale-[0.82]"
          )}
        >
          <ProfessionalSealIcon variant={seals[1].icon_variant} size={a ? 22 : 44} earned />
        </div>
        <div className={cn("relative z-[2]", a ? "translate-x-2.5" : "translate-x-3")}>
          <ProfessionalSealIcon variant={seals[0].icon_variant} size={a ? 26 : 48} earned />
        </div>
      </div>
    );
  }

  if (n === 3) {
    return (
      <div
        className={cn(
          "relative flex items-center justify-center pointer-events-none",
          a ? "h-[36px] w-[64px]" : "h-[52px] w-[100px]",
          className
        )}
        aria-hidden
      >
        <div
          className={cn(
            "absolute left-0 top-1/2 -translate-y-1/2 z-[1] opacity-90 -rotate-6",
            a ? "scale-[0.65]" : "scale-[0.72]"
          )}
        >
          <ProfessionalSealIcon variant={seals[2].icon_variant} size={a ? 18 : 40} earned />
        </div>
        <div
          className={cn(
            "absolute top-1/2 -translate-y-1/2 z-[2] opacity-95 rotate-3",
            a ? "left-3 scale-[0.7]" : "left-5 scale-[0.78]"
          )}
        >
          <ProfessionalSealIcon variant={seals[1].icon_variant} size={a ? 20 : 42} earned />
        </div>
        <div className={cn("relative z-[3]", a ? "translate-x-4" : "translate-x-5")}>
          <ProfessionalSealIcon variant={seals[0].icon_variant} size={a ? 24 : 46} earned />
        </div>
      </div>
    );
  }

  const extra = n - 3;
  return (
    <div
      className={cn(
        "relative flex items-center justify-center pointer-events-none",
        a ? "h-[38px] w-[70px]" : "h-[56px] w-[108px]",
        className
      )}
      aria-hidden
    >
      <div
        className={cn(
          "absolute left-0 top-1/2 -translate-y-1/2 z-[1] opacity-88 -rotate-8",
          a ? "scale-[0.6]" : "scale-[0.68]"
        )}
      >
        <ProfessionalSealIcon variant={seals[2].icon_variant} size={a ? 17 : 42} earned />
      </div>
      <div
        className={cn(
          "absolute top-1/2 -translate-y-1/2 z-[2] opacity-92 rotate-4",
          a ? "left-2.5 scale-[0.66]" : "left-4 scale-[0.74]"
        )}
      >
        <ProfessionalSealIcon variant={seals[1].icon_variant} size={a ? 19 : 44} earned />
      </div>
      <div className={cn("relative z-[3]", a ? "translate-x-5" : "translate-x-6")}>
        <ProfessionalSealIcon variant={seals[0].icon_variant} size={a ? 28 : 54} earned />
      </div>
      <div
        className={cn(
          "absolute z-[4] min-w-[1.25rem] rounded-full bg-primary px-1 py-0.5 text-center font-extrabold leading-none text-primary-foreground shadow-md ring-2 ring-card",
          a ? "-right-0.5 bottom-0 text-[7px]" : "-right-0 bottom-0 text-[10px]"
        )}
      >
        +{extra}
      </div>
    </div>
  );
}
