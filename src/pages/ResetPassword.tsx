import { useState, useEffect, useRef } from "react";
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
  const resolvedRef = useRef(false);

  const markReady = () => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    setLinkInvalid(false);
    setReady(true);
  };

  const markInvalid = (reason?: string) => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    console.warn("[ResetPassword] link inválido:", reason);
    setLinkInvalid(true);
  };

  useEffect(() => {
    const code         = getParam("code");          // PKCE: ?code=XXX
    const accessToken  = getParam("access_token");  // Implicit: #access_token=XXX
    const refreshToken = getParam("refresh_token");
    const type         = getParam("type");

    // ── 1. Listener de evento (backup para casos em que o SDK já disparou o evento) ──
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) {
        markReady();
      }
    });

    // ── 2. PKCE flow: ?code=XXX  ──────────────────────────────────────────────────
    // detectSessionInUrl pode já ter processado, mas chamamos explicitamente para
    // garantir — se duplicado o SDK lida internamente sem problema.
    if (code) {
      supabase.auth.exchangeCodeForSession(code)
        .then(({ data, error }) => {
          if (error) {
            markInvalid(`exchangeCodeForSession: ${error.message}`);
          } else if (data?.session) {
            // Limpa o code da URL por segurança
            if (window.history.replaceState) {
              window.history.replaceState(null, "", window.location.pathname);
            }
            markReady();
          } else {
            markInvalid("exchangeCodeForSession: sem sessão");
          }
        })
        .catch((err) => markInvalid(String(err)));
      // Timeout generoso para troca de código
      const t = setTimeout(() => markInvalid("timeout (PKCE)"), 20000);
      return () => { subscription.unsubscribe(); clearTimeout(t); };
    }

    // ── 3. Implicit flow: #access_token=XXX&type=recovery ────────────────────────
    if (accessToken && refreshToken && type === "recovery") {
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ error }) => {
          if (error) {
            markInvalid(`setSession: ${error.message}`);
          } else {
            if (window.history.replaceState) {
              window.history.replaceState(null, "", window.location.pathname);
            }
            markReady();
          }
        })
        .catch((err) => markInvalid(String(err)));
      const t = setTimeout(() => markInvalid("timeout (implicit)"), 10000);
      return () => { subscription.unsubscribe(); clearTimeout(t); };
    }

    // ── 4. Nenhum parâmetro reconhecido — link inválido ───────────────────────────
    // Dá 3s para o evento PASSWORD_RECOVERY via detectSessionInUrl antes de desistir
    const t = setTimeout(() => markInvalid("sem parâmetros de recovery"), 3000);
    return () => { subscription.unsubscribe(); clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <div className="text-center max-w-xs">
          <h1 className="text-2xl font-extrabold text-gradient mb-3">Chamô</h1>
          {linkInvalid ? (
            <>
              <p className="text-sm text-muted-foreground mb-2">Link inválido ou expirado.</p>
              <p className="text-xs text-muted-foreground mb-5">
                O link de recuperação tem validade de 1 hora e só pode ser usado uma vez.
                Solicite um novo.
              </p>
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                Solicitar novo link
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Verificando link de recuperação…</p>
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
          <PasswordInput
            label="Nova senha"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            autoComplete="new-password"
          />
          <PasswordInput
            label="Confirmar nova senha"
            value={confirm}
            onChange={setConfirm}
            placeholder="••••••••"
            autoComplete="new-password"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? "Salvando…" : "Salvar nova senha"} <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground mt-6">
          <Link to="/login" className="text-primary hover:underline">Voltar ao login</Link>
        </p>
      </div>
    </div>
  );
};

export default ResetPassword;
