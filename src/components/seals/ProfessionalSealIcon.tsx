import { cn } from "@/lib/utils";
import { useId } from "react";

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

type Props = {
  variant: string;
  size?: number;
  earned?: boolean;
  className?: string;
};

/** Estrela serrilhada + fitas — mesma família visual; cores e detalhe central mudam por tier. */
function CallsTierMedal({
  uid,
  size,
  earned,
  tier,
}: {
  uid: string;
  size: number;
  earned: boolean;
  tier: "iniciante" | "pro" | "vip" | "business";
}) {
  const themes = {
    iniciante: {
      burst: [`url(#${uid}-brz1)`, `url(#${uid}-brz2)`],
      ribbon: ["#57534e", "#44403c"],
      stroke: "#292524",
      center: "#1c1917",
    },
    pro: {
      burst: [`url(#${uid}-slv1)`, `url(#${uid}-slv2)`],
      ribbon: ["#1e3a5f", "#172554"],
      stroke: "#1e40af",
      center: "#0f172a",
    },
    vip: {
      burst: [`url(#${uid}-vip1)`, `url(#${uid}-vip2)`],
      ribbon: ["#581c87", "#3b0764"],
      stroke: "#7c3aed",
      center: "#2e1065",
    },
    business: {
      burst: [`url(#${uid}-biz1)`, `url(#${uid}-biz2)`],
      ribbon: ["#0f172a", "#020617"],
      stroke: "#ca8a04",
      center: "#020617",
    },
  } as const;
  const t = themes[tier];
  const w = size;
  const h = Math.round(size * 1.18);
  const vb = "0 0 80 94";

  const centerDetail =
    tier === "iniciante" ? (
      <circle cx="40" cy="31" r="5" fill={t.center} opacity={earned ? 1 : 0.45} />
    ) : tier === "pro" ? (
      <g fill={t.center} opacity={earned ? 1 : 0.45}>
        <rect x="33" y="26" width="3.5" height="10" rx="1" />
        <rect x="38.25" y="23" width="3.5" height="16" rx="1" />
        <rect x="43.5" y="26" width="3.5" height="10" rx="1" />
      </g>
    ) : tier === "vip" ? (
      <path
        d="M40 22 L43 30 L51 30.5 L45 35.5 L47.5 44 L40 39 L32.5 44 L35 35.5 L29 30.5 L37 30 Z"
        fill={t.center}
        opacity={earned ? 1 : 0.45}
      />
    ) : (
      <g stroke={t.center} strokeWidth="2" fill="none" opacity={earned ? 1 : 0.45}>
        <rect x="31" y="25" width="18" height="12" rx="1" />
        <line x1="34" y1="29" x2="46" y2="29" />
        <line x1="34" y1="33" x2="42" y2="33" />
      </g>
    );

  return (
    <svg width={w} height={h} viewBox={vb} className="block" fill="none" aria-hidden>
      <defs>
        <linearGradient id={`${uid}-brz1`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#d6d3d1" />
          <stop offset="50%" stopColor="#a8a29e" />
          <stop offset="100%" stopColor="#78716c" />
        </linearGradient>
        <linearGradient id={`${uid}-brz2`} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#e7e5e4" />
          <stop offset="100%" stopColor="#a8a29e" />
        </linearGradient>
        <linearGradient id={`${uid}-slv1`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e0f2fe" />
          <stop offset="45%" stopColor="#7dd3fc" />
          <stop offset="100%" stopColor="#0369a1" />
        </linearGradient>
        <linearGradient id={`${uid}-slv2`} x1="30%" y1="10%" x2="70%" y2="90%">
          <stop offset="0%" stopColor="#f0f9ff" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
        <linearGradient id={`${uid}-vip1`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fae8ff" />
          <stop offset="40%" stopColor="#c084fc" />
          <stop offset="100%" stopColor="#6b21a8" />
        </linearGradient>
        <linearGradient id={`${uid}-vip2`} x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
        <linearGradient id={`${uid}-biz1`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef9c3" />
          <stop offset="35%" stopColor="#eab308" />
          <stop offset="100%" stopColor="#713f12" />
        </linearGradient>
        <linearGradient id={`${uid}-biz2`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fcd34d" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
      </defs>
      <path
        d="M18 78 L26 62 L32 78 L40 64 L48 78 L54 62 L62 78 L58 86 L22 86 Z"
        fill={t.ribbon[0]}
        stroke={t.stroke}
        strokeWidth="0.75"
      />
      <path
        d="M40 6 L44.2 18.5 L57 12 L51.5 24.5 L65 28 L51.8 33.5 L56.5 46 L43 40 L40 54 L37 40 L23.5 46 L28.2 33.5 L15 28 L28.5 24.5 L23 12 L35.8 18.5 Z"
        fill={t.burst[0]}
        stroke={t.stroke}
        strokeWidth="0.55"
      />
      <circle cx="40" cy="31" r="17" fill={t.burst[1]} stroke={t.stroke} strokeWidth="0.65" />
      {centerDetail}
    </svg>
  );
}

/** Escudo com estrela — avaliações. */
function SealRatingSvg({ uid, size, earned }: { uid: string; size: number; earned: boolean }) {
  const w = size;
  const h = Math.round(size * 1.15);
  const o = earned ? 1 : 0.4;
  return (
    <svg width={w} height={h} viewBox="0 0 72 88" className="block" aria-hidden>
      <defs>
        <linearGradient id={`${uid}-sh`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fecdd3" />
          <stop offset="100%" stopColor="#be123c" />
        </linearGradient>
      </defs>
      <path d="M36 4 L52 14 L58 32 L48 48 L36 78 L24 48 L14 32 L20 14 Z" fill={`url(#${uid}-sh)`} stroke="#881337" strokeWidth="1" opacity={o} />
      <path
        d="M36 18 L39.5 28.5 L50.5 29.5 L42 37 L45 48 L36 42.5 L27 48 L30 37 L21.5 29.5 L32.5 28.5 Z"
        fill="#fef08a"
        stroke="#ca8a04"
        strokeWidth="0.6"
        opacity={o}
      />
    </svg>
  );
}

/** Relógio estilizado — tempo de resposta. */
function SealTimeSvg({ uid, size, earned }: { uid: string; size: number; earned: boolean }) {
  const w = size;
  const h = Math.round(size * 1.12);
  const o = earned ? 1 : 0.4;
  return (
    <svg width={w} height={h} viewBox="0 0 72 84" className="block" aria-hidden>
      <defs>
        <linearGradient id={`${uid}-clk`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a5f3fc" />
          <stop offset="100%" stopColor="#0e7490" />
        </linearGradient>
      </defs>
      <circle cx="36" cy="36" r="28" fill={`url(#${uid}-clk)`} stroke="#155e75" strokeWidth="2" opacity={o} />
      {[0, 30, 60, 90, 120, 150].map((deg, i) => {
        const rad = ((deg - 90) * Math.PI) / 180;
        const x1 = 36 + Math.cos(rad) * 22;
        const y1 = 36 + Math.sin(rad) * 22;
        const x2 = 36 + Math.cos(rad) * 26;
        const y2 = 36 + Math.sin(rad) * 26;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#cffafe" strokeWidth="1.5" opacity={o} />;
      })}
      <line x1="36" y1="36" x2="36" y2="18" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" opacity={o} />
      <line x1="36" y1="36" x2="48" y2="42" stroke="#fef3c7" strokeWidth="2" strokeLinecap="round" opacity={o} />
      <circle cx="36" cy="36" r="3.5" fill="#164e63" opacity={o} />
      <rect x="22" y="68" width="28" height="10" rx="2" fill="#134e4a" opacity={o * 0.9} />
    </svg>
  );
}

/** Foguete — primeiro marco de vendas. */
function SealStartSvg({ size, earned }: { size: number; earned: boolean }) {
  const w = size;
  const h = Math.round(size * 1.2);
  const o = earned ? 1 : 0.4;
  return (
    <svg width={w} height={h} viewBox="0 0 64 92" className="block" aria-hidden>
      <path d="M32 4 Q44 20 44 40 L40 52 L24 52 L20 40 Q20 20 32 4 Z" fill="#22c55e" stroke="#14532d" strokeWidth="1.2" opacity={o} />
      <path d="M32 14 Q38 24 38 36 L38 44 L26 44 L26 36 Q26 24 32 14 Z" fill="#86efac" opacity={o * 0.95} />
      <path d="M20 52 L14 68 L24 58 Z" fill="#ef4444" opacity={o} />
      <path d="M44 52 L50 68 L40 58 Z" fill="#ef4444" opacity={o} />
      <ellipse cx="32" cy="72" rx="10" ry="14" fill="#f97316" opacity={o * 0.55} />
      <ellipse cx="32" cy="78" rx="6" ry="10" fill="#fbbf24" opacity={o * 0.45} />
    </svg>
  );
}

/** Lobo geométrico — meta alta de vendas. */
function SealLoboSvg({ size, earned }: { size: number; earned: boolean }) {
  const w = size;
  const h = Math.round(size * 1.1);
  const o = earned ? 1 : 0.4;
  return (
    <svg width={w} height={h} viewBox="0 0 72 80" className="block" aria-hidden>
      <circle cx="36" cy="38" r="32" fill="#1e293b" stroke="#64748b" strokeWidth="2" opacity={o} />
      <path
        d="M22 32 L28 18 L36 26 L44 18 L50 32 L52 44 L44 52 L36 48 L28 52 L20 44 Z"
        fill="#cbd5e1"
        stroke="#475569"
        strokeWidth="1"
        opacity={o}
      />
      <circle cx="28" cy="36" r="3" fill="#0f172a" opacity={o} />
      <circle cx="44" cy="36" r="3" fill="#0f172a" opacity={o} />
      <path d="M32 42 Q36 48 40 42" stroke="#0f172a" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity={o} />
      <path d="M36 50 L34 58 L38 58 Z" fill="#94a3b8" opacity={o} />
    </svg>
  );
}

/** Coroa de louros — selo extra / lenda. */
function SealStarSvg({ uid, size, earned }: { uid: string; size: number; earned: boolean }) {
  const w = size;
  const h = Math.round(size * 1.12);
  const o = earned ? 1 : 0.4;
  return (
    <svg width={w} height={h} viewBox="0 0 80 88" className="block" aria-hidden>
      <defs>
        <linearGradient id={`${uid}-lr`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#15803d" />
          <stop offset="100%" stopColor="#4ade80" />
        </linearGradient>
      </defs>
      <path
        d="M40 20 C20 20 8 36 8 52 C8 62 14 70 22 74 L18 82 L28 78 C32 80 36 80 40 80 C44 80 48 80 52 78 L62 82 L58 74 C66 70 72 62 72 52 C72 36 60 20 40 20 Z"
        fill={`url(#${uid}-lr)`}
        stroke="#14532d"
        strokeWidth="1"
        opacity={o}
      />
      <path
        d="M40 32 L44 44 L56 44 L46 52 L50 64 L40 56 L30 64 L34 52 L24 44 L36 44 Z"
        fill="#fef08a"
        stroke="#ca8a04"
        strokeWidth="0.8"
        opacity={o}
      />
    </svg>
  );
}

/** Selo Chamô — formato exclusivo: hex duplo, chama e gemas. */
function SealChamoSvg({ uid, size, earned }: { uid: string; size: number; earned: boolean }) {
  const w = Math.round(size * 1.15);
  const h = Math.round(size * 1.28);
  const o = earned ? 1 : 0.38;
  return (
    <svg width={w} height={h} viewBox="0 0 92 104" className="block" aria-hidden>
      <defs>
        <linearGradient id={`${uid}-ch1`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f472b6" />
          <stop offset="35%" stopColor="#fbbf24" />
          <stop offset="70%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
        <linearGradient id={`${uid}-ch2`} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#fffbeb" />
          <stop offset="50%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
        <filter id={`${uid}-glow`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {earned && (
        <polygon
          points="46,2 88,26 88,62 46,86 4,62 4,26"
          fill="none"
          stroke="#fbbf24"
          strokeWidth="1.5"
          opacity="0.85"
          filter={`url(#${uid}-glow)`}
        />
      )}
      <polygon
        points="46,8 82,29 82,59 46,80 10,59 10,29"
        fill={`url(#${uid}-ch1)`}
        stroke="#831843"
        strokeWidth="1.2"
        opacity={o}
      />
      <polygon
        points="46,22 68,35 68,53 46,66 24,53 24,35"
        fill={`url(#${uid}-ch2)`}
        stroke="#78350f"
        strokeWidth="0.9"
        opacity={o}
      />
      <path
        d="M46 28 Q52 38 46 48 Q40 38 46 28 M46 36 Q50 42 46 48 Q42 42 46 36"
        fill="#fef08a"
        stroke="#ea580c"
        strokeWidth="0.5"
        opacity={o}
      />
      <circle cx="32" cy="44" r="3" fill="#38bdf8" opacity={o} />
      <circle cx="60" cy="44" r="3" fill="#f472b6" opacity={o} />
      <path d="M38 76 L46 68 L54 76 L50 88 L42 88 Z" fill="#7c3aed" stroke="#c4b5fd" strokeWidth="0.6" opacity={o} />
    </svg>
  );
}

function SealFallback({ uid, size, earned }: { uid: string; size: number; earned: boolean }) {
  return <CallsTierMedal uid={uid} size={size} earned={earned} tier="business" />;
}

/**
 * Selos com silhuetas bem distintas; os quatro primeiros (chamadas) compartilham a medalha serrilhada com paletas diferentes.
 * Chamô usa hexágono, gradiente multicolor e contorno luminoso.
 */
export function ProfessionalSealIcon({ variant, size = 52, earned = true, className }: Props) {
  const rid = useId().replace(/:/g, "");
  const isChamo = variant === "seal_chamo";

  const body = (() => {
    switch (variant) {
      case "seal_iniciante":
        return <CallsTierMedal uid={rid} size={size} earned={earned} tier="iniciante" />;
      case "seal_pro":
        return <CallsTierMedal uid={rid} size={size} earned={earned} tier="pro" />;
      case "seal_vip":
        return <CallsTierMedal uid={rid} size={size} earned={earned} tier="vip" />;
      case "seal_business":
        return <CallsTierMedal uid={rid} size={size} earned={earned} tier="business" />;
      case "seal_rating":
        return <SealRatingSvg uid={rid} size={size} earned={earned} />;
      case "seal_time":
        return <SealTimeSvg uid={rid} size={size} earned={earned} />;
      case "seal_start":
        return <SealStartSvg size={size} earned={earned} />;
      case "seal_lobo":
        return <SealLoboSvg size={size} earned={earned} />;
      case "seal_chamo":
        return <SealChamoSvg uid={rid} size={size} earned={earned} />;
      case "seal_star":
        return <SealStarSvg uid={rid} size={size} earned={earned} />;
      default:
        return <SealFallback uid={rid} size={size} earned={earned} />;
    }
  })();

  return (
    <div
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center select-none",
        !earned && "grayscale-[0.2]",
        isChamo && earned && "drop-shadow-[0_0_18px_rgba(244,114,182,0.45)] scale-[1.08]",
        className
      )}
      aria-hidden
    >
      {body}
    </div>
  );
}
