import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getPublicAppBaseUrl } from "@/lib/publicAppUrl";

/**
 * Página-ponte do RESET de senha (redirectTo do resetPasswordForEmail).
 * Aberta no Safari/Chrome após tocar no link do e-mail. Tenta abrir o app nativo
 * (com.chamo.app://auth/reset...) — importante no PKCE, pois o code_verifier está
 * no webview do app. Se o app não abrir (não instalado), cai na versão web /reset-password.
 */
export default function AuthReset() {
  const [hint, setHint] = useState("Abrindo o Chamô…");

  useEffect(() => {
    const search = window.location.search || "";
    const hash = window.location.hash || "";
    if (!search && !hash) {
      setHint("Link inválido ou expirado. Solicite um novo no app.");
      return;
    }

    const appTarget = `com.chamo.app://auth/reset${search}${hash}`;
    const webReset = `${getPublicAppBaseUrl().replace(/\/$/, "")}/reset-password${search}${hash}`;

    let hidden = false;
    const onVis = () => {
      if (document.visibilityState === "hidden") hidden = true;
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onVis);

    try {
      window.location.replace(appTarget);
    } catch {
      void 0;
    }

    const t = window.setTimeout(() => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onVis);
      if (hidden) return; // o app abriu (aba ficou oculta) — não segue pra web
      setHint("Abrindo no navegador…");
      window.location.replace(webReset);
    }, 1600);

    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onVis);
    };
  }, []);

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background px-6 text-center">
      <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
      <p className="text-sm text-muted-foreground max-w-xs">{hint}</p>
    </div>
  );
}
