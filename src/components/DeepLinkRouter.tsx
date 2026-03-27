import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

/**
 * Universal Links / App Links abrem o app nativo, mas o WebView pode ficar em `/` → RedirectLoggedIn manda para /home ou /login.
 * Lê `getLaunchUrl` + `appUrlOpen` e navega para rotas públicas (ex.: /professional/:slug).
 * URLs com `code=` são ignoradas (OAuth — useAuth trata).
 */
function isPublicAppPath(pathname: string): boolean {
  return (
    /^\/(?:professional|pro|agendar)\/[^/?#]+$/i.test(pathname) ||
    /^\/p\/comunidade\/[^/?#]+$/i.test(pathname)
  );
}

function pathFromDeepLink(urlStr: string): string | null {
  if (!urlStr || typeof urlStr !== "string") return null;
  if (urlStr.includes("code=") && /[?&]code=/.test(urlStr.split("#")[0])) return null;

  try {
    let s = urlStr.trim();
    if (s.startsWith("com.chamo.app:")) {
      s = s.replace(/^com\.chamo\.app:\/*/, "https://appchamo.com/");
    }
    const u = new URL(s);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const allowed =
      host === "appchamo.com" ||
      host === "app.chamo.com" ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".vercel.app");
    if (!allowed) return null;
    if (u.pathname.startsWith("/api/")) return null;
    if (!isPublicAppPath(u.pathname)) return null;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return null;
  }
}

export default function DeepLinkRouter() {
  const navigate = useNavigate();
  const launchHandled = useRef(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const go = (path: string) => {
      navigate(path, { replace: true });
    };

    CapacitorApp.getLaunchUrl()
      .then((res) => {
        const path = res?.url ? pathFromDeepLink(res.url) : null;
        if (path && !launchHandled.current) {
          launchHandled.current = true;
          go(path);
        }
      })
      .catch(() => {});

    let listenerHandle: { remove: () => Promise<void> } | undefined;
    void CapacitorApp.addListener("appUrlOpen", ({ url }) => {
      const path = pathFromDeepLink(url);
      if (path) go(path);
    }).then((h) => {
      listenerHandle = h;
    });

    return () => {
      void listenerHandle?.remove();
    };
  }, [navigate]);

  return null;
}
