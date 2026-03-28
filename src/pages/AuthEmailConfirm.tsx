import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getPublicAppBaseUrl } from "@/lib/publicAppUrl";

/**
 * Aberta no Safari/Chrome após tocar no link do e-mail (cadastro no app).
 * Redireciona para o esquema nativo com os mesmos query/hash do Supabase; se o app não abrir, cai no /login na web.
 */
export default function AuthEmailConfirm() {
  const [hint, setHint] = useState("Abrindo o Chamô…");

  useEffect(() => {
    const search = window.location.search || "";
    const hash = window.location.hash || "";
    if (!search && !hash) {
      setHint("Link inválido ou expirado. Abra o app e faça login.");
      return;
    }

    const appTarget = `com.chamo.app://auth/email-confirm${search}${hash}`;
    const webLogin = `${getPublicAppBaseUrl().replace(/\/$/, "")}/login${search}${hash}`;

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
      if (hidden) return;
      setHint("Redirecionando para entrar no navegador…");
      window.location.replace(webLogin);
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
