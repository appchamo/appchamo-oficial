import { useId } from "react";

/** Maleta de trabalho em vista frontal com leve profundidade (leitura clara em fundo laranja). */
export function JobBriefcase3DIcon({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, "");

  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <defs>
        <linearGradient id={`jb-${uid}-face`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fffef5" />
          <stop offset="45%" stopColor="#fef3c7" />
          <stop offset="100%" stopColor="#fbbf24" />
        </linearGradient>
        <linearGradient id={`jb-${uid}-side`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#92400e" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
        <linearGradient id={`jb-${uid}-lid`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#fde68a" />
        </linearGradient>
      </defs>

      <ellipse cx="24" cy="41.5" rx="14" ry="2.8" fill="#000000" opacity="0.2" />

      {/* Lateral / espessura direita */}
      <path
        d="M35.5 17.5 L39.2 19 L39.2 35.2 L35.5 36.5 L35.5 17.5 Z"
        fill={`url(#jb-${uid}-side)`}
      />
      {/* Base inferior (profundidade) */}
      <path
        d="M9.5 35.5 L35.5 35.5 L39.2 37 L12.8 38.2 Z"
        fill="#78350f"
        fillOpacity="0.55"
      />

      {/* Corpo principal — formato maleta clássica */}
      <path
        d="M9.5 18.5 H35.5 V35.5 H9.5 Z"
        fill={`url(#jb-${uid}-face)`}
        stroke="#b45309"
        strokeWidth="0.35"
        strokeOpacity="0.35"
      />
      <rect x="9.5" y="18.5" width="26" height="8.2" rx="1.2" fill={`url(#jb-${uid}-lid)`} />
      {/* Linha da tampa */}
      <path
        d="M10.2 26.7 H34.8"
        stroke="#b45309"
        strokeWidth="0.9"
        strokeOpacity="0.45"
        strokeLinecap="round"
      />

      {/* Alça em arco (característica de maleta) */}
      <path
        d="M17.5 18.5 V16.5 Q24 11 30.5 16.5 V18.5"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.95"
      />

      {/* Fecho central */}
      <rect x="20.8" y="28.5" width="6.4" height="5.2" rx="1" fill="#ffffff" fillOpacity="0.95" />
      <rect x="22.8" y="30" width="2.4" height="2.2" rx="0.4" fill="#f59e0b" fillOpacity="0.85" />

      {/* Brilho frontal */}
      <path d="M11.5 20 L16 19.2 V22 L11.5 22.8 Z" fill="#ffffff" fillOpacity="0.35" />
    </svg>
  );
}
