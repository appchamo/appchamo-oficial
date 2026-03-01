import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { translateError } from "@/lib/errorMessages";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Ticket, MailCheck, Mail } from "lucide-react";
import StepAccountType from "@/components/signup/StepAccountType";
import StepBasicData, { type BasicData } from "@/components/signup/StepBasicData";
import StepDocuments from "@/components/signup/StepDocuments";
import StepProfile from "@/components/signup/StepProfile";
import StepPlanSelect from "@/components/signup/StepPlanSelect";
import SubscriptionDialog from "@/components/subscription/SubscriptionDialog";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser"; 

type AccountType = "client" | "professional";
type Step = "method-choice" | "type" | "basic" | "documents" | "profile" | "plan" | "awaiting-email";

const friendlyError = (msg: string, status?: number) => {
  if (status === 429 || /429|too many|rate limit|rate_limit/i.test(msg))
    return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  if (msg.includes("already registered")) return "Este e-mail já está cadastrado.";
  if (msg.includes("password")) return "A senha deve ter pelo menos 6 caracteres.";
  if (msg.includes("cpf") || msg.includes("cnpj") || msg.includes("unique"))
    return "CPF ou CNPJ já cadastrado.";
  return "Erro ao criar conta. Tente novamente.";
};

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const Signup = () => {
  const navigate = useNavigate();
  const { session, profile, loading: authLoading, refreshProfile } = useAuth();
  const [accountType, setAccountType] = useState<AccountType>("client");
  const [step, setStep] = useState<Step>("method-choice");
  const [basicData, setBasicData] = useState<BasicData | null>(null);
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [profileData, setProfileData] = useState<{
    avatarUrl: string;
    categoryId?: string;
    professionId?: string;
    bio?: string;
    services?: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [couponPopup, setCouponPopup] = useState(false);
  const [showVerifyEmailModal, setShowVerifyEmailModal] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("free");
  const [isSubscriptionOpen, setIsSubscriptionOpen] = useState(false);
  const [resending, setResending] = useState(false);
  const [createdUserId, setCreatedUserId] = useState<string | null>(null);
  const didAdvanceFromOAuth = useRef(false);

  // Se voltou do OAuth com erro na URL (ex.: Apple config errada), mostrar toast e limpar URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    const description = params.get("error_description") || params.get("error_description") || "";
    if (error) {
      window.history.replaceState({}, "", window.location.pathname);
      let msg = "Verifique a configuração (Apple/Google) no Supabase.";
      try {
        if (description) msg = decodeURIComponent(description);
      } catch (_) {
        msg = description || msg;
      }
      toast({
        title: "Cadastro com rede social falhou",
        description: msg,
        variant: "destructive",
      });
    }
  }, []);

  const forceExitToLogin = async () => {
    setLoading(true);
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Erro silencioso ao sair:", error);
    } finally {
      localStorage.clear();
      sessionStorage.clear();
      document.cookie.split(";").forEach((c) => {
        document.cookie = c
          .replace(/^ +/, "")
          .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
      });
      localStorage.setItem("manual_login_intent", "true");
      window.location.href = "/login";
    }
  };

  // Ao montar: checa se já existe sessão (ex.: refresh) e avança ou redireciona
  useEffect(() => {
    if (localStorage.getItem("manual_login_intent") === "true") return;
    const checkSocialUser = async () => {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession?.user) return;
      setLoading(true);
      try {
        const { data: profileRow, error: profileError } = await supabase
          .from("profiles")
          .select("cpf, phone")
          .eq("user_id", currentSession.user.id)
          .maybeSingle();
        // Sessão inválida (ex.: usuário excluído no Supabase) → limpa e manda pro login
        const errMsg = (profileError?.message || "").toLowerCase();
        if (profileError && (errMsg.includes("jwt") || errMsg.includes("refresh") || errMsg.includes("session") || profileError.code === "PGRST301")) {
          await forceExitToLogin();
          return;
        }
        const isComplete = profileRow?.cpf || profileRow?.phone;
        if (isComplete) {
          localStorage.removeItem("signup_in_progress");
          navigate("/home");
        } else {
          setCreatedUserId(currentSession.user.id);
          setBasicData({
            name: currentSession.user.user_metadata?.full_name || "",
            email: currentSession.user.email || "",
            password: "",
            phone: "",
            document: "",
            documentType: "cpf",
            birthDate: "",
            addressZip: "",
            addressStreet: "",
            addressNumber: "",
            addressComplement: "",
            addressNeighborhood: "",
            addressCity: "",
            addressState: "",
            addressCountry: "Brasil",
          });
          setStep("type");
        }
      } catch (err) {
        console.error("Erro na Blitz Social:", err);
      } finally {
        setLoading(false);
      }
    };
    checkSocialUser();
  }, [navigate]);

  // Quando volta do OAuth no mobile: sessão chega depois; avança para "Escolha o tipo" (type)
  useEffect(() => {
    if (authLoading || !session?.user) return;
    if (localStorage.getItem("manual_login_intent") === "true") return;
    if (step !== "method-choice") return;
    if (!localStorage.getItem("signup_in_progress")) return;
    if (didAdvanceFromOAuth.current) return;

    const isComplete = profile?.cpf || profile?.phone;
    if (isComplete) {
      localStorage.removeItem("signup_in_progress");
      navigate("/home");
      return;
    }

    didAdvanceFromOAuth.current = true;
    setCreatedUserId(session.user.id);
    setBasicData({
      name: session.user.user_metadata?.full_name || "",
      email: session.user.email || "",
      password: "",
      phone: "",
      document: "",
      documentType: "cpf",
      birthDate: "",
      addressZip: "",
      addressStreet: "",
      addressNumber: "",
      addressComplement: "",
      addressNeighborhood: "",
      addressCity: "",
      addressState: "",
      addressCountry: "Brasil",
    });
    setStep("type");
  }, [session, profile, authLoading, step, navigate]);

  const handleSocialSignup = async (provider: "google" | "apple") => {
    localStorage.setItem("signup_in_progress", "true");
    localStorage.removeItem("manual_login_intent");

    try {
      if (Capacitor.isNativePlatform()) {
        // Abre no navegador do sistema (Safari/Chrome) para cumprir política do Google (não usar WebView)
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo: "com.chamo.app://google-auth",
            skipBrowserRedirect: true,
            queryParams: { prompt: "select_account" },
          },
        });
        if (error) throw error;
        if (data?.url) await Browser.open({ url: data.url });
      } else {
        const { error } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo: `${window.location.origin}/signup`,
            queryParams: { prompt: "select_account" },
          },
        });
        if (error) throw error;
      }
    } catch (err: any) {
      localStorage.removeItem("signup_in_progress");
      toast({ title: "Erro ao conectar", description: err?.message ?? "Tente novamente.", variant: "destructive" });
    }
  };

  const handleTypeSelect = (type: AccountType) => {
    setAccountType(type);
    setStep("basic");
  };

  const handleBasicNext = async (data: BasicData) => {
    setLoading(true);
    try {
      if (data.email && !createdUserId) {
        const { data: emailExists } = await supabase.rpc('check_email_exists', { 
          user_email: data.email 
        });

        if (emailExists) {
          toast({ 
            title: "E-mail já cadastrado", 
            description: "Por favor, entre com sua conta.", 
            variant: "destructive"
          });
          await forceExitToLogin();
          return;
        }
      }
      setBasicData(data);
      if (accountType === "professional") setStep("documents");
      else setStep("profile");
    } catch (error) {
      toast({ title: "Erro de verificação", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDocumentsNext = (files: File[]) => {
    setDocFiles(files);
    setStep("profile");
  };

  const handleProfileNext = (data: any) => {
    setProfileData(data);
    if (accountType === "professional") setStep("plan");
    else doSignup(data, "free");
  };

  const handlePlanSelect = async (planId: string) => {
    if (!profileData) return;
    setSelectedPlanId(planId);
    doSignup(profileData, planId);
  };

  const handleSubscriptionSuccess = () => {
    setIsSubscriptionOpen(false);
    localStorage.removeItem("signup_in_progress"); 
    setCouponPopup(true); 
  };

  const doSignup = async (pData: any, planId: string) => {
    if (!basicData) return;
    setLoading(true);
    try {
      let userId = createdUserId;
      let signedUpWithEmail = false;

      // Se não logou via Social, faz o cadastro manual por e-mail/senha
      if (!userId) {
        signedUpWithEmail = true;
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: basicData.email,
          password: basicData.password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: basicData.name },
          },
        });
        if (authError) {
          const status = (authError as { status?: number }).status;
          toast({
            title: friendlyError(authError.message, status),
            description: status === 429
              ? "Limite do servidor (por rede/IP). Tente em outra rede (ex.: 4G) ou aguarde até 1 hora. O admin pode aumentar em Supabase → Auth → Rate limits."
              : undefined,
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
        userId = authData.user?.id || null;
      }
      
      if (!userId) { setLoading(false); return; }

      // Garante JWT válido para a Edge Function (evita 401)
      let token = session?.access_token ?? null;
      if (!token) {
        const { data: { session: fresh } } = await supabase.auth.getSession();
        token = fresh?.access_token ?? null;
      }
      if (!token) {
        const { data: { session: refreshed } } = await supabase.auth.refreshSession();
        token = refreshed?.access_token ?? null;
      }
      if (!token) {
        toast({
          title: "Sessão expirada",
          description: "Volte e faça login com Google (ou e-mail) novamente para continuar.",
          variant: "destructive",
        });
        setLoading(false);
        await forceExitToLogin();
        return;
      }

      const docFilesPayload = await Promise.all(
        docFiles.map(async (file) => ({
          base64: await fileToBase64(file),
          ext: file.name.split(".").pop() || "jpg",
          contentType: file.type,
        }))
      );

      const { data: result, error: fnError } = await supabase.functions.invoke(
        "complete-signup",
        {
          body: { userId, accountType, profileData: pData, basicData, docFiles: docFilesPayload, planId },
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (fnError || result?.error) {
        console.error("Erro na função complete-signup:", fnError || result?.error);
        toast({ title: "Erro ao completar cadastro.", variant: "destructive" });
        setLoading(false);
        return;
      }

      setLoading(false);
      localStorage.removeItem("signup_in_progress");

      if (accountType === "professional" && planId !== "free") {
        setIsSubscriptionOpen(true);
      } else if (signedUpWithEmail) {
        // Cadastro por e-mail: exige confirmação → modal e depois ir para login
        setShowVerifyEmailModal(true);
      } else {
        setCouponPopup(true);
      }
    } catch (err: any) {
      toast({ title: "Erro ao criar conta.", variant: "destructive" });
      setLoading(false);
    }
  };

  const handleResendEmail = async () => {
    if (!basicData?.email) return;
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: basicData.email,
      options: { emailRedirectTo: window.location.origin }
    });
    if (error) toast({ title: "Aguarde um pouco", variant: "destructive" });
    else toast({ title: "E-mail reenviado!" });
    setResending(false);
  };

  const handleCouponClose = async () => {
    setCouponPopup(false);
    if (createdUserId) {
      // Atualiza perfil (user_type, etc.) antes de ir para a Home para já abrir como profissional/cliente
      await refreshProfile?.();
      navigate("/home");
    } else {
      setStep("awaiting-email");
    }
  };

  return (
    <>
      {loading && step !== "basic" && (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
          <div className="text-center">
            <h1 className="text-2xl font-extrabold text-gradient mb-3">Chamô</h1>
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Processando...</p>
          </div>
        </div>
      )}

      {!loading && step === "method-choice" && (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 animate-in fade-in duration-500">
          <div className="w-full max-w-sm space-y-8">
            <div className="text-center">
              <h1 className="text-3xl font-extrabold text-gradient mb-2">Chamô</h1>
              <p className="text-sm text-muted-foreground">Crie sua conta em segundos</p>
            </div>

            <div className="space-y-3">
              <button onClick={() => handleSocialSignup("google")} className="w-full flex items-center justify-center gap-3 py-3 border rounded-xl font-medium hover:bg-muted transition-all shadow-sm active:scale-95">
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continuar com Google
              </button>

              <button onClick={() => handleSocialSignup("apple")} className="w-full flex items-center justify-center gap-3 py-3 border rounded-xl font-medium hover:bg-muted transition-all shadow-sm active:scale-95">
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                  <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.67.95 3.6.95.865 0 2.222-1.01 3.902-1.01.61 0 2.886.06 4.012 1.81-2.277 1.39-2.56 4.22-1.48 5.81 1.08 1.59 2.51 2.05 2.414 2.12z" />
                </svg>
                Continuar com Apple
              </button>

              <div className="relative py-4">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border"></div></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">Ou</span></div>
              </div>

              <button onClick={() => setStep("type")} className="w-full flex items-center justify-center gap-3 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-all shadow-md active:scale-95">
                <Mail className="w-5 h-5" />
                Continuar com e-mail
              </button>
            </div>

            <p className="text-center text-xs text-muted-foreground">
              Já tem uma conta?{" "}
              <button 
                onClick={forceExitToLogin} 
                className="text-primary font-bold hover:underline bg-transparent border-none cursor-pointer"
              >
                Entrar
              </button>
            </p>
          </div>
        </div>
      )}

      {!loading && step === "type" && <StepAccountType onSelect={handleTypeSelect} />}
      {!loading && step === "basic" && <StepBasicData accountType={accountType} onNext={handleBasicNext} onBack={() => setStep(createdUserId ? "method-choice" : "type")} initialData={basicData || undefined} />}
      {!loading && step === "documents" && <StepDocuments documentType={basicData?.documentType || "cpf"} onNext={handleDocumentsNext} onBack={() => setStep("basic")} />}
      {!loading && step === "profile" && <StepProfile accountType={accountType} onNext={handleProfileNext} onBack={() => setStep(accountType === "professional" ? "documents" : "basic")} />}
      {!loading && step === "plan" && <StepPlanSelect onSelect={handlePlanSelect} onBack={() => setStep("profile")} />}

      <SubscriptionDialog isOpen={isSubscriptionOpen} onClose={() => setIsSubscriptionOpen(false)} planId={selectedPlanId} onSuccess={handleSubscriptionSuccess} />

      {(!loading && step !== "method-choice" && step !== "awaiting-email") && (
        <p className="text-center text-xs text-muted-foreground mt-8">
          Já tem uma conta?{" "}
          <button 
            onClick={forceExitToLogin} 
            className="text-primary font-bold hover:underline bg-transparent border-none cursor-pointer"
          >
            Entrar
          </button>
        </p>
      )}

      <Dialog open={showVerifyEmailModal} onOpenChange={(open) => !open && setShowVerifyEmailModal(false)}>
        <DialogContent className="max-w-xs text-center">
          <DialogHeader>
            <DialogTitle className="text-center flex items-center justify-center gap-2">
              <MailCheck className="w-5 h-5 text-primary" />
              Cadastro realizado!
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-4">
            <p className="text-sm font-medium text-foreground">
              Verifique seu e-mail e faça login para ativar sua conta.
            </p>
            <p className="text-xs text-muted-foreground">
              Você também ganhou 1 cupom para o sorteio mensal do Chamô.
            </p>
          </div>
          <button
            onClick={forceExitToLogin}
            className="w-full py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            Ir para o login
          </button>
        </DialogContent>
      </Dialog>

      <Dialog open={couponPopup} onOpenChange={handleCouponClose}>
        <DialogContent className="max-w-xs text-center">
          <DialogHeader><DialogTitle className="text-center">🎉 Parabéns!</DialogTitle></DialogHeader>
          <div className="flex flex-col items-center gap-3 py-4">
            <Ticket className="w-16 h-16 text-primary" />
            <p className="text-sm font-medium text-foreground">
              Você ganhou 1 cupom para o sorteio mensal do Chamô, confira!
            </p>
          </div>
          <button onClick={handleCouponClose} className="w-full py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors">
            Entendi!
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Signup;