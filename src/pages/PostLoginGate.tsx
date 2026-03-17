import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export default function PostLoginGate() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
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
    if (!session?.user) return;
    let cancelled = false;
    (async () => {
      try {
        const email = (session.user.email || "").toLowerCase().trim();
        if (!email) {
          navigate("/signup", { replace: true });
          return;
        }

        // Verifica se já existe cadastro com esse e-mail
        const { data: existingByEmail, error } = await supabase
          .from("profiles")
          .select("id")
          .ilike("email", email)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          // Erro raro: volta para login para tentar de novo
          navigate("/login", { replace: true });
          return;
        }

        if (!existingByEmail) {
          // Não existe perfil com esse e-mail → fluxo de cadastro
          navigate("/signup", { replace: true });
          return;
        }

        // Já existe cadastro → Home
        navigate("/home", { replace: true });
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [session?.user]);

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

