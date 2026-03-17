import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { Loader2 } from "lucide-react";

const TARGET_KEY = "chamo_hard_reload_target";
const DONE_KEY = "chamo_hard_reload_done";

/**
 * Rota "extrema" para iOS pós-OAuth:
 * força uma navegação de página inteira (não SPA) com cache-bust,
 * garantindo que o WebView carregue já com sessão pronta.
 */
export default function HardReload() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    try {
      // Se vier target por query, salva
      const params = new URLSearchParams(location.search || "");
      const targetFromQuery = params.get("to");
      const target = (targetFromQuery && targetFromQuery.startsWith("/")) ? targetFromQuery : (localStorage.getItem(TARGET_KEY) || "/home");
      localStorage.setItem(TARGET_KEY, target);

      // Evita loop: só faz hard reload 1x por sessão de login
      const done = localStorage.getItem(DONE_KEY) === "1";
      if (done) {
        localStorage.removeItem(DONE_KEY);
        localStorage.removeItem(TARGET_KEY);
        navigate(target, { replace: true });
        return;
      }

      localStorage.setItem(DONE_KEY, "1");

      const origin = window.location.origin || "";
      const sep = target.includes("?") ? "&" : "?";
      const bust = `${sep}v=${Date.now()}`;

      // iOS/Android: força navegação full page
      if (Capacitor.isNativePlatform()) {
        window.location.replace(origin + target + bust);
      } else {
        // Web: não precisa hard reload; navega normal
        localStorage.removeItem(DONE_KEY);
        localStorage.removeItem(TARGET_KEY);
        navigate(target, { replace: true });
      }
    } catch (_) {
      // fallback simples
      try { window.location.replace((window.location.origin || "") + "/home"); } catch (_) {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
        Carregando…
      </div>
    </div>
  );
}

