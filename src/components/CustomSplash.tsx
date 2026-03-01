import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";

export interface SplashConfig {
  splash_logo_url?: string | null;
  splash_bg_color?: string | null;
  splash_animation?: string | null;
  splash_duration_seconds?: string | null;
}

const ANIMATION_CLASSES: Record<string, string> = {
  fadeIn: "animate-in fade-in duration-700",
  scaleIn: "animate-in zoom-in-50 fade-in duration-600",
  slideUp: "animate-in slide-in-from-bottom-8 fade-in duration-600",
  slideDown: "animate-in slide-in-from-top-8 fade-in duration-600",
  slideLeft: "animate-in slide-in-from-left-8 fade-in duration-600",
  slideRight: "animate-in slide-in-from-right-8 fade-in duration-600",
  zoomIn: "animate-in zoom-in-95 fade-in duration-600",
  bounceIn: "animate-in zoom-in-50 fade-in duration-700",
  flipIn: "animate-in zoom-in-50 fade-in duration-600",
  pulseIn: "animate-in zoom-in-50 fade-in duration-600",
};

const FADE_IN_MS = 500;
const FADE_OUT_MS = 600;

interface CustomSplashProps {
  config: SplashConfig | null;
  onFinish: () => void;
}

export const CustomSplash = ({ config, onFinish }: CustomSplashProps) => {
  const rawDuration = parseFloat(config?.splash_duration_seconds || "2") || 2;
  const durationSec = Math.min(5, Math.max(0.5, rawDuration));
  const isNative = Capacitor.isNativePlatform();
  const durationMs = (isNative ? Math.max(2, durationSec) : durationSec) * 1000;
  const bgColor = config?.splash_bg_color?.trim() || "#f97316";
  const animationKey = config?.splash_animation || "scaleIn";
  const animationClass = ANIMATION_CLASSES[animationKey] || ANIMATION_CLASSES.scaleIn;
  const logoUrl = config?.splash_logo_url?.trim() || null;

  const [visible, setVisible] = useState(false);
  const [logoReady, setLogoReady] = useState(false);
  const [exiting, setExiting] = useState(false);
  const finishedRef = useRef(false);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true));
    });
    return () => cancelAnimationFrame(t);
  }, []);

  // Sem imagem (só texto): anima na hora
  useEffect(() => {
    if (!logoUrl) setLogoReady(true);
  }, [logoUrl]);

  useEffect(() => {
    const mainTimer = setTimeout(() => {
      setExiting(true);
      exitTimerRef.current = setTimeout(() => {
        if (finishedRef.current) return;
        finishedRef.current = true;
        onFinish();
      }, FADE_OUT_MS);
    }, durationMs);
    return () => {
      clearTimeout(mainTimer);
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    };
  }, [durationMs, onFinish]);

  const opacity = !visible ? 0 : exiting ? 0 : 1;

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center transition-opacity"
      style={{
        backgroundColor: bgColor,
        opacity,
        transitionDuration: exiting ? `${FADE_OUT_MS}ms` : `${FADE_IN_MS}ms`,
        transitionTimingFunction: exiting ? "cubic-bezier(0.4, 0, 0.2, 1)" : "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
      }}
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt="Logo"
          className={`max-w-[70%] max-h-[40%] w-auto h-auto object-contain transition-opacity duration-300 ${
            logoReady ? animationClass : "opacity-0"
          }`}
          style={logoReady ? { animationFillMode: "both" } : undefined}
          onLoad={() => setLogoReady(true)}
        />
      ) : (
        <div className={`text-4xl font-extrabold text-white ${logoReady ? animationClass : "opacity-0"}`}>
          Chamô
        </div>
      )}
    </div>
  );
};
