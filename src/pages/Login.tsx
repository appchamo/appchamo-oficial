import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Mail, Lock, ArrowRight, RefreshCw, Home } from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, OAUTH_FAILED_KEY } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { translateError } from "@/lib/errorMessages";
import { resolveAuthReturnPath, setPostAuthRedirect, clearPostAuthRedirect } from "@/lib/chamoAuthReturn";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Preferences } from "@capacitor/preferences";
import { Loader2 } from "lucide-react"; 

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

// Variável de módulo substituída por ref dentro do componente (ver isRedirectingRef)

const hasOAuthCodeInUrl = () => {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.has("code");
};

/** Quando o Supabase/Apple falha no OAuth, a URL vem com error e error_description. Tratar aqui evita tela branca. */
const readOAuthErrorFromUrl = (): { error: string; description: string } | null => {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");
  const description = params.get("error_description") || params.get("error_description") || "";
  if (error) {
    try {
      return { error, description: description ? decodeURIComponent(description) : "" };
    } catch {
      return { error, description };
    }
  }
  return null;
};

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, refreshProfile } = useAuth();
  const returnTo = (location.state as { from?: string } | null)?.from;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(hasOAuthCodeInUrl());
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<LoginError | null>(null);
  const [resending, setResending] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  
  const [processingOAuth, setProcessingOAuth] = useState(hasOAuthCodeInUrl());
  const oauthTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Marca que abrimos o browser para OAuth (Google/Apple); evita toast "Demorou muito" quando o timeout é do fluxo social */
  const oauthBrowserOpenedRef = useRef(false);
  const lastOAuthUrlRef = useRef<string | null>(null);
  const hasRedirectedForSessionRef = useRef(false);
  const exchangeCodeAndRedirectRef = useRef<(url: string) => Promise<void>>(() => Promise.resolve());
  const socialLoginInProgressRef = useRef(false);
  const isRedirectingRef = useRef(false);

  // Limpa flag de "veio do signup por sessão expirada" e permite novo toque em "Entrar com Google"
  useEffect(() => {
    localStorage.removeItem("manual_login_intent");
    socialLoginInProgressRef.current = false;
  }, []);

  // Mantém destino pós-login no storage (OAuth perde o state do React Router ao voltar na URL)
  useEffect(() => {
    const from = (location.state as { from?: string } | null)?.from;
    if (from && from.startsWith("/") && !from.startsWith("//")) {
      setPostAuthRedirect(from);
    }
  }, [location.state]);

  // Quando não há sessão, reseta a ref de redirect para que um novo login (ex.: OAuth) possa redirecionar
  useEffect(() => {
    if (!session?.user) hasRedirectedForSessionRef.current = false;
  }, [session?.user]);

  // Mobile com WebView: quando a página carrega com ?code= (voltou do Google no mesmo WebView), troca e vai pra HOME
  const hasExchangedCodeFromUrlRef = useRef(false);
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || hasExchangedCodeFromUrlRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code) return;
    hasExchangedCodeFromUrlRef.current = true;
    (async () => {
      try {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
        window.history.replaceState({}, "", window.location.pathname);
        if (data?.session?.user && !hasRedirectedForSessionRef.current) {
          hasRedirectedForSessionRef.current = true;
          setLoading(false);
          setProcessingOAuth(false);
          proceedToRedirect(data.session.user.id, data.session.user.email ?? undefined);
        }
      } catch (e) {
        console.error("[Login] exchange from URL:", e);
        hasExchangedCodeFromUrlRef.current = false;
      }
    })();
  }, []);

  // Limpar timeout do OAuth ao receber sessão ou ao desmontar (evita travar "Entrando..." no Android)
  useEffect(() => {
    if (session?.user && oauthTimeoutRef.current) {
      clearTimeout(oauthTimeoutRef.current);
      oauthTimeoutRef.current = null;
    }
    return () => {
      if (oauthTimeoutRef.current) {
        clearTimeout(oauthTimeoutRef.current);
        oauthTimeoutRef.current = null;
      }
    };
  }, [session?.user]);

  // Troca code da URL por sessão e redireciona para HOME (deep link Google/Apple no mobile)
  const exchangeCodeAndRedirect = async (urlStr: string) => {
    if (!urlStr?.includes("code=") || lastOAuthUrlRef.current === urlStr) return;
    lastOAuthUrlRef.current = urlStr;
    let fixedUrl = urlStr.replace("#", "?");
    if (fixedUrl.startsWith("com.chamo.app:?")) fixedUrl = fixedUrl.replace("com.chamo.app:?", "com.chamo.app://?");
    try {
      const urlObj = new URL(fixedUrl);
      const code = urlObj.searchParams.get("code");
      if (!code) return;
      await Browser.close().catch(() => {});
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
      if (data?.session?.user && !hasRedirectedForSessionRef.current) {
        hasRedirectedForSessionRef.current = true;
        oauthBrowserOpenedRef.current = false;
        setLoading(false);
        setProcessingOAuth(false);
        proceedToRedirect(data.session.user.id, data.session.user.email ?? undefined);
      }
    } catch (e) {
      console.error("[Login] exchangeCodeAndRedirect:", e);
      lastOAuthUrlRef.current = null;
    }
  };
  exchangeCodeAndRedirectRef.current = exchangeCodeAndRedirect;

  // Quando o Google/Apple termina e a sessão aparece (ex.: deep link), redireciona mesmo que o timeout já tenha desbloqueado a tela
  useEffect(() => {
    if (!session?.user) return;
    if (hasRedirectedForSessionRef.current) return;
    hasRedirectedForSessionRef.current = true;
    oauthBrowserOpenedRef.current = false;
    setLoading(false);
    setProcessingOAuth(false);
    proceedToRedirect(session.user.id, session.user.email ?? undefined);
  }, [session?.user]);

  // Polling no mobile: enquanto loading e não redirecionou, checa getSession a cada 1s (contexto pode atrasar)
  const sessionPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !loading || hasRedirectedForSessionRef.current) return;
    sessionPollRef.current = setInterval(async () => {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (s?.user && !hasRedirectedForSessionRef.current) {
        hasRedirectedForSessionRef.current = true;
        oauthBrowserOpenedRef.current = false;
        if (sessionPollRef.current) {
          clearInterval(sessionPollRef.current);
          sessionPollRef.current = null;
        }
        setLoading(false);
        setProcessingOAuth(false);
            proceedToRedirect(s.user.id, s.user.email ?? undefined);
      }
    }, 1000);
    return () => {
      if (sessionPollRef.current) {
        clearInterval(sessionPollRef.current);
        sessionPollRef.current = null;
      }
    };
  }, [loading]);

  // Timeout de segurança: se ficar em "Entrando..." por muito tempo, desbloqueia. Em OAuth NÃO desbloqueia aos 22s (evita segundo toque e segundo exchange).
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => {
      const foiOAuth = oauthBrowserOpenedRef.current;
      oauthBrowserOpenedRef.current = false;
      if (!foiOAuth) {
        setLoading(false);
        setProcessingOAuth(false);
        toast({ title: "Demorou muito. Tente novamente.", variant: "destructive" });
      }
      // OAuth: só o timeout de 45s no handleSocialLogin desbloqueia; assim o usuário não reativa o botão aos 22s
    }, 22000);
    return () => clearTimeout(t);
  }, [loading]);

  // OAuth return é tratado só no useAuth (appUrlOpen) — listener duplicado aqui causava exchange duas vezes e AbortError

  // useAuth dispara isso quando o exchange falha e já estamos em /login (iOS), para desbloquear "Entrando..."
  useEffect(() => {
    const onOAuthDone = (e: CustomEvent<{ success: boolean }>) => {
      if (e.detail?.success) return;
      const hadOAuthAttempt =
        oauthBrowserOpenedRef.current || socialLoginInProgressRef.current;
      oauthBrowserOpenedRef.current = false;
      socialLoginInProgressRef.current = false;
      setLoading(false);
      setProcessingOAuth(false);
      // Só avisar falha de login se o usuário tinha iniciado Google/Apple (evita toast falso ao sair e ir para /login)
      if (hadOAuthAttempt) {
        toast({ title: "Não foi possível concluir o login. Tente novamente.", variant: "destructive" });
      }
    };
    window.addEventListener("chamo-oauth-done", onOAuthDone as EventListener);
    return () => window.removeEventListener("chamo-oauth-done", onOAuthDone as EventListener);
  }, []);

  // No mobile: quando o app volta ao primeiro plano, checa sessão (useAuth já pode ter feito o exchange)
  const appResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (appResumeTimerRef.current) {
        clearTimeout(appResumeTimerRef.current);
        appResumeTimerRef.current = null;
      }
      if (isActive) {
        appResumeTimerRef.current = setTimeout(async () => {
          appResumeTimerRef.current = null;
          const { data: { session: s } } = await supabase.auth.getSession();
          if (s?.user && !hasRedirectedForSessionRef.current) {
            hasRedirectedForSessionRef.current = true;
            oauthBrowserOpenedRef.current = false;
            setLoading(false);
            setProcessingOAuth(false);
            proceedToRedirect(s.user.id, s.user.email ?? undefined);
          } else if (!s?.user && loading) {
            socialLoginInProgressRef.current = false;
            setLoading(false);
            setProcessingOAuth(false);
          }
        }, 400);
      }
    });
    return () => {
      if (appResumeTimerRef.current) clearTimeout(appResumeTimerRef.current);
      listener.then((l) => l.remove());
    };
  }, [loading]);

  // Logo ao montar: se a URL veio com erro do OAuth (ex.: Apple config errada no Supabase), mostrar e limpar
  useEffect(() => {
    const oauthError = readOAuthErrorFromUrl();
    if (oauthError) {
      window.history.replaceState({}, "", window.location.pathname);
      const msg = oauthError.description || oauthError.error;
      toast({
        title: "Login com rede social falhou",
        description: msg || "Verifique a configuração (Apple/Google) no Supabase.",
        variant: "destructive",
      });
      setLoading(false);
      setProcessingOAuth(false);
    }
  }, []);

  const SUPPORT_EMAIL = "suporte@appchamo.com";

  /** Após OAuth (Google/Apple) o trigger pode demorar a criar o perfil. Retry só enquanto não existir perfil; se já existir (mesmo pending_signup), decide na hora. */
  const fetchProfileWithRetry = async (userId: string): Promise<{ profile: any; roles: any[] }> => {
    const fetchOne = async () => {
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
      ]);
      return { profile: profile ?? null, roles: roles ?? [] };
    };

    // No native, garantir que o cliente Supabase já tem a sessão antes da 1ª requisição (evita perfil null no Android).
    if (Capacitor.isNativePlatform()) {
      await supabase.auth.getSession();
    }
    const { profile: firstProfile, roles: firstRoles } = await fetchOne();

    // Se já existe perfil (incl. pending_signup), não precisa retry: trigger já rodou.
    if (firstProfile) {
      const hasCompleteProfile =
        firstProfile.user_type && firstProfile.user_type !== "pending_signup";
      if (hasCompleteProfile) return { profile: firstProfile, roles: firstRoles };
      return { profile: firstProfile, roles: firstRoles };
    }

    // Perfil ainda não existe: trigger pode estar atrasado. Poucos retries com esperas curtas.
    const delays = [400, 1000, 2000]; // ~3,4s no pior caso
    for (const delay of delays) {
      await new Promise((r) => setTimeout(r, delay));
      const { profile, roles } = await fetchOne();
      if (profile) {
        const hasCompleteProfile = profile.user_type && profile.user_type !== "pending_signup";
        if (hasCompleteProfile) return { profile, roles };
        return { profile, roles };
      }
    }
    return { profile: null, roles: [] };
  };

  const proceedToRedirect = async (userId: string, emailFromAuth?: string) => {
    if (isRedirectingRef.current) return;
    isRedirectingRef.current = true; 

    try {
      const normalizedSupportEmail = SUPPORT_EMAIL.toLowerCase().trim();
      const authEmail = (emailFromAuth || "").toLowerCase().trim();
      if (authEmail === normalizedSupportEmail) {
        localStorage.removeItem("signup_in_progress");
        localStorage.removeItem("manual_login_intent");
        navigate("/suporte-desk", { replace: true });
        return;
      }

      // 1) Verifica se já existe cadastro com esse e-mail na tabela de perfis
      if (authEmail) {
        const { data: existingByEmail } = await supabase
          .from("profiles")
          .select("id, user_type")
          .eq("email", authEmail.toLowerCase())
          .maybeSingle();

        if (!existingByEmail || !existingByEmail.user_type || existingByEmail.user_type === "pending_signup") {
          const back = resolveAuthReturnPath(returnTo);
          if (back) setPostAuthRedirect(back);
          localStorage.removeItem("signup_in_progress");
          localStorage.removeItem("manual_login_intent");
          navigate("/signup", { replace: true });
          return;
        }
      }

      const { profile, roles } = await fetchProfileWithRetry(userId);

      const profileEmail = (profile?.email || "").toLowerCase().trim();
      if (profileEmail === normalizedSupportEmail) {
        localStorage.removeItem("signup_in_progress");
        localStorage.removeItem("manual_login_intent");
        navigate("/suporte-desk", { replace: true });
        return;
      }

      const isAdmin = roles?.some((r: any) =>
        ["super_admin", "finance_admin", "support_admin", "sponsor_admin", "moderator"].includes(r.role)
      );

      if (isAdmin) {
        localStorage.removeItem("signup_in_progress");
        localStorage.removeItem("manual_login_intent");
        navigate("/admin", { replace: true }); 
        return;
      }

      // Sem cadastro (sem perfil ou pending_signup): manda para o fluxo de cadastro (Signup)
      const isProfileIncomplete =
        !profile ||
        !profile.user_type ||
        profile.user_type === "pending_signup";

      if (isProfileIncomplete) {
        const back = resolveAuthReturnPath(returnTo);
        if (back) setPostAuthRedirect(back);
        localStorage.removeItem("signup_in_progress");
        localStorage.removeItem("manual_login_intent");

        navigate("/signup", { replace: true });
        return;
      }

      localStorage.removeItem("signup_in_progress");
      localStorage.removeItem("manual_login_intent");
      const afterAuth = resolveAuthReturnPath(returnTo);
      if (afterAuth) {
        clearPostAuthRedirect();
        navigate(afterAuth, { replace: true });
      } else {
        sessionStorage.setItem("chamo_oauth_just_landed", "1");
        localStorage.setItem("chamo_oauth_just_landed", "1");
        navigate("/post-login", { replace: true });
      }
      
    } catch (err) {
      console.error("Erro ao verificar perfil:", err);
      setLoading(false);
      isRedirectingRef.current = false; 
    }
  };

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

  // Ao voltar do OAuth (Apple/Google) com ?code=, mostrar "Processando login..." até ter sessão ou timeout
  useEffect(() => {
    if (!processingOAuth) return;
    if (session?.user) {
      setProcessingOAuth(false);
      return;
    }
    const t = setTimeout(() => {
      setProcessingOAuth(false);
      setLoading(false);
      if (hasOAuthCodeInUrl()) {
        window.history.replaceState({}, "", window.location.pathname);
      }
    }, 8000);
    return () => clearTimeout(t);
  }, [processingOAuth, session]);

  useEffect(() => {
    supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "login_bg_url")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value) {
          const val = typeof data.value === "string" ? data.value : JSON.stringify(data.value).replace(/^"|"$/g, "");
          if (val) setBgUrl(val);
        }
      });

    const runRedirect = (userId: string, email?: string) => {
      if (isRedirectingRef.current) return;
      proceedToRedirect(userId, email);
    };

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session?.user && !isRedirectingRef.current) {
        // No Android/Capacitor a sessão pode levar um instante a ser persistida; esperar e usar getSession
        // evita consultar o perfil com JWT antigo e mandar usuário já cadastrado para o signup.
        if (Capacitor.isNativePlatform()) {
          await new Promise((r) => setTimeout(r, 400));
          const { data: { session: fresh } } = await supabase.auth.getSession();
          if (fresh?.user) {
            runRedirect(fresh.user.id, fresh.user.email ?? undefined);
            return;
          }
        }
        runRedirect(session.user.id, session.user.email ?? undefined);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user && !isRedirectingRef.current) {
        proceedToRedirect(session.user.id, session.user.email ?? undefined);
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe?.();
      isRedirectingRef.current = false;
    };
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
    
    localStorage.setItem("manual_login_intent", "true"); 
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
      console.log("💥 Erro no login, limpando dados residuais...");
      localStorage.removeItem("sb-wfxeiuqxzrlnvlopcrwd-auth-token");
      
      const type = getErrorType(error.message);
      setErrorType(type);
      toast({ title: friendlyError(type), variant: "destructive" });
      setLoading(false);
      return;
    }
    
    localStorage.removeItem("manual_login_intent");
    await proceedToRedirect(data.user.id, data.user.email ?? undefined);
  };

  const handleSocialLogin = async (provider: "google" | "apple") => {
    if (socialLoginInProgressRef.current) return;
    socialLoginInProgressRef.current = true;
    setLoading(true);

    try {
      localStorage.removeItem("signup_in_progress");
      localStorage.setItem("manual_login_intent", "true");

      if (Capacitor.isNativePlatform()) {
        const isIos = Capacitor.getPlatform() === 'ios';
        // iOS: scheme direto (sem abrir web). Android: página web.
        const redirectTo = isIos ? 'com.chamo.app://oauth' : 'https://appchamo.com/oauth-callback';
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo,
            skipBrowserRedirect: true,
            queryParams: provider === 'apple'
              ? { scope: 'name email' }
              : { prompt: 'select_account' },
          }
        });
        if (error) throw error;
        if (data?.url) {
          await Preferences.remove({ key: OAUTH_FAILED_KEY }).catch(() => {}); // nova tentativa: não bloquear por código que falhou antes
          oauthBrowserOpenedRef.current = true;
          if (oauthTimeoutRef.current) clearTimeout(oauthTimeoutRef.current);
          oauthTimeoutRef.current = setTimeout(() => {
            oauthTimeoutRef.current = null;
            oauthBrowserOpenedRef.current = false;
            socialLoginInProgressRef.current = false;
            setLoading(false);
          }, 45000);
          // Safari/Chrome (não WebView) para não cair no "Acesso bloqueado" do Google.
          await Browser.open({ url: data.url });
          return;
        } else {
          setLoading(false);
        }
      } else {
        const redirectTo = `${window.location.origin}/login`;
        
        const { error } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo,
            queryParams: provider === 'apple'
              ? { scope: 'name email' }
              : { prompt: 'select_account' },
          }
        });

        if (error) throw error;
      }

    } catch (err: any) {
      console.error("💥 [LOGIN] ERRO CAPTURADO:", err);
      localStorage.removeItem("manual_login_intent");
      toast({ title: "Erro ao logar", description: err.message, variant: "destructive" });
      setLoading(false);
    } finally {
      if (!oauthBrowserOpenedRef.current) socialLoginInProgressRef.current = false;
    }
  };

  if (processingOAuth) {
    return (
      <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center px-4 bg-background">
        <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
        <p className="text-sm text-muted-foreground">Processando login...</p>
      </div>
    );
  }

  return (
    <div
      className={`min-h-[100dvh] w-full flex flex-col items-center justify-center px-4 relative ${!bgUrl ? "bg-background" : ""}`}
      style={bgUrl ? { backgroundImage: `url(${bgUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>

      {bgUrl && <div className="absolute inset-0 backdrop-blur-sm bg-[#454545]/[0.12]" />}
      {/* Botão Início: volta para a tela inicial (Home) quando usuário foi redirecionado de Contratar/Chat */}
      <div className="absolute top-4 left-0 right-0 z-20 flex justify-between items-center px-4 max-w-sm mx-auto">
        <span className="text-lg font-bold text-primary">Chamô</span>
        <button
          type="button"
          onClick={() => navigate("/home")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/40 text-primary text-sm font-semibold hover:bg-primary/10 transition-colors"
        >
          <Home className="w-4 h-4" />
          Início
        </button>
      </div>
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
              <PasswordInput label="Senha" value={password} onChange={setPassword} placeholder="••••••••" autoComplete="current-password" />

              {errorType === "email_not_confirmed" && (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-3 space-y-2">
                  <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">⚠️ Verifique seu e-mail antes de entrar.</p>
                  <button type="button" onClick={handleResendEmail} disabled={resending}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
                    <RefreshCw className={`w-3.5 h-3.5 ${resending ? "animate-spin" : ""}`} />
                    {resending ? "Reenviando..." : "Reenviar e-mail"}
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

            <div className="flex flex-wrap justify-center gap-3">
              <button type="button" onClick={() => handleSocialLogin("google")} disabled={loading} className="flex items-center justify-center gap-2 border rounded-xl py-2.5 px-5 text-sm font-medium hover:bg-muted transition-colors min-w-[140px] disabled:opacity-50 disabled:pointer-events-none">
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Google
              </button>
              {Capacitor.getPlatform() !== "android" && (
                <button type="button" onClick={() => handleSocialLogin("apple")} disabled={loading} className="flex items-center justify-center gap-2 border rounded-xl py-2.5 px-5 text-sm font-medium hover:bg-muted transition-colors min-w-[140px] disabled:opacity-50 disabled:pointer-events-none">
                  <svg className="w-4 h-4 text-foreground" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.67.95 3.6.95.865 0 2.222-1.01 3.902-1.01.61 0 2.886.06 4.012 1.81-2.277 1.39-2.56 4.22-1.48 5.81 1.08 1.59 2.51 2.05 2.414 2.12z" />
                  </svg>
                  Apple
                </button>
              )}
            </div>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground mt-4">
          Não tem conta? <Link to="/signup" className="text-primary font-medium hover:underline">Criar conta</Link>
        </p>
        <button type="button" onClick={() => setForgotMode(!forgotMode)} className="mx-auto mt-2 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors">
          {forgotMode ? "Voltar para login" : "Esqueceu sua senha?"}
        </button>
      </div>
    </div>
  );
};

export default Login;
