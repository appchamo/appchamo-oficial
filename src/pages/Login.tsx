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

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 relative"
      style={bgUrl ? { backgroundImage: `url(${bgUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>

      {bgUrl && <div className="absolute inset-0 backdrop-blur-sm bg-[#454545]/[0.12]" />}
      <div className={`w-full max-w-sm relative z-10 ${!bgUrl ? "bg-background" : ""}`}>
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
          <form onSubmit={handleLogin} className="bg-card border rounded-2xl p-6 shadow-card space-y-4">
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
        )}

        <p className="text-center text-xs text-muted-foreground mt-4">
          Não tem conta?{" "}
          <Link to="/signup" className="text-primary font-medium hover:underline">Criar conta</Link>
        </p>
        <button type="button" onClick={() => setForgotMode(!forgotMode)}
          className="mx-auto mt-2 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors">
          {forgotMode ? "Voltar para login" : "Esqueceu sua senha?"}
        </button>
        {!forgotMode && (
          <button type="button" onClick={handleResendEmail} disabled={resending || !email}
            className="mx-auto mt-1 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors disabled:opacity-40">
            <RefreshCw className={`w-3 h-3 ${resending ? "animate-spin" : ""}`} />
            Reenviar e-mail de verificação
          </button>
        )}
      </div>
    </div>);
};

export default Login;
