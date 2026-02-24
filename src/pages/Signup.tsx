import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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

type AccountType = "client" | "professional";
type Step = "method-choice" | "type" | "basic" | "documents" | "profile" | "plan" | "awaiting-email";

const friendlyError = (msg: string) => {
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
  
  const [verifying, setVerifying] = useState(() => {
    if (typeof window !== "undefined") {
      return window.location.hash.includes("access_token") || window.location.hash.includes("error");
    }
    return false;
  });
  
  const [couponPopup, setCouponPopup] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("free");
  const [isSubscriptionOpen, setIsSubscriptionOpen] = useState(false);
  const [resending, setResending] = useState(false);
  const [createdUserId, setCreatedUserId] = useState<string | null>(null);

  // Guardamos o step atual numa referência para o useEffect não se perder com as atualizações
  const stepRef = useRef(step);
  useEffect(() => { stepRef.current = step; }, [step]);

  useEffect(() => {
    let isMounted = true;

    const processAuth = async (user: any) => {
      if (!user) return;
      const isSignupFlow = localStorage.getItem("signup_in_progress") === "true";

      try {
        // Tenta achar o perfil do usuário atual
        const { data: profile } = await supabase
          .from("profiles")
          .select("cpf, onboarding_completed")
          .eq("id", user.id)
          .maybeSingle();

        const hasCompletedProfile = profile?.cpf || profile?.onboarding_completed;

        if (hasCompletedProfile) {
          // 🛑 ERRO: Já tem conta!
          localStorage.removeItem("signup_in_progress");
          await supabase.auth.signOut(); 
          window.history.replaceState(null, "", window.location.pathname);

          if (isMounted) {
            toast({ 
              title: "E-mail já cadastrado", 
              description: "Este e-mail já possui conta. Por favor, faça login.", 
              variant: "destructive" 
            });
            setVerifying(false);
            navigate("/"); 
          }
          return;
        }

        // ✅ CONTA NOVA: Inicia o fluxo de cadastro
        if (isSignupFlow) {
          localStorage.removeItem("signup_in_progress"); // Limpa para não dar loop
          window.history.replaceState(null, "", window.location.pathname);
          
          if (isMounted) {
            setCreatedUserId(user.id);
            setBasicData({
              name: user.user_metadata?.full_name || "",
              email: user.email || "",
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
              addressCountry: "Brasil"
            });
            setStep("type");
            setVerifying(false);
          }
        } else {
          // 🔥 AQUI ESTAVA O BUG DOS 5 SEGUNDOS 🔥
          // Só redireciona para a Home se ele estiver na tela inicial de escolha e não tiver flag.
          // Se ele já estiver na tela "type" (Cliente/Profissional), não faz nada, deixa ele preencher!
          if (stepRef.current === "method-choice" && isMounted) {
            navigate("/home");
          }
        }
      } catch (err) {
        if (isMounted) setVerifying(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        processAuth(session.user);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        processAuth(session.user);
      } else if (!window.location.hash.includes("access_token")) {
        if (isMounted) setVerifying(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  const handleSocialSignup = async (provider: "google" | "apple") => {
    localStorage.setItem("signup_in_progress", "true");
    
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.href,
        queryParams: {
          prompt: 'select_account',
        },
      }
    });
    if (error) {
      localStorage.removeItem("signup_in_progress");
      toast({ title: "Erro ao conectar", description: error.message, variant: "destructive" });
    }
  };

  const handleTypeSelect = (type: AccountType) => {
    setAccountType(type);
    setStep("basic");
  };

  const handleBasicNext = (data: BasicData) => {
    setBasicData(data);
    if (accountType === "professional") setStep("documents");
    else setStep("profile");
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
    if (createdUserId) navigate("/home");
    else setStep("awaiting-email");
  };

  const handleResendEmail = async () => {
    if (!basicData?.email) return;
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: basicData.email,
      options: { emailRedirectTo: window.location.origin }
    });
    
    if (error) {
      toast({ title: "Aguarde um pouco", description: "Muitas tentativas. Tente novamente em 1 minuto.", variant: "destructive" });
    } else {
      toast({ title: "E-mail reenviado!", description: "Verifique sua caixa de entrada e spam." });
    }
    setResending(false);
  };

  const doSignup = async (pData: any, planId: string) => {
    if (!basicData) return;
    setLoading(true);

    try {
      let userId = createdUserId;

      if (!userId) {
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: basicData.email,
          password: basicData.password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: basicData.name },
          },
        });

        if (authError) {
          toast({ title: friendlyError(authError.message), variant: "destructive" });
          setLoading(false);
          return;
        }
        userId = authData.user?.id || null;
      }

      if (!userId) {
        toast({ title: "Erro inesperado ao criar conta.", variant: "destructive" });
        setLoading(false);
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
          body: {
            userId,
            accountType,
            profileData: pData,
            basicData,
            docFiles: docFilesPayload,
            planId,
          },
        }
      );

      if (fnError || result?.error) {
        toast({ title: "Erro ao completar cadastro.", variant: "destructive" });
        setLoading(false);
        return;
      }

      if (accountType === "professional" && planId !== "free") {
        setLoading(false);
        setIsSubscriptionOpen(true);
      } else {
        setLoading(false);
        if (createdUserId) navigate("/home");
        else setStep("awaiting-email");
      }
    } catch (err: any) {
      toast({ title: "Erro ao criar conta.", description: translateError(err.message), variant: "destructive" });
      setLoading(false);
    }
  };

  const handleCouponClose = () => {
    setCouponPopup(false);
    navigate("/home");
  };

  if (verifying || loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-extrabold text-gradient mb-3">Chamô</h1>
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {verifying ? "Verificando sua conta..." : "Processando..."}
          </p>
        </div>
      </div>
    );
  }

  if (step === "awaiting-email") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
          <MailCheck className="w-10 h-10 text-primary" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Verifique seu e-mail</h1>
        <p className="text-muted-foreground mb-8 max-w-xs">
          Enviamos um link de confirmação para <strong>{basicData?.email}</strong>. 
          Acesse seu e-mail para ativar sua conta.
        </p>
        <div className="space-y-3 w-full max-w-xs">
          <button onClick={() => navigate("/login")} className="w-full py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-all">
            Ir para o Login
          </button>
          <button 
            onClick={handleResendEmail} 
            disabled={resending}
            className="w-full py-3 border rounded-xl font-semibold text-sm disabled:opacity-50"
          >
            {resending ? "Enviando..." : "Não recebi o e-mail"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {step === "method-choice" && (
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
              Já tem uma conta? <button onClick={() => navigate("/login")} className="text-primary font-bold hover:underline">Entrar</button>
            </p>
          </div>
        </div>
      )}

      {step === "type" && <StepAccountType onSelect={handleTypeSelect} />}
      
      {step === "basic" && (
        <StepBasicData 
          accountType={accountType} 
          onNext={handleBasicNext} 
          onBack={() => setStep(createdUserId ? "method-choice" : "type")} 
          initialData={basicData || undefined}
        />
      )}

      {step === "documents" && <StepDocuments documentType={basicData?.documentType || "cpf"} onNext={handleDocumentsNext} onBack={() => setStep("basic")} />}
      {step === "profile" && <StepProfile accountType={accountType} onNext={handleProfileNext} onBack={() => setStep(accountType === "professional" ? "documents" : "basic")} />}
      {step === "plan" && <StepPlanSelect onSelect={handlePlanSelect} onBack={() => setStep("profile")} />}

      <SubscriptionDialog 
        isOpen={isSubscriptionOpen}
        onClose={() => setIsSubscriptionOpen(false)}
        planId={selectedPlanId}
        onSuccess={handleSubscriptionSuccess}
      />

      <Dialog open={couponPopup} onOpenChange={handleCouponClose}>
        <DialogContent className="max-w-xs text-center">
          <DialogHeader><DialogTitle className="text-center">🎉 Parabéns!</DialogTitle></DialogHeader>
          <div className="flex flex-col items-center gap-3 py-4">
            <Ticket className="w-16 h-16 text-primary" />
            <p className="text-sm font-medium text-foreground">Você ganhou 1 cupom!</p>
          </div>
          <button onClick={handleCouponClose} className="w-full py-2.5 bg-primary text-white rounded-xl text-sm font-semibold">Entendi!</button>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Signup;