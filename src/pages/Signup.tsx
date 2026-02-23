import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { translateError } from "@/lib/errorMessages";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Ticket } from "lucide-react";
import StepAccountType from "@/components/signup/StepAccountType";
import StepBasicData, { type BasicData } from "@/components/signup/StepBasicData";
import StepDocuments from "@/components/signup/StepDocuments";
import StepProfile from "@/components/signup/StepProfile";
import StepPlanSelect from "@/components/signup/StepPlanSelect";
import SubscriptionDialog from "@/components/subscription/SubscriptionDialog";

type AccountType = "client" | "professional";
type Step = "type" | "basic" | "documents" | "profile" | "plan";

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
  const [step, setStep] = useState<Step>("type");
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
  const [selectedPlanId, setSelectedPlanId] = useState<string>("free");
  const [isSubscriptionOpen, setIsSubscriptionOpen] = useState(false);

  // ✅ NOVO: Memória para saber se a conta já foi criada no banco
  const [createdUserId, setCreatedUserId] = useState<string | null>(null);

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
    
    // Dispara o cadastro. Se for pago, o doSignup abrirá o modal após o sucesso.
    doSignup(profileData, planId);
  };

  const handleSubscriptionSuccess = () => {
    setIsSubscriptionOpen(false);
    localStorage.setItem("just_signed_up", "true");
    navigate("/home");
  };

  const doSignup = async (pData: any, planId: string) => {
    if (!basicData) return;
    setLoading(true);

    try {
      // ✅ PROTEÇÃO: Se a conta já foi criada, apenas atualiza o plano ou reabre o modal
      if (createdUserId) {
        if (accountType === "professional" && planId !== "free") {
          setLoading(false);
          setIsSubscriptionOpen(true);
        } else {
          // Se o usuário desistiu de pagar e clicou no Grátis
          await supabase.from("subscriptions").update({ plan_id: "free" } as any).eq("user_id", createdUserId);
          localStorage.setItem("just_signed_up", "true");
          toast({ title: "Conta criada com sucesso!" });
          navigate("/home");
        }
        return; // Para a execução aqui para não dar o erro de e-mail duplicado
      }

      // 1. Cria a conta no Auth
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

      if (!authData.user) {
        toast({ title: "Erro inesperado ao criar conta.", variant: "destructive" });
        setLoading(false);
        return;
      }

      const userId = authData.user.id;
      
      // ✅ Salva o ID na memória para não tentar criar a conta de novo se ele fechar o modal
      setCreatedUserId(userId); 

      await new Promise((r) => setTimeout(r, 1000));

      const docFilesPayload = await Promise.all(
        docFiles.map(async (file) => ({
          base64: await fileToBase64(file),
          ext: file.name.split(".").pop() || "jpg",
          contentType: file.type,
        }))
      );

      // 2. Completa o perfil via Edge Function
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

      // 3. Se for plano pago, abre o modal agora (usuário já está logado)
      if (accountType === "professional" && planId !== "free") {
        setLoading(false);
        setIsSubscriptionOpen(true);
      } else {
        // Se for free, finaliza normal
        localStorage.setItem("just_signed_up", "true");
        toast({ title: "Conta criada com sucesso!" });
        navigate("/home");
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

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-extrabold text-gradient mb-3">Chamô</h1>
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Criando sua conta...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {step === "type" && <StepAccountType onSelect={handleTypeSelect} />}
      {step === "basic" && <StepBasicData accountType={accountType} onNext={handleBasicNext} onBack={() => setStep("type")} />}
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