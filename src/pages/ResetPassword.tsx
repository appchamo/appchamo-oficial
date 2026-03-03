import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

/** Lê parâmetros do hash (#key=val&...) ou da query (?key=val&...). */
function getParam(name: string, url?: string): string | null {
  const u = url || (typeof window !== "undefined" ? window.location.href : "");
  const regex = new RegExp(`[#?&]${name}=([^&#]*)`);
  const m = regex.exec(u);
  return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : null;
}

const ResetPassword = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [linkInvalid, setLinkInvalid] = useState(false);

  useEffect(() => {
    const access_token = getParam("access_token");
    const refresh_token = getParam("refresh_token");
    const type = getParam("type");
    const isRecovery = type === "recovery";

    const establishSession = async () => {
      if (access_token && refresh_token && isRecovery) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (error) {
          console.error("Erro ao estabelecer sessão de recovery:", error);
          setLinkInvalid(true);
          return;
        }
        // Limpa o hash da URL para não reenviar os tokens
        if (window.history.replaceState) {
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
        }
        setReady(true);
        return;
      }
      if (isRecovery && (!access_token || !refresh_token)) {
        setLinkInvalid(true);
        return;
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setLinkInvalid(false);
        setReady(true);
      }
    });

    establishSession();

    const timeout = setTimeout(() => {
      if (!ready) setLinkInvalid(true);
    }, 6000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: "A senha deve ter pelo menos 6 caracteres.", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "As senhas não conferem.", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast({ title: "Erro ao redefinir senha", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Senha alterada com sucesso!" });
      await supabase.auth.signOut();
      navigate("/login");
    }
    setLoading(false);
  };

  if (!ready) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-extrabold text-gradient mb-3">Chamô</h1>
          {linkInvalid ? (
            <>
              <p className="text-sm text-muted-foreground mb-4">Link inválido ou expirado. Solicite um novo e-mail de recuperação.</p>
              <Link to="/login" className="text-sm font-medium text-primary hover:underline">Voltar ao login</Link>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Verificando link de recuperação...</p>
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mt-4" />
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-gradient mb-2">Chamô</h1>
          <p className="text-sm text-muted-foreground">Defina sua nova senha</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card border rounded-2xl p-6 shadow-card space-y-4">
          <PasswordInput label="Nova senha" value={password} onChange={setPassword} placeholder="••••••••" autoComplete="new-password" />
          <PasswordInput label="Confirmar nova senha" value={confirm} onChange={setConfirm} placeholder="••••••••" autoComplete="new-password" />
          <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50">
            {loading ? "Salvando..." : "Salvar nova senha"} <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};

export default ResetPassword;
