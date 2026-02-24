import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, ArrowRight, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { translateError } from "@/lib/errorMessages";

type LoginError = "email_not_confirmed" | "invalid_login" | "rate_limit" | "generic";

const getErrorType = (msg: string): LoginError => {
  if (msg.includes("Email not confirmed")) return "email_not_confirmed";
  if (msg.includes("Invalid login")) return "invalid_login";
  if (msg.includes("rate")) return "rate_limit";
  return "generic";
};

const friendlyError = (type: LoginError) => {
  if (type === "invalid_login") return "E-mail ou senha incorretos.";
  if (type === "email_not_confirmed") return "Verifique seu e-mail antes de entrar.";
  if (type === "rate_limit") return "Muitas tentativas. Aguarde um momento.";
  return "Erro ao entrar. Tente novamente.";
};

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<LoginError | null>(null);
  const [resending, setResending] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { toast({ title: "Digite seu e-mail para recuperar a senha." }); return; }
    setForgotLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast({ title: "Erro ao enviar", description: translateError(error.message), variant: "destructive" });
    else toast({ title: "E-mail de recuperação enviado!", description: "Verifique sua caixa de entrada." });
    setForgotLoading(false);
  };

  useEffect(() => {
    supabase.
    from("platform_settings").
    select("value").
    eq("key", "login_bg_url").
    maybeSingle().
    then(({ data }) => {
      if (data?.value) {
        const val = typeof data.value === "string" ? data.value : JSON.stringify(data.value).replace(/^"|"$/g, "");
        if (val) setBgUrl(val);
      }
    });
  }, []);

  const handleResendEmail = async () => {
    if (!email) { toast({ title: "Digite seu e-mail acima." }); return; }
    setResending(true);
    const { error } = await supabase.auth.resend({ type: "signup", email });
    if (error) toast({ title: "Erro ao reenviar", description: translateError(error.message), variant: "destructive" });
    else toast({ title: "E-mail de verificação reenviado!", description: "Verifique sua caixa de entrada." });
    setResending(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorType(null);
    if (!email || !password) {toast({ title: "Preencha todos os campos." });return;}
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const type = getErrorType(error.message);
      setErrorType(type);
      toast({ title: friendlyError(type), variant: "destructive" });
      setLoading(false);
      return;
    }
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    const isAdmin = roles?.some((r: any) =>
      ["super_admin", "finance_admin", "support_admin", "sponsor_admin", "moderator"].includes(r.role)
    );
    if (isAdmin) {
      navigate("/admin");
    } else {
      navigate("/home");
    }
  };

  const handleSocialLogin = async (provider: "google" | "apple") => {
    // ✅ Removida a flag 'signup_in_progress' para garantir que seja apenas login
    localStorage.removeItem("signup_in_progress");
    
    const { error } = await supabase.auth.signInWithOAuth({ 
      provider,
      options: {
        // ✅ Redirecionando para a Home, evitando o funil de cadastro
        redirectTo: `${window.location.origin}/home`,
      }
    });
    if (error) toast({ title: `Erro ao conectar com ${provider}`, variant: "destructive" });
  };

  return (
    <div
      className={`min-h-[100dvh] w-full flex flex-col items-center justify-center px-4 relative ${!bgUrl ? "bg-background" : ""}`}
      style={bgUrl ? { backgroundImage: `url(${bgUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>

      {bgUrl && <div className="absolute inset-0 backdrop-blur-sm bg-[#454545]/[0.12]" />}
      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-gradient mb-2">Chamô</h1>
          <p className="text-sm text-muted-foreground">
            {forgotMode ? "Recuperar sua senha" : "Entre na sua conta"}
          </p>
        </div>

        {forgotMode ? (
          <form onSubmit={handleForgotPassword} className="bg-card border rounded-2xl p-6 shadow-card space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">E-mail</label>
              <div className="flex items-center gap-2 border rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-primary/30">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground" />
              </div>
            </div>
            <button type="submit" disabled={forgotLoading} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50">
              {forgotLoading ? "Enviando..." : "Recuperar senha"} <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        ) : (
          <div className="bg-card border rounded-2xl p-6 shadow-card">
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">E-mail</label>
                <div className="flex items-center gap-2 border rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-primary/30">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Senha</label>
                <div className="flex items-center gap-2 border rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-primary/30">
                  <Lock className="w-4 h-4 text-muted-foreground" />
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground" />
                </div>
              </div>

              {errorType === "email_not_confirmed" && (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-3 space-y-2">
                  <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">⚠️ Verifique seu e-mail antes de entrar.</p>
                  <button type="button" onClick={handleResendEmail} disabled={resending}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
                    <RefreshCw className={`w-3.5 h-3.5 ${resending ? "animate-spin" : ""}`} />
                    {resending ? "Reenviando..." : "Reenviar e-mail de verificação"}
                  </button>
                </div>
              )}

              <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50">
                {loading ? "Entrando..." : "Entrar"} <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="relative mt-6 mb-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Ou continue com</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleSocialLogin("google")}
                className="flex items-center justify-center gap-2 border rounded-xl py-2.5 text-sm font-medium hover:bg-muted transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Google
              </button>
              <button
                type="button"
                onClick={() => handleSocialLogin("apple")}
                className="flex items-center justify-center gap-2 border rounded-xl py-2.5 text-sm font-medium hover:bg-muted transition-colors"
              >
                <svg className="w-4 h-4 text-foreground" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.67.95 3.6.95.865 0 2.222-1.01 3.902-1.01.61 0 2.886.06 4.012 1.81-2.277 1.39-2.56 4.22-1.48 5.81 1.08 1.59 2.51 2.05 2.414 2.12z" />
                </svg>
                Apple
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground mt-4">
          Não tem conta?{" "}
          <Link to="/signup" className="text-primary font-medium hover:underline">Criar conta</Link>
        </p>
        <button type="button" onClick={() => setForgotMode(!forgotMode)}
          className="mx-auto mt-2 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors">
          {forgotMode ? "Voltar para login" : "Esqueceu sua senha?"}
        </button>
      </div>
    </div>);
};

export default Login;