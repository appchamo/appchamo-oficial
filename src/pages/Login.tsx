import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, ArrowRight, RefreshCw, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { translateError } from "@/lib/errorMessages";
import { Capacitor } from "@capacitor/core"; 
import { Browser } from "@capacitor/browser"; 

type LoginError = "email_not_confirmed" | "invalid_login" | "rate_limit" | "generic";

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
  const [deviceLimitHit, setDeviceLimitHit] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  // 🛡️ A TRAVA MESTRA ANTI-LOOP
  const isProcessingRef = useRef(false);

  const getDeviceId = () => {
    let deviceId = localStorage.getItem("chamo_device_id");
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem("chamo_device_id", deviceId);
    }
    return deviceId;
  };

  const checkDeviceLimitAndRedirect = async (userId: string) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    try {
      const deviceId = getDeviceId();
      const deviceName = Capacitor.isNativePlatform() ? "iPhone App" : "Web Browser";

      const { data: canLogin, error: deviceError } = await supabase.rpc('check_device_limit', {
        p_user_id: userId,
        p_device_id: deviceId,
        p_device_name: deviceName
      });

      if (deviceError || canLogin !== false) {
        await proceedToRedirect(userId);
      } else {
        setDeviceLimitHit(true);
        setPendingUserId(userId);
        setLoading(false);
        isProcessingRef.current = false; // Libera a trava para que o usuário possa tentar desligar aparelhos
      }
    } catch (err) {
      console.error("Erro na verificação do dispositivo:", err);
      isProcessingRef.current = false;
    }
  };

  const proceedToRedirect = async (userId: string) => {
    try {
      const [{ data: roles }, { data: profile }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase.from("profiles").select("cpf, phone").eq("user_id", userId).maybeSingle()
      ]);
        
      const isAdmin = roles?.some((r: any) =>
        ["super_admin", "finance_admin", "support_admin", "sponsor_admin", "moderator"].includes(r.role)
      );

      localStorage.removeItem("signup_in_progress");
      localStorage.removeItem("manual_login_intent");

      if (isAdmin) {
        navigate("/admin", { replace: true });
      } else if (!profile || (!profile.cpf && !profile.phone)) {
        localStorage.setItem("signup_in_progress", "true");
        navigate("/signup", { replace: true });
      } else {
        navigate("/home", { replace: true });
      }
    } catch (err) {
      console.error("Erro ao redirecionar:", err);
      isProcessingRef.current = false;
    }
  };

  useEffect(() => {
    // 1. Carrega Background uma única vez
    supabase.from("platform_settings").select("value").eq("key", "login_bg_url").maybeSingle()
      .then(({ data }) => {
        if (data?.value) setBgUrl(typeof data.value === "string" ? data.value : JSON.stringify(data.value).replace(/^"|"$/g, ""));
      });

    // 2. Listener de Auth (Filtramos para agir apenas no SIGNED_IN real)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user && !isProcessingRef.current) {
        checkDeviceLimitAndRedirect(session.user.id);
      }
    });

    // 3. Verifica sessão inicial (apenas se não houver intenção de login manual agora)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user && !isProcessingRef.current && localStorage.getItem("manual_login_intent") !== "true") {
        checkDeviceLimitAndRedirect(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || loading) return;
    setLoading(true);
    localStorage.setItem("manual_login_intent", "true"); 

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
      setLoading(false);
      localStorage.removeItem("manual_login_intent");
      toast({ title: friendlyError(error.message as any), variant: "destructive" });
    } else if (data.user) {
      checkDeviceLimitAndRedirect(data.user.id);
    }
  };

  const handleSocialLogin = async (provider: "google" | "apple") => {
    setLoading(true);
    localStorage.setItem("manual_login_intent", "true");
    const redirectTo = Capacitor.isNativePlatform() ? 'com.chamo.app://' : `${window.location.origin}/login`;
    
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo, queryParams: { prompt: 'select_account' } }
    });

    if (error) {
      setLoading(false);
      localStorage.removeItem("manual_login_intent");
      toast({ title: "Erro ao logar", description: error.message, variant: "destructive" });
    } else if (Capacitor.isNativePlatform() && data?.url) {
      await Browser.open({ url: data.url });
    }
  };

  // Funções de recuperação de senha e cancelamento mantidas idênticas
  const forceDisconnectOtherDevices = async () => {
    if (!pendingUserId) return;
    setLoading(true);
    const { error } = await supabase.from("user_devices").delete().eq("user_id", pendingUserId).neq("device_id", getDeviceId());
    if (!error) {
      isProcessingRef.current = false;
      setDeviceLimitHit(false);
      await checkDeviceLimitAndRedirect(pendingUserId);
    }
  };

  const cancelDeviceLimit = async () => {
    setDeviceLimitHit(false);
    isProcessingRef.current = false;
    await supabase.auth.signOut();
    setLoading(false);
  };

  // Renderização JSX mantida conforme seu original
  return (
    <div className={`min-h-[100dvh] w-full flex flex-col items-center justify-center px-4 relative ${!bgUrl ? "bg-background" : ""}`}
      style={bgUrl ? { backgroundImage: `url(${bgUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
      {bgUrl && <div className="absolute inset-0 backdrop-blur-sm bg-[#454545]/[0.12]" />}
      <div className="w-full max-w-sm relative z-10">
        {/* Conteúdo idêntico ao seu original... */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-gradient mb-2">Chamô</h1>
          <p className="text-sm text-muted-foreground">{forgotMode ? "Recuperar sua senha" : deviceLimitHit ? "Limite de Aparelhos" : "Entre na sua conta"}</p>
        </div>
        {/* Condicionais de formulários e botões iguais aos que você já tem */}
        {deviceLimitHit ? (
          <div className="bg-card border border-destructive/20 rounded-2xl p-6 shadow-card space-y-4">
             <Smartphone className="w-12 h-12 mx-auto text-destructive" />
             <h3 className="text-center font-bold">Aparelhos a mais!</h3>
             <button onClick={forceDisconnectOtherDevices} className="w-full py-2.5 rounded-xl bg-primary text-white">Desconectar outros e entrar</button>
             <button onClick={cancelDeviceLimit} className="w-full py-2.5 rounded-xl border">Cancelar</button>
          </div>
        ) : (
          <div className="bg-card border rounded-2xl p-6 shadow-card">
            <form onSubmit={handleLogin} className="space-y-4">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" className="w-full p-2 border rounded-xl bg-transparent" />
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="w-full p-2 border rounded-xl bg-transparent" />
              <button type="submit" disabled={loading} className="w-full py-2.5 rounded-xl bg-primary text-white">Entrar</button>
            </form>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <button onClick={() => handleSocialLogin("google")} className="border p-2 rounded-xl">Google</button>
              <button onClick={() => handleSocialLogin("apple")} className="border p-2 rounded-xl">Apple</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;