import AppLayout from "@/components/AppLayout";
import { Check, Crown, Star, Zap, Building2, ArrowLeft, CreditCard, Lock, Clock, AlertTriangle, FileText, Upload, Search, MapPin, Smartphone } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";
import { useIAP } from "@/hooks/useIAP";
import { toast } from "@/hooks/use-toast";
import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCpf, formatCep, validateCpf } from "@/lib/formatters";
import { getProductIdForPlan } from "@/lib/iap-config";

const planDetails = [
  {
    id: "free",
    icon: Zap,
    color: "text-muted-foreground",
    features: [
      "Até 3 chamadas por conta",
      "1 dispositivo simultâneo",
      "Acesso básico à plataforma",
      "Apenas cobrança presencial",
    ],
  },
  {
    id: "pro",
    icon: Star,
    color: "text-primary",
    features: [
      "Chamadas ilimitadas",
      "Receba pagamentos pelo app",
      "Suporte no app",
      "Até 2 dispositivos simultâneos",
    ],
  },
  {
    id: "vip",
    icon: Crown,
    color: "text-amber-500",
    popular: true,
    recommended: true,
    features: [
      "Tudo do Pro",
      "Selo de verificado",
      "Aparece em destaque na Home",
      "Até 10 dispositivos simultâneos",
    ],
  },
  {
    id: "business",
    icon: Building2,
    color: "text-violet-500",
    features: [
      "Tudo do VIP",
      "Consultoria personalizada",
      "Suporte 24h",
      "Catálogo de produtos",
      "Publicar vagas de emprego",
      "Acesso VIP ao Chamô Event",
      "Até 20 dispositivos simultâneos",
    ],
  },
];

const useIAPOnIOS = Capacitor.getPlatform() === "ios";

const Subscriptions = () => {
  const navigate = useNavigate();
  const { plan: currentPlan, plans, loading, changePlan, callsUsed, callsRemaining, isFreePlan, refetch } = useSubscription();
  const { user, profile } = useAuth();
  const {
    isIAPAvailable,
    isIOS,
    products,
    loadingProducts,
    purchasing,
    restoring,
    loadProducts,
    purchase,
    restore,
    openSubscriptionManagement,
  } = useIAP();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [changing, setChanging] = useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [cardForm, setCardForm] = useState({ number: "", name: "", expiry: "", cvv: "", address: "", cpf: "" });
  const [processing, setProcessing] = useState(false);
  const [proStatus, setProStatus] = useState<string | null>(null);
  const [proStatusLoaded, setProStatusLoaded] = useState(false);
  
  // Estado para armazenar os benefícios dinâmicos vindos do banco de dados
  const [planFeaturesDb, setPlanFeaturesDb] = useState<Record<string, string[]>>({});

  // Estados detalhados para o Business com busca de CEP
  const [businessData, setBusinessData] = useState({ 
    cnpj: "", 
    cep: "", 
    street: "", 
    number: "", 
    neighborhood: "", 
    city: "", 
    state: "" 
  });
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [searchingCep, setSearchingCep] = useState(false);
  const [showFullAddress, setShowFullAddress] = useState(false);
  const [billingCep, setBillingCep] = useState("");
  const [billingAddressNumber, setBillingAddressNumber] = useState("");

  useEffect(() => {
    if (!paymentOpen || !user?.id) return;
    setBillingCep("");
    setBillingAddressNumber("");
    (async () => {
      const { data: p } = await supabase
        .from("profiles")
        .select("address_zip, address_number")
        .eq("user_id", user.id)
        .maybeSingle();
      if (p?.address_zip) setBillingCep(formatCep(String(p.address_zip).replace(/\D/g, "")));
      if (p?.address_number) setBillingAddressNumber(p.address_number);
    })();
  }, [paymentOpen, user?.id]);

  // Função que busca o endereço automaticamente via API
  const handleCepChange = async (value: string) => {
    const cep = value.replace(/\D/g, "");
    setBusinessData(d => ({ ...d, cep: cep.replace(/^(\d{5})(\d{3})/, "$1-$2") }));

    if (cep.length === 8) {
      setSearchingCep(true);
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await res.json();
        if (data.erro) {
          toast({ title: "CEP não encontrado", variant: "destructive" });
          setShowFullAddress(false);
        } else {
          setBusinessData(d => ({
            ...d,
            street: data.logradouro,
            neighborhood: data.bairro,
            city: data.localidade,
            state: data.uf
          }));
          setShowFullAddress(true);
        }
      } catch (error) {
        toast({ title: "Erro ao buscar CEP", variant: "destructive" });
      } finally {
        setSearchingCep(false);
      }
    }
  };

  // Downgrade & Cancel states
  const [downgradeOpen, setDowngradeOpen] = useState(false);
  const [downgradePlanId, setDowngradePlanId] = useState<string | null>(null);
  const [downgrading, setDowngrading] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!user) {
      setProStatusLoaded(true);
      return;
    }
    const load = async () => {
      setProStatusLoaded(false);
      const { data: pro } = await supabase
        .from("professionals")
        .select("profile_status")
        .eq("user_id", user.id)
        .maybeSingle();
      setProStatus(pro?.profile_status ?? null);

      const { data: plansData } = await supabase.from("plans").select("id, features");
      if (plansData) {
        const feats: Record<string, string[]> = {};
        plansData.forEach(p => {
          if (p.features && p.features.length > 0) {
            feats[p.id] = p.features;
          }
        });
        setPlanFeaturesDb(feats);
      }
      setProStatusLoaded(true);
    };
    load();
  }, [user]);

  // Carregar produtos IAP no iOS quando abrir o modal de pagamento
  useEffect(() => {
    if (useIAPOnIOS && isIAPAvailable && paymentOpen) {
      loadProducts();
    }
  }, [useIAPOnIOS, isIAPAvailable, paymentOpen, loadProducts]);

  if (profile && profile.user_type === "client") {
    return (
      <AppLayout>
        <main className="max-w-screen-lg mx-auto px-4 py-12 text-center">
          <p className="text-muted-foreground">Os planos são exclusivos para profissionais e empresas.</p>
          <div className="flex flex-col items-center gap-3 mt-6">
            <Link
              to="/signup-pro"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors"
            >
              Tornar-se profissional
            </Link>
            <Link to="/home" className="text-primary text-sm hover:underline">Voltar ao início</Link>
          </div>
        </main>
      </AppLayout>
    );
  }

  const isProOrCompany =
    profile && (profile.user_type === "professional" || profile.user_type === "company");
  if (isProOrCompany && !proStatusLoaded) {
    return (
      <AppLayout>
        <main className="max-w-screen-lg mx-auto px-4 py-16 flex justify-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </main>
      </AppLayout>
    );
  }

  /** Aprovação interna no admin (Profissionais → Aprovar cadastro), distinta do Asaas */
  const cadastroInternoLiberado =
    profile?.user_type === "company" || proStatus === "approved";

  const handleSelectPlan = (planId: string) => {
    if (
      profile?.user_type === "professional" &&
      !cadastroInternoLiberado &&
      planId !== "free"
    ) {
      toast({
        title: "Cadastro em análise",
        description:
          "Os planos pagos ficam disponíveis após a aprovação interna da equipe Chamô.",
        variant: "destructive",
      });
      return;
    }
    // No iOS usamos IAP para todos os planos pagos (incluindo Business); na web Business vai para checkout
    if (planId === "business" && !useIAPOnIOS) {
      navigate("/checkout/business");
      return;
    }

    if (planId === currentPlan?.id) return;

    const targetPlan = plans.find(p => p.id === planId);
    const isDowngrade = targetPlan && currentPlan && targetPlan.price_monthly < currentPlan.price_monthly;

    if (isDowngrade && planId !== "free") {
      setDowngradePlanId(planId);
      setDowngradeOpen(true);
      return;
    }

    if (planId === "free") {
      setDowngradePlanId("free");
      setDowngradeOpen(true);
      return;
    }

    setSelectedPlanId(planId);
    setCardForm({ number: "", name: "", expiry: "", cvv: "", address: "", cpf: "" });
    setBusinessData({ cnpj: "", cep: "", street: "", number: "", neighborhood: "", city: "", state: "" });
    setProofFile(null);
    setShowFullAddress(false);
    setPaymentOpen(true);
  };

  const handleDowngradeConfirm = async () => {
    if (!downgradePlanId) return;
    setDowngrading(true);
    const ok = await changePlan(downgradePlanId);
    if (ok) {
      if (downgradePlanId !== "business") {
        await supabase.from("profiles").update({ user_type: "professional" }).eq("user_id", user?.id);
      }
      toast({ title: "Plano alterado com sucesso!", description: "Seus benefícios foram ajustados." });
    } else {
      toast({ title: "Erro ao alterar plano.", variant: "destructive" });
    }
    setDowngrading(false);
    setDowngradeOpen(false);
  };

  const handleCancelSubscription = async () => {
    if (!user) return;
    setCancelling(true);
    const ok = await changePlan("free");
    if (ok) {
      await supabase.from("profiles").update({ user_type: "professional" }).eq("user_id", user.id);
      toast({ title: "Assinatura cancelada", description: "Você voltou para o plano Grátis." });
    } else {
      toast({ title: "Erro ao cancelar assinatura.", variant: "destructive" });
    }
    setCancelling(false);
    setCancelOpen(false);
  };

  const formatCNPJ = (value: string) => {
    return value
      .replace(/\D/g, "")
      .replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
      .slice(0, 18);
  };

  const handlePaymentSubmit = async () => {
    if (!selectedPlanId) return;
    if (profile?.user_type === "professional" && !cadastroInternoLiberado && selectedPlanId !== "free") {
      toast({
        title: "Cadastro em análise",
        description: "Aguarde a aprovação interna para contratar planos pagos.",
        variant: "destructive",
      });
      return;
    }
    if (!cardForm.number || !cardForm.name || !cardForm.expiry || !cardForm.cvv) {
      toast({ title: "Preencha todos os dados do cartão", variant: "destructive" });
      return;
    }
    if (!validateCpf(cardForm.cpf)) {
      toast({ title: "CPF obrigatório", description: "Informe um CPF válido (11 dígitos).", variant: "destructive" });
      return;
    }

    if (selectedPlanId === "business") {
      if (!businessData.cnpj || !businessData.cep || !businessData.number || !proofFile) {
        toast({ title: "CNPJ, CEP, Número e Comprovante são obrigatórios.", variant: "destructive" });
        return;
      }
    }

    if (cardForm.number.replace(/\s/g, "").length < 16) {
      toast({ title: "Número do cartão inválido", variant: "destructive" });
      return;
    }

    const postalDigits =
      selectedPlanId === "business"
        ? businessData.cep.replace(/\D/g, "")
        : billingCep.replace(/\D/g, "");
    const addrNum =
      selectedPlanId === "business"
        ? businessData.number.trim()
        : billingAddressNumber.trim();
    if (postalDigits.length !== 8 || !addrNum) {
      toast({
        title: "Endereço de cobrança",
        description:
          selectedPlanId === "business"
            ? "Preencha CEP e número na seção empresa."
            : "Informe CEP (8 dígitos) e número do endereço (exigido pelo Asaas).",
        variant: "destructive",
      });
      return;
    }

    setProcessing(true);
    try {
      let proofUrl = "";
      const fullAddress = `${businessData.street}, ${businessData.number} - ${businessData.neighborhood}, ${businessData.city}/${businessData.state} (CEP: ${businessData.cep})`;

      if (selectedPlanId === "business" && proofFile && user) {
        const fileExt = proofFile.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from("business-proofs")
          .upload(fileName, proofFile);
        if (uploadError) throw new Error("Erro ao enviar o comprovante de CNPJ.");
        const { data: urlData } = supabase.storage.from("business-proofs").getPublicUrl(fileName);
        proofUrl = urlData.publicUrl;
      }

      let { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { data: { session: refreshed } } = await supabase.auth.refreshSession();
        session = refreshed;
      }
      if (!session) throw new Error("Não autenticado");

      const { data: profileData } = await supabase
        .from("profiles")
        .select("full_name, email, cpf, cnpj, phone, address_zip, address_number")
        .eq("user_id", session.user.id)
        .single();

      const cpfCnpjValue = cardForm.cpf.replace(/\D/g, "") || profileData?.cnpj?.replace(/\D/g, "") || profileData?.cpf?.replace(/\D/g, "") || "";
      if (!cpfCnpjValue) {
        toast({ title: "CPF obrigatório", description: "Preencha o CPF no formulário.", variant: "destructive" });
        setProcessing(false);
        return;
      }

      const skipAnalysis = session.user.email?.toLowerCase() === "testes@appchamo.com";
      const finalStatus = selectedPlanId === "pro" || skipAnalysis ? "ACTIVE" : "PENDING";
      
      const { error: upsertError } = await supabase.from("subscriptions").upsert({
        user_id: session.user.id,
        plan_id: selectedPlanId,
        status: finalStatus,
        business_cnpj: businessData.cnpj || null,
        business_address: fullAddress || null,
        business_proof_url: proofUrl || null
      }, { onConflict: 'user_id' });
      

      if (upsertError) throw new Error("Erro ao registrar dados empresariais no banco.");

      const expiryParts = cardForm.expiry.split("/");
      const res = await supabase.functions.invoke("create_subscription", {
        body: {
          userId: session.user.id,
          planId: selectedPlanId,
          value: selectedPlan?.price_monthly || 0,
          holderName: cardForm.name,
          number: cardForm.number.replace(/\s/g, ""),
          expiryMonth: expiryParts[0],
          expiryYear: `20${expiryParts[1]}`,
          ccv: cardForm.cvv,
          email: profileData?.email || session.user.email || "",
          cpfCnpj: cpfCnpjValue,
          postalCode: postalDigits,
          addressNumber: addrNum,
          phone: profileData?.phone || "",
          cnpjBusiness: businessData.cnpj,
          addressBusiness: fullAddress,
          proofUrl: proofUrl,
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      const apiErr = res.data?.error;
      if (res.error || apiErr) {
        const msg = typeof apiErr === "string" ? apiErr : apiErr ? JSON.stringify(apiErr) : res.error?.message;
        throw new Error(msg || "Erro no processamento do pagamento.");
      }

      if (finalStatus === "ACTIVE") {
        toast({ title: "Plano Pro Ativado!", description: "Seu pagamento foi processado e o plano já está liberado." });
      } else {
        toast({ title: "Assinatura pré-aprovada!", description: "Seu plano entrará em vigor após aprovação do administrador." });
      }
      
      setPaymentOpen(false);
      await refetch();

    } catch (err: any) {
      toast({ title: err.message || "Erro ao processar assinatura", variant: "destructive" });
    }
    setProcessing(false);
  };

  const handleIAPPurchase = async () => {
    if (!selectedPlanId || selectedPlanId === "free" || !user) return;
    if (profile?.user_type === "professional" && !cadastroInternoLiberado) {
      toast({
        title: "Cadastro em análise",
        description: "Aguarde a aprovação interna para contratar planos pagos.",
        variant: "destructive",
      });
      return;
    }
    const planId = selectedPlanId as "pro" | "vip" | "business";
    if (selectedPlanId === "business" && (!businessData.cnpj || !businessData.cep || !businessData.number || !proofFile)) {
      toast({ title: "CNPJ, CEP, Número e Comprovante são obrigatórios para o plano Business.", variant: "destructive" });
      return;
    }
    setProcessing(true);
    try {
      const result = await purchase(planId);
      if (!result) {
        setProcessing(false);
        return;
      }
      let { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { data: { session: refreshed } } = await supabase.auth.refreshSession();
        session = refreshed;
      }
      if (!session) throw new Error("Não autenticado");
      const res = await supabase.functions.invoke("validate_iap_subscription", {
        body: {
          userId: session.user.id,
          planId: result.planId,
          transactionId: result.transactionId,
          productIdentifier: result.productIdentifier,
          receipt: result.receipt ?? undefined,
          platform: result.platform,
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.error || res.data?.error) throw new Error(res.data?.error || "Erro ao ativar assinatura.");
      if (selectedPlanId === "business" && user && businessData.cnpj) {
        const fullAddress = `${businessData.street}, ${businessData.number} - ${businessData.neighborhood}, ${businessData.city}/${businessData.state} (CEP: ${businessData.cep})`;
        let proofUrl = "";
        if (proofFile) {
          const fileExt = proofFile.name.split(".").pop();
          const fileName = `${user.id}/${Date.now()}.${fileExt}`;
          const { error: uploadError } = await supabase.storage.from("business-proofs").upload(fileName, proofFile);
          if (!uploadError) {
            const { data: urlData } = supabase.storage.from("business-proofs").getPublicUrl(fileName);
            proofUrl = urlData.publicUrl;
          }
        }
        await supabase.from("subscriptions").update({
          business_cnpj: businessData.cnpj,
          business_address: fullAddress,
          business_proof_url: proofUrl || null,
        }).eq("user_id", user.id);
      }
      toast({ title: "Plano ativado!", description: "Sua assinatura foi confirmada pela App Store." });
      setPaymentOpen(false);
      await refetch();
    } catch (err: any) {
      toast({ title: err.message || "Erro na compra", variant: "destructive" });
    }
    setProcessing(false);
  };

  const handleRestorePurchases = async () => {
    if (!user) return;
    try {
      const results = await restore();
      if (results.length === 0) {
        toast({ title: "Nenhuma compra encontrada para restaurar.", variant: "destructive" });
        return;
      }
      let { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { data: { session: refreshed } } = await supabase.auth.refreshSession();
        session = refreshed;
      }
      if (!session) throw new Error("Não autenticado");
      const best = results.sort((a, b) => (a.planId === "business" ? 3 : a.planId === "vip" ? 2 : 1) - (b.planId === "business" ? 3 : b.planId === "vip" ? 2 : 1)).pop();
      if (best) {
        const res = await supabase.functions.invoke("validate_iap_subscription", {
          body: {
            userId: session.user.id,
            planId: best.planId,
            transactionId: best.transactionId,
            productIdentifier: best.productIdentifier,
            receipt: best.receipt ?? undefined,
            platform: best.platform,
          },
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.error && !res.data?.error) {
          toast({ title: "Compras restauradas!", description: `Plano ${best.planId} ativado.` });
          setPaymentOpen(false);
          await refetch();
        }
      }
    } catch (err: any) {
      toast({ title: err.message || "Erro ao restaurar", variant: "destructive" });
    }
  };

  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
  };

  const formatExpiry = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    if (digits.length > 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return digits;
  };

  const formatPrice = (price: number) => {
    if (price === 0) return "Grátis";
    return `R$ ${price.toFixed(2).replace(".", ",")}/mês`;
  };

  const selectedPlan = plans.find(p => p.id === selectedPlanId);

  const plansVisiveis =
    profile?.user_type === "professional" && !cadastroInternoLiberado
      ? plans.filter((p) => p.id === "free")
      : plans;

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5">
        <Link to="/profile" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>
        <h1 className="text-xl font-bold text-foreground mb-1">Planos</h1>
        <p className="text-sm text-muted-foreground mb-5">Escolha o plano ideal para crescer na Chamô</p>

        {profile?.user_type === "professional" && !cadastroInternoLiberado && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-5">
            <p className="text-sm font-medium text-foreground flex items-start gap-2">
              <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <span>
                Seu cadastro profissional está em <strong>análise interna</strong>. Você pode usar o plano{" "}
                <strong>Free</strong> com as chamadas incluídas. Os planos pagos (Pro, VIP, Business) aparecerão
                após a equipe aprovar seu cadastro no painel administrativo.
              </span>
            </p>
          </div>
        )}

        {isFreePlan && (
          <div className="bg-accent border border-primary/20 rounded-xl p-4 mb-5">
            <p className="text-sm font-medium text-foreground">
              Você está no plano <strong>Free</strong> — {callsRemaining > 0 ? `${callsRemaining} chamada${callsRemaining !== 1 ? "s" : ""} restante${callsRemaining !== 1 ? "s" : ""}` : "limite atingido"}
            </p>
            {callsRemaining <= 0 && (
              <p className="text-xs text-destructive mt-1">Faça upgrade para continuar atendendo clientes.</p>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
            <p className="text-sm text-muted-foreground">Carregando planos...</p>
          </div>
        ) : plansVisiveis.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <p className="text-sm text-muted-foreground">Não foi possível carregar os planos.</p>
            <Link to="/home" className="text-primary text-sm font-medium hover:underline">Voltar ao início</Link>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {plansVisiveis.map((p) => {
              const details = planDetails.find((d) => d.id === p.id);
              if (!details) return null;
              const isCurrent = currentPlan?.id === p.id;
              const Icon = details.icon;
              const isRecommended = (details as any).recommended;

              const displayFeatures = planFeaturesDb[p.id] || details.features;

              return (
                <div
                  key={p.id}
                  className={`relative bg-card border-2 rounded-2xl p-5 shadow-card transition-all ${
                    isRecommended ? "border-amber-500 ring-2 ring-amber-500/20 scale-[1.02]" : isCurrent ? "border-primary ring-2 ring-primary/20" : "border-border"
                  }`}
                >
                  {isRecommended && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 text-white text-[11px] font-bold uppercase tracking-wide shadow-lg">
                      ⭐ Recomendado
                    </span>
                  )}

                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-10 h-10 rounded-xl ${isRecommended ? "bg-amber-500/10" : "bg-accent"} flex items-center justify-center`}>
                        <Icon className={`w-5 h-5 ${isRecommended ? "text-amber-500" : details.color}`} />
                      </div>
                      <div>
                        <h3 className={`font-bold ${isRecommended ? "text-lg" : ""} text-foreground`}>{p.name}</h3>
                        <p className={`font-semibold ${isRecommended ? "text-amber-500 text-lg" : "text-primary text-sm"}`}>{formatPrice(p.price_monthly)}</p>
                      </div>
                    </div>
                    {isCurrent && (
                      <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-bold">Atual</span>
                    )}
                  </div>

                  <ul className="flex flex-col gap-1.5 mb-4">
                    {displayFeatures.map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Check className={`w-3.5 h-3.5 ${isRecommended ? "text-amber-500" : "text-primary"} flex-shrink-0`} />
                        {f}
                      </li>
                    ))}
                  </ul>

                  {isCurrent ? (
                    <div className="space-y-2">
                      <button disabled className="w-full py-2.5 rounded-xl border text-sm font-medium text-muted-foreground cursor-default">Plano atual</button>
                      {p.id !== "free" && (
                        <button onClick={() => setCancelOpen(true)} className="w-full text-[11px] text-muted-foreground hover:text-destructive transition-colors">Cancelar assinatura</button>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => handleSelectPlan(p.id)}
                      disabled={changing !== null}
                      className={`w-full py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${
                        isRecommended ? "bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-lg" : p.price_monthly > (currentPlan?.price_monthly || 0) ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border text-foreground hover:bg-muted"
                      }`}
                    >
                      {changing === p.id ? "Processando..." : p.price_monthly > (currentPlan?.price_monthly || 0) ? "Fazer upgrade" : "Mudar plano"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center mt-6">Assinatura mensal com renovação automática. Cancele a qualquer momento.</p>
        <p className="text-xs text-muted-foreground text-center mt-2">
          <Link to="/terms-of-use" className="text-primary hover:underline">Termos de Uso (EULA)</Link>
          {" · "}
          <Link to="/privacy" className="text-primary hover:underline">Política de Privacidade</Link>
        </p>
        {useIAPOnIOS && isIAPAvailable && (
          <p className="text-center mt-2">
            <button type="button" onClick={handleRestorePurchases} disabled={restoring} className="text-sm text-primary hover:underline disabled:opacity-50">
              {restoring ? "Restaurando compras..." : "Restaurar compras"}
            </button>
          </p>
        )}

        <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
          <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {useIAPOnIOS && isIAPAvailable ? (
                  <Smartphone className="w-5 h-5 text-primary" />
                ) : (
                  <CreditCard className="w-5 h-5 text-primary" />
                )}
                {useIAPOnIOS && isIAPAvailable ? "Assinatura na App Store" : "Dados do pagamento"}
              </DialogTitle>
            </DialogHeader>
            {selectedPlan && (
              <div className="space-y-4">
                <div className="bg-muted/50 rounded-xl p-3 text-center">
                  <p className="text-xs text-muted-foreground">Plano {selectedPlan.name}</p>
                  {useIAPOnIOS && isIAPAvailable && (() => {
                    const iapProduct = products.find(p => getProductIdForPlan(selectedPlanId!) === p.identifier);
                    return iapProduct ? (
                      <p className="text-xl font-bold text-foreground">{iapProduct.priceString}<span className="text-sm font-normal text-muted-foreground">/mês</span></p>
                    ) : loadingProducts ? (
                      <p className="text-sm text-muted-foreground">Carregando preço...</p>
                    ) : (
                      <p className="text-xl font-bold text-foreground">R$ {selectedPlan.price_monthly.toFixed(2).replace(".", ",")}<span className="text-sm font-normal text-muted-foreground">/mês</span></p>
                    );
                  })()}
                  {(!useIAPOnIOS || !isIAPAvailable) && (
                    <p className="text-xl font-bold text-foreground">R$ {selectedPlan.price_monthly.toFixed(2).replace(".", ",")}<span className="text-sm font-normal text-muted-foreground">/mês</span></p>
                  )}
                </div>

                {useIAPOnIOS && isIAPAvailable ? (
                  <>
                    {!loadingProducts && products.length === 0 && (
                      <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-center">
                        <p className="text-sm font-medium text-foreground">Os planos da App Store não foram carregados.</p>
                        <p className="text-xs text-muted-foreground mt-2">• Use um iPhone (não Simulador) e instale pelo TestFlight.</p>
                        <p className="text-xs text-muted-foreground">• Em Ajustes → App Store, use uma conta Sandbox.</p>
                        <p className="text-xs text-muted-foreground">• No Xcode: Edit Scheme → Run → Options → StoreKit Configuration = None.</p>
                        <p className="text-xs text-muted-foreground mt-1">• Crie uma nova versão (ex.: 1.1), envie um build, adicione as assinaturas à versão e aguarde alguns minutos.</p>
                      </div>
                    )}
                    {selectedPlanId === "business" && (
                      <div className="bg-violet-500/5 border border-violet-500/20 rounded-xl p-4 space-y-3">
                        <p className="text-[10px] font-bold text-violet-600 uppercase flex items-center gap-1">
                          <Building2 className="w-3 h-3" /> Verificação Empresa
                        </p>
                        <div className="space-y-3">
                          <div>
                            <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">CNPJ</label>
                            <input
                              value={businessData.cnpj}
                              onChange={(e) => setBusinessData(d => ({ ...d, cnpj: formatCNPJ(e.target.value) }))}
                              placeholder="00.000.../0001-00"
                              className="w-full border-b bg-transparent py-1 text-sm outline-none focus:border-violet-500"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1 mb-1 block">CEP {searchingCep && <Clock className="w-2 h-2 animate-spin" />}</label>
                            <input
                              value={businessData.cep}
                              onChange={(e) => handleCepChange(e.target.value)}
                              placeholder="00000-000"
                              maxLength={9}
                              className="w-full border-b bg-transparent py-1 text-sm outline-none focus:border-violet-500"
                            />
                          </div>
                        </div>
                        {showFullAddress && (
                          <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                            <div className="grid grid-cols-4 gap-2">
                              <div className="col-span-3">
                                <label className="text-[10px] font-bold text-muted-foreground uppercase">Rua</label>
                                <input readOnly value={businessData.street} className="w-full border-b bg-transparent py-1 text-sm text-muted-foreground outline-none" />
                              </div>
                              <div>
                                <label className="text-[10px] font-bold text-emerald-600 uppercase">Nº *</label>
                                <input
                                  value={businessData.number}
                                  onChange={(e) => setBusinessData(d => ({ ...d, number: e.target.value }))}
                                  placeholder="123"
                                  className="w-full border-b border-emerald-500/50 bg-transparent py-1 text-sm font-bold text-emerald-700 outline-none"
                                />
                              </div>
                            </div>
                            <label className="border-2 border-dashed border-violet-300 rounded-xl p-3 text-center cursor-pointer hover:bg-violet-50 transition-colors block">
                              <input type="file" hidden accept="application/pdf" onChange={(e) => setProofFile(e.target.files?.[0] || null)} />
                              {proofFile ? (
                                <span className="text-xs text-emerald-600 font-bold flex items-center justify-center gap-1">
                                  <Check className="w-4 h-4" /> Comprovante OK!
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-muted-foreground uppercase flex items-center justify-center gap-1">
                                  <Upload className="w-3 h-3" /> Anexar Cartão CNPJ (PDF)
                                </span>
                              )}
                            </label>
                          </div>
                        )}
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground text-center">
                      Assinatura mensal, renovação automática.{" "}
                      <Link to="/terms-of-use" className="text-primary hover:underline">Termos de Uso (EULA)</Link>
                      {" · "}
                      <Link to="/privacy" className="text-primary hover:underline">Política de Privacidade</Link>
                    </p>
                    <button
                      onClick={handleIAPPurchase}
                      disabled={
                        processing ||
                        purchasing ||
                        loadingProducts ||
                        (selectedPlanId === "business" && (!businessData.cnpj || !businessData.cep || !businessData.number || !proofFile)) ||
                        !products.some((p) => getProductIdForPlan(selectedPlanId!) === p.identifier)
                      }
                      className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {processing || purchasing ? (
                        <><div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> Processando...</>
                      ) : loadingProducts || !products.some((p) => getProductIdForPlan(selectedPlanId!) === p.identifier) ? (
                        <>Aguardando preços da App Store...</>
                      ) : (
                        <>Assinar com Apple</>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleRestorePurchases}
                      disabled={restoring}
                      className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                    >
                      {restoring ? "Restaurando..." : "Restaurar compras"}
                    </button>
                  </>
                ) : (
                  <>
                {selectedPlanId === "business" && (
                  <div className="bg-violet-500/5 border border-violet-500/20 rounded-xl p-4 space-y-3">
                    <p className="text-[10px] font-bold text-violet-600 uppercase flex items-center gap-1">
                      <Building2 className="w-3 h-3" /> Verificação Empresa
                    </p>
                    
                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">CNPJ</label>
                        <input 
                          value={businessData.cnpj} 
                          onChange={(e) => setBusinessData(d => ({ ...d, cnpj: formatCNPJ(e.target.value) }))}
                          placeholder="00.000.../0001-00"
                          className="w-full border-b bg-transparent py-1 text-sm outline-none focus:border-violet-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1 mb-1 block">
                          CEP {searchingCep && <Clock className="w-2 h-2 animate-spin" />}
                        </label>
                        <input 
                          value={businessData.cep} 
                          onChange={(e) => handleCepChange(e.target.value)}
                          placeholder="00000-000"
                          maxLength={9}
                          className="w-full border-b bg-transparent py-1 text-sm outline-none focus:border-violet-500"
                        />
                      </div>
                    </div>

                    {showFullAddress && (
                      <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                        <div className="grid grid-cols-4 gap-2">
                          <div className="col-span-3">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase">Rua</label>
                            <input readOnly value={businessData.street} className="w-full border-b bg-transparent py-1 text-sm text-muted-foreground outline-none" />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-emerald-600 uppercase">Nº *</label>
                            <input 
                              value={businessData.number} 
                              onChange={(e) => setBusinessData(d => ({ ...d, number: e.target.value }))}
                              placeholder="123"
                              className="w-full border-b border-emerald-500/50 bg-transparent py-1 text-sm font-bold text-emerald-700 outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ✅ AJUSTE ANDROID: Usando tag <label> nativa para upload nos outros planos */}
                    <label className="border-2 border-dashed border-violet-300 rounded-xl p-3 text-center cursor-pointer hover:bg-violet-50 transition-colors block">
                      <input type="file" hidden accept="application/pdf" onChange={(e) => setProofFile(e.target.files?.[0] || null)} />
                      {proofFile ? (
                        <span className="text-xs text-emerald-600 font-bold flex items-center justify-center gap-1">
                          <Check className="w-4 h-4" /> Comprovante OK!
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-muted-foreground uppercase flex items-center justify-center gap-1">
                          <Upload className="w-3 h-3" /> Anexar Cartão CNPJ (PDF)
                        </span>
                      )}
                    </label>
                  </div>
                )}

                <form autoComplete="on" className="space-y-3" onSubmit={(e) => e.preventDefault()}>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1"><CreditCard className="w-3 h-3" /> Dados do Cartão</p>
                  <div>
                    <label htmlFor="plans-card-cpf" className="text-xs font-medium text-muted-foreground mb-1 block">CPF do titular *</label>
                    <input id="plans-card-cpf" value={cardForm.cpf} onChange={(e) => setCardForm(f => ({ ...f, cpf: formatCpf(e.target.value) }))} placeholder="000.000.000-00" maxLength={14} autoComplete="off" className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 font-mono" />
                  </div>
                  <div>
                    <label htmlFor="plans-cc-name" className="text-xs font-medium text-muted-foreground mb-1 block">Nome no cartão</label>
                    <input id="plans-cc-name" name="cc-name" value={cardForm.name} onChange={(e) => setCardForm(f => ({ ...f, name: e.target.value.toUpperCase() }))} placeholder="NOME COMPLETO" autoComplete="cc-name" className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 uppercase" />
                  </div>
                  <div>
                    <label htmlFor="plans-cc-number" className="text-xs font-medium text-muted-foreground mb-1 block">Número do cartão</label>
                    <input id="plans-cc-number" name="cc-number" value={cardForm.number} onChange={(e) => setCardForm(f => ({ ...f, number: formatCardNumber(e.target.value) }))} placeholder="0000 0000 0000 0000" maxLength={19} inputMode="numeric" autoComplete="cc-number" className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 font-mono" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="plans-cc-exp" className="text-xs font-medium text-muted-foreground mb-1 block">Validade</label>
                      <input id="plans-cc-exp" name="cc-exp" value={cardForm.expiry} onChange={(e) => setCardForm(f => ({ ...f, expiry: formatExpiry(e.target.value) }))} placeholder="MM/AA" maxLength={5} inputMode="numeric" autoComplete="cc-exp" className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 font-mono" />
                    </div>
                    <div>
                      <label htmlFor="plans-cc-csc" className="text-xs font-medium text-muted-foreground mb-1 block">CVV</label>
                      <input id="plans-cc-csc" name="cc-csc" value={cardForm.cvv} onChange={(e) => setCardForm(f => ({ ...f, cvv: e.target.value.replace(/\D/g, "").slice(0, 4) }))} placeholder="123" maxLength={4} type="password" inputMode="numeric" autoComplete="cc-csc" className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 font-mono" />
                    </div>
                  </div>
                </form>

                {selectedPlanId !== "business" && (
                  <div className="space-y-2 pt-2 border-t border-border">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase">Endereço de cobrança</p>
                    <p className="text-[11px] text-muted-foreground">Obrigatório para o Asaas processar o cartão.</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="subs-billing-cep" className="text-xs font-medium text-muted-foreground mb-1 block">CEP *</label>
                        <input
                          id="subs-billing-cep"
                          value={billingCep}
                          onChange={(e) => setBillingCep(formatCep(e.target.value))}
                          placeholder="00000-000"
                          maxLength={9}
                          inputMode="numeric"
                          autoComplete="postal-code"
                          className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 font-mono"
                        />
                      </div>
                      <div>
                        <label htmlFor="subs-billing-num" className="text-xs font-medium text-muted-foreground mb-1 block">Número *</label>
                        <input
                          id="subs-billing-num"
                          value={billingAddressNumber}
                          onChange={(e) => setBillingAddressNumber(e.target.value)}
                          placeholder="Ex.: 120"
                          className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <button onClick={handlePaymentSubmit} disabled={processing} className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {processing ? <><div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> Processando...</> : <><Lock className="w-4 h-4" /> Assinar Plano</>}
                </button>
                <p className="text-[10px] text-muted-foreground text-center flex items-center justify-center gap-1"><Lock className="w-3 h-3" /> Pagamento seguro e criptografado</p>
                  </>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={downgradeOpen} onOpenChange={setDowngradeOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-500" /> Tem certeza?</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                <p className="text-sm text-foreground font-medium">Ao mudar para um plano inferior, você poderá perder benefícios.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setDowngradeOpen(false)} className="flex-1 py-2.5 rounded-xl border text-sm font-medium text-foreground hover:bg-muted transition-colors">Cancelar</button>
                <button onClick={handleDowngradeConfirm} disabled={downgrading} className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground font-semibold text-sm hover:bg-destructive/90 transition-colors">Confirmar mudança</button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-destructive" /> Cancelar assinatura</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Ao cancelar, você voltará para o plano <strong>Grátis</strong>.</p>
              <div className="flex gap-2">
                <button onClick={() => setCancelOpen(false)} className="flex-1 py-2.5 rounded-xl border text-sm font-medium text-foreground hover:bg-muted transition-colors">Mantêr plano</button>
                <button onClick={handleCancelSubscription} disabled={cancelling} className="flex-1 py-2.5 rounded-xl bg-destructive text-white font-semibold text-sm">Confirmar Cancelamento</button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </AppLayout>
  );
};

export default Subscriptions;