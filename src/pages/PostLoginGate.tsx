import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Tela intermediária pós-login (Apple/Google/E-mail).
 * Objetivo: segurar a navegação para /home até o usuário tocar em "Continuar",
 * e dar tempo do Supabase (sessão/token) estabilizar no iOS após OAuth.
 */
export default function PostLoginGate() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [warmingUp, setWarmingUp] = useState(true);

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
    if (!session?.user) return;
    let cancelled = false;
    (async () => {
      try {
        // "Warm up" do auth: garante sessão e, se necessário, refresh
        const { data: { session: s } } = await supabase.auth.getSession();
        if (!s?.access_token) {
          await supabase.auth.refreshSession().catch(() => {});
        }
        // Pequeno delay para o PostgREST do iOS estabilizar headers após OAuth
        await new Promise((r) => setTimeout(r, 800));
      } finally {
        if (!cancelled) {
          setWarmingUp(false);
          setOpen(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [session?.user]);

  const goHome = () => {
    try {
      sessionStorage.setItem("chamo_oauth_just_landed", "1");
      localStorage.setItem("chamo_oauth_just_landed", "1");
    } catch (_) {}
    navigate("/home", { replace: true });
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {warmingUp && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            Preparando sua conta…
          </div>
        )}

        <Dialog open={open} onOpenChange={() => {}}>
          <DialogContent
            className="max-w-sm text-center"
            onPointerDownOutside={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle className="text-center">Seja bem-vindo, {firstName}!</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground py-2">
              Vamos carregar sua Home com tudo certinho.
            </p>
            <button
              type="button"
              onClick={goHome}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              Continuar
            </button>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

