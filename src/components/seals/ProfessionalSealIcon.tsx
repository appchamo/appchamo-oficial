import { cn } from "@/lib/utils";
import {
  Award,
  Building2,
  Crown,
  type LucideIcon,
  Rocket,
  Sparkles,
  Star,
  Timer,
  TrendingUp,
  Hash,
  Gem,
} from "lucide-react";

export const SEAL_ICON_VARIANTS = [
  "seal_iniciante",
  "seal_pro",
  "seal_vip",
  "seal_business",
  "seal_rating",
  "seal_time",
  "seal_start",
  "seal_lobo",
  "seal_chamo",
  "seal_star",
  "seal_default",
] as const;

export type SealIconVariant = (typeof SEAL_ICON_VARIANTS)[number];

const VARIANT_CENTER: Record<string, LucideIcon> = {
  seal_iniciante: Hash,
  seal_pro: Rocket,
  seal_vip: Crown,
  seal_business: Building2,
  seal_rating: Star,
  seal_time: Timer,
  seal_start: TrendingUp,
  seal_lobo: Gem,
  seal_chamo: Sparkles,
  seal_star: Award,
  seal_default: Award,
};

type Props = {
  variant: string;
  size?: number;
  earned?: boolean;
  className?: string;
};

/** Selo estilo medalha dourada com ícone central distinto por variante; Chamô com destaque extra. */
export function ProfessionalSealIcon({ variant, size = 52, earned = true, className }: Props) {
  const Icon = VARIANT_CENTER[variant] || VARIANT_CENTER.seal_default;
  const isChamo = variant === "seal_chamo";
  const w = size;
  const h = Math.round(size * 1.18);

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center select-none",
        !earned && "opacity-[0.38] grayscale-[0.35]",
        isChamo &&
          earned &&
          "drop-shadow-[0_0_14px_rgba(234,179,8,0.55)] scale-[1.06]",
        className
      )}
      style={{ width: w, height: h }}
      aria-hidden
    >
      {isChamo && earned && (
        <div
          className="pointer-events-none absolute inset-[-6px] rounded-full border-2 border-amber-400/80 shadow-[0_0_12px_rgba(251,191,36,0.45)]"
          style={{ borderRadius: "50%" }}
        />
      )}
      <svg
        width={w}
        height={h}
        viewBox="0 0 80 94"
        className="absolute inset-0"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="sealGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fde68a" />
            <stop offset="35%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#b45309" />
          </linearGradient>
          <linearGradient id="sealGoldInner" x1="30%" y1="15%" x2="70%" y2="85%">
            <stop offset="0%" stopColor="#fff7d6" />
            <stop offset="100%" stopColor="#eab308" />
          </linearGradient>
          <linearGradient id="ribbonRed" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#7f1d1d" />
            <stop offset="100%" stopColor="#450a0a" />
          </linearGradient>
        </defs>
        <path
          d="M18 78 L26 62 L32 78 L40 64 L48 78 L54 62 L62 78 L58 86 L22 86 Z"
          fill="url(#ribbonRed)"
          stroke="#ca8a04"
          strokeWidth="0.8"
        />
        <path
          d="M40 6 L44.2 18.5 L57 12 L51.5 24.5 L65 28 L51.8 33.5 L56.5 46 L43 40 L40 54 L37 40 L23.5 46 L28.2 33.5 L15 28 L28.5 24.5 L23 12 L35.8 18.5 Z"
          fill="url(#sealGold)"
          stroke="#92400e"
          strokeWidth="0.6"
        />
        <circle cx="40" cy="31" r="17" fill="url(#sealGoldInner)" stroke="#92400e" strokeWidth="0.7" />
      </svg>
      <Icon
        className={cn(
          "relative z-[1] text-amber-950",
          earned ? "opacity-95" : "opacity-50",
          isChamo && earned && "text-amber-900 drop-shadow-sm"
        )}
        strokeWidth={2.2}
        style={{
          width: Math.round(size * 0.34),
          height: Math.round(size * 0.34),
          marginTop: -size * 0.06,
        }}
      />
    </div>
  );
}
