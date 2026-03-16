import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

const APP_SCHEME = "com.chamo.app://oauth";

/**
 * Página ponte para OAuth no Android:
 * Custom Tabs redireciona para /oauth-callback?code=...; esta página redireciona pro app.
 * (No iOS usamos scheme direto no Login, sem passar por aqui.)
 */
const OAuthCallback = () => {
  const [searchParams] = useSearchParams();
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  const deepLink = useMemo(() => {
    if (!code) return null;
    return `${APP_SCHEME}?code=${encodeURIComponent(code)}`;
  }, [code]);

  useEffect(() => {
    if (error) {
      window.location.href = "/login";
      return;
    }
    if (deepLink) {
      window.location.replace(deepLink);
    } else {
      window.location.href = "/login";
    }
  }, [error, deepLink]);

  if (error || !code) return null;

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-6 bg-background px-4">
      <Loader2 className="w-10 h-10 text-primary animate-spin" />
      <p className="text-sm text-muted-foreground text-center">Redirecionando para o app...</p>
      {deepLink && (
        <a
          href={deepLink}
          className="text-primary font-semibold underline text-sm"
        >
          Se o app não abriu, toque aqui
        </a>
      )}
    </div>
  );
};

export default OAuthCallback;
