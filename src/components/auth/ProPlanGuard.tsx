import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

/**
 * Trava de plano pago (obrigatoria para profissionais novos).
 * Regra:
 *  - Todo mundo que VIRA profissional a partir do lancamento (CUTOFF) sem plano
 *    pago ativo cai no paywall (/assinar) e nao usa o app ate assinar. Isso inclui
 *    cliente antigo que vira profissional agora (conta antiga, mas pro novo).
 *  - Grandfather: quem JA ERA profissional antes do CUTOFF (mesmo no gratis) NAO e forcado.
 *  - Plano pago vencido/suspenso -> cai no paywall em qualquer data (para regularizar).
 * O "vira profissional" e medido pela data em que a linha em `professionals` foi criada.
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

    if (checkedForRef.current === profile.user_id) return;

    (async () => {
      try {
        const [{ data: sub, error: subErr }, { data: pro, error: proErr }] = await Promise.all([
          supabase.from("subscriptions").select("plan_id, status").eq("user_id", profile.user_id).maybeSingle(),
          supabase.from("professionals").select("created_at").eq("user_id", profile.user_id).maybeSingle(),
        ]);
        // Falha de rede: não marca como checado pra reavaliar depois (evita pro "escapar" do paywall).
        if (subErr || proErr) return;

        const status = String((sub as any)?.status || "").toLowerCase();
        const planId = String((sub as any)?.plan_id || "");
        const isPaidPlan = planId !== "" && planId !== "free";
        const isActive = status === "active";
        const hasActivePaid = isPaidPlan && isActive;

        // "Virou profissional antes do lancamento" = grandfather (nao forca).
        const proCreated = (pro as any)?.created_at ? new Date((pro as any).created_at).getTime() : null;
        const becameProBeforeCutoff = proCreated !== null && proCreated < CUTOFF;

        // Bloqueia (manda pro paywall) se NAO tem plano pago ativo E:
        //  - o plano pago esta vencido/suspenso (regularizar) -> qualquer data, ou
        //  - virou profissional a partir do lancamento (pro novo, inclui cliente antigo que virou pro).
        const suspendedPaid = isPaidPlan && !isActive;
        const gate = !hasActivePaid && (suspendedPaid || !becameProBeforeCutoff);
        checkedForRef.current = profile.user_id;
        setBlocked(gate);
      } catch {
        // erro inesperado: não marca checado (reavalia depois)
      }
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
