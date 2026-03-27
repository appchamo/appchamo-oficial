import { useEffect, useRef } from "react";
import { incrementProfessionalAnalytics } from "@/lib/proAnalytics";

/**
 * Quando o elemento fica visível no viewport e depois sai, a próxima vez que entrar conta de novo.
 */
export function useProProfileImpression(targetUserId: string | null | undefined) {
  const ref = useRef<HTMLDivElement | null>(null);
  const wasIntersecting = useRef(false);

  useEffect(() => {
    if (!targetUserId) return;
    const el = ref.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.25) {
          if (!wasIntersecting.current) {
            wasIntersecting.current = true;
            incrementProfessionalAnalytics(targetUserId, "profile_view");
          }
        } else {
          wasIntersecting.current = false;
        }
      },
      { threshold: [0, 0.25, 0.5] },
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [targetUserId]);

  return ref;
}
