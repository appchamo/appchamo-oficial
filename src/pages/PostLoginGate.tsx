import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase, hardClearNativeAuthSession } from "@/integrations/supabase/client";

export default function PostLoginGate() {
  const navigate = useNavigate();
  const { session, profile, loading } = useAuth();
  const [checking, setChecking] = useState(true);

  const firstName = useMemo(() => {
    const full = (session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name) as string | undefined;
    return full?.trim().split(/\s+/)[0] || "bem-vindo(a)";
  }, [session?.user?.user_metadata]);

  useEffect(() => {
    // Se não está logado, não deve ficar nessa tela
    if (!loading && !session?.user) {
      navigate("/login", { replace: true });
      return;
    }
  }, [loading, session?.user, navigate]);

  useEffect(() => {
    if (loading) return;
    if (!session?.user) return;

    const userId = session.user.id;

    // Enquanto o perfil está carregando, faz retry curto (corrida pós-OAuth) antes de assumir travamento.
    if (!profile) {
      setChecking(true);

      let cancelled = false;
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

      const run = async () => {
        // tenta por ~6s no total; normalmente o trigger insere o profile quase imediato
        const attempts = [
          { waitBeforeMs: 0, timeoutMs: 1500 },
          { waitBeforeMs: 500, timeoutMs: 2000 },
          { waitBeforeMs: 800, timeoutMs: 2500 },
        ];

        for (const a of attempts) {
          if (cancelled) return;
          if (a.waitBeforeMs) await sleep(a.waitBeforeMs);
          try {
            const { data } = await Promise.race([
              supabase
                .from("profiles")
                .select("user_type")
                .eq("user_id", userId)
                .maybeSingle(),
              new Promise<never>((_, reject) => setTimeout(() => reject(new Error("post_login_profile_timeout")), a.timeoutMs)),
            ]);

            if (cancelled) return;
            const userType = (data as any)?.user_type as string | undefined;
            if (userType) {
              setChecking(false);
              navigate("/home", { replace: true });
              return;
            }
          } catch (_) {
            // segue tentando
          }
        }

        if (cancelled) return;
        // Se ainda não apareceu profile, provavelmente travou o storage/token no iOS.
        // Faz hard-clear e joga pro signup como fallback.
        try {
          await hardClearNativeAuthSession().catch(() => {});
          await supabase.auth.signOut().catch(() => {});
        } catch (_) {}
        setChecking(false);
        navigate("/signup", { replace: true });
      };

      run();
      return () => {
        cancelled = true;
      };
    }

    // Perfil carregado → Home
    setChecking(false);
    navigate("/home", { replace: true });
  }, [loading, session?.user, profile, navigate]);

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          {checking ? "Verificando seu cadastro…" : "Redirecionando…"}
        </div>
      </div>
    </div>
  );
}

