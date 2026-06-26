// Monta-se dentro do Router. Registra uso do usuário logado:
//  - session_start (1x por sessão)
//  - page_view (a cada troca de rota, sem repetir a mesma seguidas vezes)
//  - heartbeat (a cada 60s com a aba visível) -> usado para estimar minutos
//  - error (window.onerror / unhandledrejection) -> "bugs"
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { setAnalyticsUser, trackAppEvent } from "@/lib/appAnalytics";

const AnalyticsTracker = () => {
  const { user } = useAuth();
  const location = useLocation();
  const lastPathRef = useRef<string>("");
  const sessionStartedRef = useRef<string | null>(null);
  const lastErrorRef = useRef<number>(0);

  const uid = user?.id ?? null;

  // Mantém o usuário atual no módulo de analytics
  useEffect(() => {
    setAnalyticsUser(uid);
  }, [uid]);

  // session_start (uma vez por usuário logado)
  useEffect(() => {
    if (!uid) return;
    if (sessionStartedRef.current === uid) return;
    sessionStartedRef.current = uid;
    void trackAppEvent("session_start", { path: location.pathname });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // page_view a cada troca de rota
  useEffect(() => {
    if (!uid) return;
    const p = location.pathname;
    if (p === lastPathRef.current) return;
    lastPathRef.current = p;
    void trackAppEvent("page_view", { path: p });
  }, [uid, location.pathname]);

  // heartbeat 60s (só com a aba visível) -> minutos navegados
  useEffect(() => {
    if (!uid) return;
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void trackAppEvent("heartbeat", { path: location.pathname });
      }
    };
    const id = window.setInterval(tick, 60000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // erros do app ("bugs"), com throttle de 5s
  useEffect(() => {
    if (!uid) return;
    const report = (label: string) => {
      const now = Date.now();
      if (now - lastErrorRef.current < 5000) return;
      lastErrorRef.current = now;
      void trackAppEvent("error", { path: location.pathname, label: label.slice(0, 300) });
    };
    const onErr = (e: ErrorEvent) => report(e.message || "Erro desconhecido");
    const onRej = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      report(typeof r === "string" ? r : (r?.message || "Promessa rejeitada"));
    };
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => {
      window.removeEventListener("error", onErr);
      window.removeEventListener("unhandledrejection", onRej);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  return null;
};

export default AnalyticsTracker;
