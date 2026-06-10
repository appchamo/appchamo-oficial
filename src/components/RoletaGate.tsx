/**
 * RoletaGate — orquestra a roleta globalmente.
 * Verifica no servidor (roleta_pending) se o usuário tem giros:
 *   • giro do dia (primeiro login do dia)
 *   • giros de pagamento (1 por compra confirmada)
 * e abre a Roleta automaticamente, processando uma fila (login primeiro,
 * depois cada compra). "Deixar pra depois" suprime até a próxima sessão.
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { RoletaTrigger, RoletaPending } from "@/lib/roleta";

const Roleta = lazy(() => import("@/components/Roleta"));

const DISMISS_KEY = "roleta_dismissed_session";

export default function RoletaGate() {
  const { user, profile, loading } = useAuth();
  const [queue, setQueue] = useState<RoletaTrigger[]>([]);
  const [idx, setIdx] = useState(0);
  const [open, setOpen] = useState(false);
  const busyRef = useRef(false);

  const email = (user?.email || "").toLowerCase().trim();
  const isStaff = email === "admin@appchamo.com" || email === "suporte@appchamo.com";

  const isDismissed = () => {
    try { return sessionStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  };

  const check = useCallback(async () => {
    if (!user || isStaff || open || busyRef.current || isDismissed()) return;
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
  }, [user, isStaff, open]);

  // Verifica ao logar (com pequeno atraso pra não brigar com splash/redirect).
  useEffect(() => {
    if (loading || !user || isStaff) return;
    const t = setTimeout(() => { void check(); }, 1800);
    return () => clearTimeout(t);
  }, [loading, user, isStaff, check]);

  // Verifica quando o app volta ao foco (ex.: usuário volta após pagar).
  useEffect(() => {
    if (!user || isStaff) return;
    const onVis = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [user, isStaff, check]);

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

  if (!open || queue.length === 0) return null;
  const trigger = queue[idx];

  return (
    <Suspense fallback={null}>
      <AnimatePresence>
        <Roleta key={`${trigger}-${idx}`} trigger={trigger} onDone={next} onDismiss={dismiss} />
      </AnimatePresence>
    </Suspense>
  );
}
