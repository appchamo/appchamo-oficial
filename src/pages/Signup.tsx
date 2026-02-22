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
import SubscriptionDialog from "@/components/SubscriptionDialog"; // ✅ Adicionado import correto

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
  const [isSubscriptionOpen, setIsSubscriptionOpen] = useState(false); // ✅ Controle do Modal

  const handleTypeSelect = (type: AccountType) => {
    setAccountType(type);
    setStep("basic");
  };

  const handleBasicNext = (data: BasicData) => {
    setBasicData(data);
    if (accountType === "professional") {
      setStep("documents");
    } else {
      setStep("profile");
    }
  };

  const handleDocumentsNext = (files: File[]) => {
    setDocFiles(files);
    setStep("profile");
  };

  const handleProfileNext = (data: {
    avatarUrl: string;
    categoryId?: string;
    professionId?: string;
    bio?: string;
    services?: string;
  }) => {
    setProfileData(data);
    if (accountType === "professional") {
      setStep("plan");
    } else {
      doSignup(data, "free");
    }
  };

  // ✅ Modificado para abrir o Modal antes de criar a conta se for plano pago
  const handlePlanSelect = (planId: string) => {
    if (!profileData) return;
    setSelectedPlanId(planId); 
    
    if (planId !== "free") {
      setIsSubscriptionOpen(true);
    } else {
      doSignup(profileData, planId);
    }
  };

  // ✅ Função chamada quando o pagamento é preenchido/confirmado no modal
  const handleSubscriptionSuccess = () => {
    setIsSubscriptionOpen(false);
    if (profileData) {
      doSignup(profileData, selectedPlanId);
    }
  };

  const doSignup = async (
    pData: {
      avatarUrl: string;
      categoryId?: string;
      professionId?: string;
      bio?: string;
      services?: string;
    },
    planId: string
  ) => {
    if (!basicData) return;
    setLoading(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: basicData.email,
        password: basicData.password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { 
            full_name: basicData.name,
            user_type: accountType,
          },
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

      await new Promise((r) => setTimeout(r, 2000));

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
        console.error("complete-signup error:", fnError || result?.error);
        toast({
          title: "Erro ao completar cadastro.",
          description: fnError?.message || result?.error,
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // ✅ Em vez de abrir o popup aqui, salvamos no localStorage para a Home abrir depois
      localStorage.setItem("just_signed_up", "true");
      
      if (accountType === "professional" && planId !== "free") {
        toast({ 
          title: "Cadastro em análise!", 
          description: "Recebemos seus dados e pagamento. Avisaremos assim que for aprovado!" 
        });
      } else {
        toast({ title: "Conta criada com sucesso!" });
      }

      navigate("/home");
    } catch (err: any) {
      toast({
        title: "Erro ao criar conta.",
        description: translateError(err.message),
        variant: "destructive",
      });
    }

    setLoading(false);
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
      {step === "basic" && (
        <StepBasicData
          accountType={accountType}
          onNext={handleBasicNext}
          onBack={() => setStep("type")}
        />
      )}
      {step === "documents" && (
        <StepDocuments
          documentType={basicData?.documentType || "cpf"}
          onNext={handleDocumentsNext}
          onBack={() => setStep("basic")}
        />
      )}
      {step === "profile" && (
        <StepProfile
          accountType={accountType}
          onNext={handleProfileNext}
          onBack={() =>
            setStep(accountType === "professional" ? "documents" : "basic")
          }
        />
      )}
      {step === "plan" && (
        <StepPlanSelect
          onSelect={handlePlanSelect}
          onBack={() => setStep("profile")}
        />
      )}

      {/* ✅ Modal de Assinatura integrado ao fluxo de cadastro */}
      <SubscriptionDialog 
        isOpen={isSubscriptionOpen}
        onClose={() => setIsSubscriptionOpen(false)}
        planId={selectedPlanId}
        onSuccess={handleSubscriptionSuccess}
      />

      {/* ✅ O Modal de cupom agora só será chamado via Home, mas mantemos a estrutura por segurança */}
      <Dialog open={couponPopup} onOpenChange={handleCouponClose}>
        <DialogContent className="max-w-xs text-center">
          <DialogHeader><DialogTitle className="text-center">🎉 Parabéns!</DialogTitle></DialogHeader>
          <div className="flex flex-col items-center gap-3 py-4">
            <Ticket className="w-16 h-16 text-primary" />
            <p className="text-sm text-foreground font-medium">Você ganhou 1 cupom!</p>
          </div>
          <button onClick={handleCouponClose} className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-semibold">Entendi!</button>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Signup;