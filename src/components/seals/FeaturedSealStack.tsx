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

/**
 * Home — destaque: 1 selo; 2 selos; 3 selos; 4+ = 1 grande + 2 atrás + "+N".
 * `seals` já ordenados: o mais relevante primeiro ([0]).
 */
export function FeaturedSealStack({ seals, className }: { seals: FeaturedSealItem[]; className?: string }) {
  const n = seals.length;
  if (n === 0) return null;

  if (n === 1) {
    return (
      <div className={cn("flex items-center justify-center", className)} aria-hidden>
        <ProfessionalSealIcon variant={seals[0].icon_variant} size={50} earned />
      </div>
    );
  }

  if (n === 2) {
    return (
      <div className={cn("relative flex items-center justify-center h-[52px] w-[88px]", className)} aria-hidden>
        <div className="absolute left-1 top-1/2 -translate-y-1/2 z-[1] scale-[0.82] opacity-95">
          <ProfessionalSealIcon variant={seals[1].icon_variant} size={44} earned />
        </div>
        <div className="relative z-[2] translate-x-3">
          <ProfessionalSealIcon variant={seals[0].icon_variant} size={48} earned />
        </div>
      </div>
    );
  }

  if (n === 3) {
    return (
      <div className={cn("relative flex items-center justify-center h-[52px] w-[100px]", className)} aria-hidden>
        <div className="absolute left-0 top-1/2 -translate-y-1/2 z-[1] scale-[0.72] opacity-90 -rotate-6">
          <ProfessionalSealIcon variant={seals[2].icon_variant} size={40} earned />
        </div>
        <div className="absolute left-5 top-1/2 -translate-y-1/2 z-[2] scale-[0.78] opacity-95 rotate-3">
          <ProfessionalSealIcon variant={seals[1].icon_variant} size={42} earned />
        </div>
        <div className="relative z-[3] translate-x-5">
          <ProfessionalSealIcon variant={seals[0].icon_variant} size={46} earned />
        </div>
      </div>
    );
  }

  const extra = n - 3;
  return (
    <div className={cn("relative flex items-center justify-center h-[56px] w-[108px]", className)} aria-hidden>
      <div className="absolute left-0 top-1/2 -translate-y-1/2 z-[1] scale-[0.68] opacity-88 -rotate-8 translate-x-0">
        <ProfessionalSealIcon variant={seals[2].icon_variant} size={42} earned />
      </div>
      <div className="absolute left-4 top-1/2 -translate-y-1/2 z-[2] scale-[0.74] opacity-92 rotate-4 translate-x-0">
        <ProfessionalSealIcon variant={seals[1].icon_variant} size={44} earned />
      </div>
      <div className="relative z-[3] translate-x-6">
        <ProfessionalSealIcon variant={seals[0].icon_variant} size={54} earned />
      </div>
      <div className="absolute -right-0 bottom-0 z-[4] min-w-[1.5rem] rounded-full bg-primary px-1.5 py-0.5 text-center text-[10px] font-extrabold leading-none text-primary-foreground shadow-md ring-2 ring-card">
        +{extra}
      </div>
    </div>
  );
}
