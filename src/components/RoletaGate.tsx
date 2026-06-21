/**
 * RoletaGate — orquestra a roleta globalmente.
 * Verifica no servidor (roleta_pending) se o usuário tem giros:
 *   • giro do dia (primeiro login do dia)
 *   • giros de pagamento (1 por compra confirmada)
 * e abre a Roleta automaticamente, processando uma fila (login primeiro,
 * depois cada compra). "Deixar pra depois" suprime até a próxima sessão.
 *
 * IMPORTANTE: só dispara para usuário com CADASTRO COMPLETO e FORA das telas
 * de auth/cadastro. No login/cadastro com Google/Apple o Supabase cria sessão
 * antes de o cadastro terminar — sem este guard, a roleta abria por cima do
 * formulário de signup.
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { isProfileSignupComplete } from "@/lib/profileSignupComplete";
import type { RoletaTrigger, RoletaPending } from "@/lib/roleta";

const Roleta = lazy(() => import("@/components/Roleta"));

const DISMISS_KEY = "roleta_dismissed_session";

/** Rotas onde a roleta NUNCA pode aparecer (auth, cadastro, admin, fluxos). */
function isBlockedPath(path: string): boolean {
  if (path === "/") return true; // landing/redirect
  const prefixes = [
    "/login", "/signup", "/complete-signup", "/reset-password", "/oauth-callback",
    "/post-login", "/auth", "/admin", "/suporte-desk", "/signup-pro", "/qr-auth",
    "/checkout", "/c/", "/hard-reload", "/exclusao-de-conta", "/privacy", "/terms-of-use",
  ];
  return prefixes.some((p) => path === p || path.startsWith(p));
}

function signupInProgress(): boolean {
  try { return localStorage.getItem("signup_in_progress") === "true"; } catch { return false; }
}

/** Tutorial de onboarding concluído? A roleta só abre depois dele (pra não empilhar modal). */
function onboardingDone(): boolean {
  try { return localStorage.getItem("chamo_onboarding_done") === "1"; } catch { return true; }
}

export default function RoletaGate() {
  const { user, profile, loading } = useAuth();
  const location = useLocation();
  const [queue, setQueue] = useState<RoletaTrigger[]>([]);
  const [idx, setIdx] = useState(0);
  const [open, setOpen] = useState(false);
  const busyRef = useRef(false);

  const email = (user?.email || "").toLowerCase().trim();
  const isStaff = email === "admin@appchamo.com" || email === "suporte@appchamo.com";

  // Elegível só quando: logado, não-staff, cadastro completo, fora de rota bloqueada,
  // e não está no meio de um cadastro.
  const eligible =
    !!user &&
    !isStaff &&
    !loading &&
    !!profile &&
    isProfileSignupComplete(profile) &&
    !signupInProgress() &&
    !isBlockedPath(location.pathname);

  const isDismissed = () => {
    try { return sessionStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  };

  const check = useCallback(async () => {
    if (!eligible || open || busyRef.current || isDismissed()) return;
    if (!onboardingDone()) return; // espera o tutorial de boas-vindas fechar primeiro
    busyRef.current = true;
    try {
      const { data, error } = await supabase.rpc("roleta_pending" as any);
      if (error || !data) return;
      const p = data as RoletaPending;
      const q: RoletaTrigger[] = [];
      if (p.login) q.push("login");
      for (let i = 0; i < (p.payment || 0); i++) q.push("payment");
      if (q.length > 0) {
        setQueue(q);
        setIdx(0);
        setOpen(true);
      }
    } finally {
      busyRef.current = false;
    }
  }, [eligible, open]);

  // Verifica ao ficar elegível (com pequeno atraso pra não brigar com splash/redirect).
  useEffect(() => {
    if (!eligible) return;
    const t = setTimeout(() => { void check(); }, 1800);
    return () => clearTimeout(t);
  }, [eligible, check]);

  // Verifica quando o app volta ao foco (ex.: usuário volta após pagar).
  useEffect(() => {
    if (!eligible) return;
    const onVis = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [eligible, check]);

  // Quando o tutorial de boas-vindas fecha, espera 2s e aí abre a roleta (um modal de cada vez).
  useEffect(() => {
    const onTutorialDone = () => { setTimeout(() => { void check(); }, 2000); };
    window.addEventListener("chamo-tutorial-dismissed", onTutorialDone);
    return () => window.removeEventListener("chamo-tutorial-dismissed", onTutorialDone);
  }, [check]);

  const next = () => {
    if (idx + 1 < queue.length) {
      setIdx(idx + 1);
    } else {
      setOpen(false);
      setQueue([]);
      setIdx(0);
    }
  };

  const dismiss = () => {
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
    setOpen(false);
    setQueue([]);
    setIdx(0);
  };

  // Some imediatamente se sair de elegibilidade (ex.: navegou pro cadastro com a roleta aberta).
  if (!open || queue.length === 0 || !eligible) return null;
  const trigger = queue[idx];

  return (
    <Suspense fallback={null}>
      <AnimatePresence>
        <Roleta key={`${trigger}-${idx}`} trigger={trigger} onDone={next} onDismiss={dismiss} />
      </AnimatePresence>
    </Suspense>
  );
}
