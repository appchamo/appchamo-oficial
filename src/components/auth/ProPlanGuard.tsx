import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

/**
 * Trava de plano pago (obrigatoria para profissionais novos).
 * Profissional criado a partir do lancamento (CUTOFF) sem plano pago ativo
 * cai no paywall (/assinar) e nao usa o app ate assinar.
 * Base antiga (inclusive quem esta no plano gratis) NAO e forcada (grandfather).
 */
const CUTOFF = new Date("2026-08-26T00:00:00Z").getTime();

const EXEMPT_PREFIXES = [
  "/assinar",
  "/login",
  "/signup",
  "/reset-password",
  "/auth",
  "/admin",
  "/verificar-whatsapp",
];

const ProPlanGuard = () => {
  const { profile, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [blocked, setBlocked] = useState(false);
  const checkedForRef = useRef<string | null>(null);

  // Descobre uma unica vez por usuario se o profissional novo esta sem plano pago ativo.
  useEffect(() => {
    if (loading || !profile || isAdmin) return;
    if (profile.user_type !== "professional") return; // so profissional (empresa usa outro fluxo)

    const isNew = profile.created_at ? new Date(profile.created_at).getTime() >= CUTOFF : false;

    if (checkedForRef.current === profile.user_id) return;
    checkedForRef.current = profile.user_id;

    (async () => {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("plan_id, status")
        .eq("user_id", profile.user_id)
        .maybeSingle();
      const status = String((sub as any)?.status || "").toLowerCase();
      const planId = String((sub as any)?.plan_id || "");
      const isPaidPlan = planId !== "" && planId !== "free";
      const isActive = status === "active";

      // Bloqueia se:
      //  - tem plano pago mas nao esta ativo (vencido/suspenso) -> qualquer data
      //  - profissional novo (pos-cutoff) sem plano pago ativo -> grandfather nos antigos gratis
      const suspendedPaid = isPaidPlan && !isActive;
      const newWithoutPaid = isNew && !(isPaidPlan && isActive);
      setBlocked(suspendedPaid || newWithoutPaid);
    })();
  }, [loading, profile, isAdmin]);

  useEffect(() => {
    if (!blocked) return;
    const path = location.pathname || "/";
    if (EXEMPT_PREFIXES.some((p) => path.startsWith(p))) return;
    navigate("/assinar", { replace: true });
  }, [blocked, location.pathname, navigate]);

  return null;
};

export default ProPlanGuard;
