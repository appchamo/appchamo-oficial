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

/**
 * Há outro modal (Radix Dialog/AlertDialog) aberto? Se sim, a roleta NÃO pode
 * abrir por cima: o Radix trava os cliques fora do seu conteúdo, então a roleta
 * ficaria visível mas sem clique (bug dos "2 modais empilhados").
 */
function anyModalOpen(): boolean {
  try {
    return !!document.querySelector(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
    );
  } catch { return false; }
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
    // Não abre por cima de outro modal (termos, etc.). Re-tenta em 4s até liberar.
    if (anyModalOpen()) { setTimeout(() => { void check(); }, 4000); return; }
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

  // Abre a roleta 3s DEPOIS que a Home sinaliza que carregou 100% (evento disparado pela Home).
  useEffect(() => {
    const onHomeReady = () => { setTimeout(() => { void check(); }, 3000); };
    window.addEventListener("chamo-home-ready", onHomeReady);
    return () => window.removeEventListener("chamo-home-ready", onHomeReady);
  }, [check]);

  // Fallback: se o evento não chegar (ex.: o gate montou depois da Home), verifica ao ficar elegível.
  useEffect(() => {
    if (!eligible) return;
    const t = setTimeout(() => { void check(); }, 5000);
    return () => clearTimeout(t);
  }, [eligible, check]);

  // Verifica quando o app volta ao foco (ex.: usuário volta após pagar).
  useEffect(() => {
    if (!eligible) return;
    const onVis = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [eligible, check]);

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
