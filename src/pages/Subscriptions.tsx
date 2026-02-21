import AppLayout from "@/components/AppLayout";
import { Check, Crown, Star, Zap, Building2, ArrowLeft, CreditCard, Lock, Clock, AlertTriangle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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

type EnterpriseStep = "cnpj" | "card";

const Subscriptions = () => {
  const navigate = useNavigate();
  const { plan: currentPlan, plans, loading, changePlan, callsUsed, callsRemaining, isFreePlan } = useSubscription();
  const { user, profile } = useAuth();
  const [changing, setChanging] = useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [cardForm, setCardForm] = useState({ number: "", name: "", expiry: "", cvv: "", address: "" });
  const [processing, setProcessing] = useState(false);
  const [proStatus, setProStatus] = useState<string | null>(null);

  // Enterprise upgrade state
  const [enterpriseOpen, setEnterpriseOpen] = useState(false);
  const [enterpriseStep, setEnterpriseStep] = useState<EnterpriseStep>("cnpj");
  const [enterpriseForm, setEnterpriseForm] = useState({
    cnpj: "", companyName: "", cadastralStatus: "",
    addressZip: "", addressStreet: "", addressNumber: "",
    addressComplement: "", addressNeighborhood: "", addressCity: "", addressState: "",
  });
  const [enterpriseCard, setEnterpriseCard] = useState({ number: "", name: "", expiry: "", cvv: "" });
  const [enterpriseProcessing, setEnterpriseProcessing] = useState(false);
  const [pendingEnterprise, setPendingEnterprise] = useState(false);

  // VIP upgrade state (similar to enterprise, needs analysis)
  const [pendingVip, setPendingVip] = useState(false);

  // Downgrade confirmation
  const [downgradeOpen, setDowngradeOpen] = useState(false);
  const [downgradePlanId, setDowngradePlanId] = useState<string | null>(null);
  const [downgrading, setDowngrading] = useState(false);

  // Cancel subscription
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: pro } = await supabase
        .from("professionals")
        .select("profile_status")
        .eq("user_id", user.id)
        .maybeSingle();
      if (pro) setProStatus(pro.profile_status);

      // Check if already has pending enterprise request
      const { data: req } = await supabase
        .from("enterprise_upgrade_requests" as any)
        .select("id, status")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .maybeSingle();
      if (req) setPendingEnterprise(true);

      // Check for pending VIP request (stored as enterprise_upgrade_requests with plan_type = vip)
      const { data: vipReq } = await supabase
        .from("enterprise_upgrade_requests" as any)
        .select("id, status")
        .eq("user_id", user.id)
        .eq("status", "pending_vip")
        .maybeSingle();
      if (vipReq) setPendingVip(true);
    };
    load();
  }, [user]);

  if (profile && profile.user_type === "client") {
    return (
      <AppLayout>
        <main className="max-w-screen-lg mx-auto px-4 py-12 text-center">
          <p className="text-muted-foreground">Os planos são exclusivos para profissionais e empresas.</p>
          <Link to="/home" className="text-primary text-sm mt-4 inline-block hover:underline">Voltar ao início</Link>
        </main>
      </AppLayout>
    );
  }

  if (proStatus === "pending") {
    return (
      <AppLayout>
        <main className="max-w-screen-lg mx-auto px-4 py-12 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center">
              <Clock className="w-7 h-7 text-amber-600" />
            </div>
            <h2 className="text-lg font-bold text-foreground">Perfil em análise</h2>
            <p className="text-sm text-muted-foreground max-w-xs">
              Seu perfil profissional ainda está sendo analisado. Você poderá escolher um plano assim que a análise for concluída.
            </p>
            <Link to="/home" className="text-primary text-sm mt-2 hover:underline">Voltar ao início</Link>
          </div>
        </main>
      </AppLayout>
    );
  }

  const handleSelectPlan = (planId: string) => {
    if (planId === currentPlan?.id) return;

    const targetPlan = plans.find(p => p.id === planId);
    const isDowngrade = targetPlan && currentPlan && targetPlan.price_monthly < currentPlan.price_monthly;

    // Downgrade confirmation
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

    // Enterprise plan → special flow
    if (planId === "business") {
      if (pendingEnterprise) {
        toast({ title: "Você já possui uma solicitação empresarial em análise." });
        return;
      }
      setEnterpriseStep("cnpj");
      setEnterpriseForm({
        cnpj: profile?.cnpj || "", companyName: "", cadastralStatus: "",
        addressZip: "", addressStreet: "", addressNumber: "",
        addressComplement: "", addressNeighborhood: "", addressCity: "", addressState: "",
      });
      setEnterpriseCard({ number: "", name: "", expiry: "", cvv: "" });
      setEnterpriseOpen(true);
      return;
    }

    // VIP plan → needs analysis like enterprise
    if (planId === "vip") {
      if (pendingVip) {
        toast({ title: "Você já possui uma solicitação VIP em análise." });
        return;
      }
      setEnterpriseStep("card");
      setEnterpriseCard({ number: "", name: "", expiry: "", cvv: "" });
      setSelectedPlanId("vip");
      setEnterpriseOpen(true);
      return;
    }

    setSelectedPlanId(planId);
    setCardForm({ number: "", name: "", expiry: "", cvv: "", address: "" });
    setPaymentOpen(true);
  };

  const handleDowngradeConfirm = async () => {
    if (!downgradePlanId) return;
    setDowngrading(true);
    const ok = await changePlan(downgradePlanId);
    if (ok) {
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
      toast({ title: "Assinatura cancelada", description: "Você voltou para o plano Grátis." });
    } else {
      toast({ title: "Erro ao cancelar assinatura.", variant: "destructive" });
    }
    setCancelling(false);
    setCancelOpen(false);
  };

  const handleChangePlan = async (planId: string) => {
    setChanging(planId);
    const ok = await changePlan(planId);
    if (ok) {
      toast({ title: "Plano atualizado com sucesso!" });
    } else {
      toast({ title: "Erro ao atualizar plano. Tente novamente.", variant: "destructive" });
    }
    setChanging(null);
  };

  const handlePaymentSubmit = async () => {
    if (!selectedPlanId) return;
    if (!cardForm.number || !cardForm.name || !cardForm.expiry || !cardForm.cvv) {
      toast({ title: "Preencha todos os dados do cartão", variant: "destructive" });
      return;
    }
    if (cardForm.number.replace(/\s/g, "").length < 16) {
      toast({ title: "Número do cartão inválido", variant: "destructive" });
      return;
    }
    setProcessing(true);
    try {
      const expiryParts = cardForm.expiry.split("/");
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Não autenticado");

      const { data: profileData } = await supabase
        .from("profiles")
        .select("full_name, email, cpf, cnpj, phone, address_zip, address_number, asaas_customer_id")
        .eq("user_id", session.user.id)
        .single();

      if (!profileData?.cpf && !profileData?.cnpj) {
        toast({ title: "Cadastre seu CPF ou CNPJ no perfil antes de assinar um plano.", variant: "destructive" });
        setProcessing(false);
        return;
      }

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
    email: profileData?.email || "",
    cpfCnpj: profileData?.cnpj || profileData?.cpf || "",
    postalCode: profileData?.address_zip || "",
    addressNumber: profileData?.address_number || "",
  },
});

      if (res.error || res.data?.error) {
        throw new Error(res.data?.error || "Erro ao processar pagamento");
      }

      const newPlan = plans.find(p => p.id === selectedPlanId);
      if (newPlan) {
        await changePlan(selectedPlanId);
      }
      toast({ title: "Assinatura ativada com sucesso!" });
      setPaymentOpen(false);
    } catch (err: any) {
      toast({ title: err.message || "Erro ao processar pagamento", variant: "destructive" });
    }
    setProcessing(false);
  };

  // VIP/Enterprise flow: submit card for analysis
  const handleVipEnterpriseCardSubmit = async () => {
    const isVip = selectedPlanId === "vip";
    const card = enterpriseCard;
    
    if (!card.number || !card.name || !card.expiry || !card.cvv) {
      toast({ title: "Preencha todos os dados do cartão", variant: "destructive" });
      return;
    }
    if (card.number.replace(/\s/g, "").length < 16) {
      toast({ title: "Número do cartão inválido", variant: "destructive" });
      return;
    }
    setEnterpriseProcessing(true);
    try {
      const expiryParts = card.expiry.split("/");
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Não autenticado");

      const { data: profileData } = await supabase
        .from("profiles")
        .select("full_name, email, cpf, cnpj, phone, address_zip, address_number, asaas_customer_id")
        .eq("user_id", session.user.id)
        .single();

      if (!profileData?.cpf && !profileData?.cnpj) {
        toast({ title: "Cadastre seu CPF ou CNPJ no perfil antes de prosseguir.", variant: "destructive" });
        setEnterpriseProcessing(false);
        return;
      }

      // Tokenize card without charging
      const res = await supabase.functions.invoke("create_payment", {
        body: {
          action: "tokenize_card_enterprise",
          cnpj: isVip ? (profileData?.cnpj || profileData?.cpf || "") : enterpriseForm.cnpj,
          credit_card: {
            holder_name: card.name,
            number: card.number,
            expiry_month: expiryParts[0],
            expiry_year: `20${expiryParts[1]}`,
            cvv: card.cvv,
          },
          credit_card_holder_info: {
            name: profileData?.full_name || card.name,
            email: profileData?.email || "",
            cpf_cnpj: profileData?.cpf || profileData?.cnpj || "",
            postal_code: isVip ? (profileData?.address_zip || "") : (enterpriseForm.addressZip || profileData?.address_zip || ""),
            address_number: isVip ? (profileData?.address_number || "") : (enterpriseForm.addressNumber || profileData?.address_number || ""),
            phone: profileData?.phone || "",
          },
        },
      });

      if (res.error || res.data?.error) {
        throw new Error(res.data?.error || "Erro ao tokenizar cartão");
      }

      if (isVip) {
        // Save VIP upgrade request
        await supabase.from("enterprise_upgrade_requests" as any).insert({
          user_id: session.user.id,
          cnpj: profileData?.cnpj || profileData?.cpf || "VIP",
          company_name: profileData?.full_name || "",
          status: "pending_vip",
          asaas_customer_id: res.data.customer_id,
          asaas_credit_card_token: res.data.credit_card_token,
        } as any);

        // Notify admins
        const { data: admins } = await supabase.from("user_roles").select("user_id").in("role", ["super_admin"]);
        if (admins) {
          for (const admin of admins) {
            await supabase.from("notifications").insert({
              user_id: admin.user_id,
              title: "Nova solicitação VIP",
              message: `${profileData?.full_name || "Usuário"} solicitou upgrade para o plano VIP e está aguardando análise.`,
              type: "admin",
              link: "/admin/pros",
            });
          }
        }

        setPendingVip(true);
        setEnterpriseOpen(false);
        toast({ title: "Solicitação enviada!", description: "Seu upgrade para VIP está em análise. Você será notificado quando for aprovado." });
      } else {
        // Enterprise flow
        await supabase.from("enterprise_upgrade_requests" as any).insert({
          user_id: session.user.id,
          cnpj: enterpriseForm.cnpj,
          company_name: enterpriseForm.companyName,
          cadastral_status: enterpriseForm.cadastralStatus,
          address_street: enterpriseForm.addressStreet,
          address_number: enterpriseForm.addressNumber,
          address_complement: enterpriseForm.addressComplement,
          address_neighborhood: enterpriseForm.addressNeighborhood,
          address_city: enterpriseForm.addressCity,
          address_state: enterpriseForm.addressState,
          address_zip: enterpriseForm.addressZip,
          asaas_customer_id: res.data.customer_id,
          asaas_credit_card_token: res.data.credit_card_token,
          status: "pending",
        } as any);

        // Notify admins
        const { data: admins } = await supabase.from("user_roles").select("user_id").in("role", ["super_admin"]);
        if (admins) {
          for (const admin of admins) {
            await supabase.from("notifications").insert({
              user_id: admin.user_id,
              title: "Nova solicitação Empresarial",
              message: `${profileData?.full_name || "Usuário"} solicitou upgrade para o plano Empresarial e está aguardando análise.`,
              type: "admin",
              link: "/admin/enterprise",
            });
          }
        }

        setPendingEnterprise(true);
        setEnterpriseOpen(false);
        toast({ title: "Solicitação enviada!", description: "Seu upgrade para Empresarial está em análise. Você será notificado quando for aprovado." });
      }
    } catch (err: any) {
      toast({ title: err.message || "Erro ao processar solicitação", variant: "destructive" });
    }
    setEnterpriseProcessing(false);
  };

  const handleEnterpriseCnpjNext = () => {
    if (!enterpriseForm.cnpj || enterpriseForm.cnpj.replace(/\D/g, "").length < 14) {
      toast({ title: "Informe um CNPJ válido", variant: "destructive" });
      return;
    }
    if (!enterpriseForm.cadastralStatus) {
      toast({ title: "Informe a situação cadastral", variant: "destructive" });
      return;
    }
    if (!enterpriseForm.addressStreet || !enterpriseForm.addressCity || !enterpriseForm.addressState) {
      toast({ title: "Preencha o endereço completo", variant: "destructive" });
      return;
    }
    setEnterpriseStep("card");
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

  const formatCnpj = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 14);
    return digits
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1/$2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  };

  const formatPrice = (price: number) => {
    if (price === 0) return "Grátis";
    return `R$ ${price.toFixed(2).replace(".", ",")}/mês`;
  };

  const selectedPlan = plans.find(p => p.id === selectedPlanId);
  const businessPlan = plans.find(p => p.id === "business");
  const vipPlan = plans.find(p => p.id === "vip");

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5">
        <Link to="/profile" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>
        <h1 className="text-xl font-bold text-foreground mb-1">Planos</h1>
        <p className="text-sm text-muted-foreground mb-5">Escolha o plano ideal para crescer na Chamô</p>

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

        {pendingEnterprise && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-5">
            <p className="text-sm font-medium text-amber-700 flex items-center gap-2">
              <Clock className="w-4 h-4" /> Sua solicitação para o plano Empresarial está em análise.
            </p>
          </div>
        )}

        {pendingVip && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-5">
            <p className="text-sm font-medium text-amber-700 flex items-center gap-2">
              <Clock className="w-4 h-4" /> Sua solicitação para o plano VIP está em análise.
            </p>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div>
        ) : (
          <div className="flex flex-col gap-4">
            {plans.map((p) => {
              const details = planDetails.find((d) => d.id === p.id);
              if (!details) return null;
              const isCurrent = currentPlan?.id === p.id;
              const Icon = details.icon;
              const isRecommended = (details as any).recommended;

              return (
                <div
                  key={p.id}
                  className={`relative bg-card border-2 rounded-2xl p-5 shadow-card transition-all ${
                    isRecommended
                      ? "border-amber-500 ring-2 ring-amber-500/20 scale-[1.02]"
                      : isCurrent
                      ? "border-primary ring-2 ring-primary/20"
                      : "border-border"
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
                      <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                        Atual
                      </span>
                    )}
                  </div>

                  <ul className="flex flex-col gap-1.5 mb-4">
                    {details.features.map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Check className={`w-3.5 h-3.5 ${isRecommended ? "text-amber-500" : "text-primary"} flex-shrink-0`} />
                        {f}
                      </li>
                    ))}
                  </ul>

                  {isCurrent ? (
                    <div className="space-y-2">
                      <button disabled className="w-full py-2.5 rounded-xl border text-sm font-medium text-muted-foreground cursor-default">
                        Plano atual
                      </button>
                      {p.id !== "free" && (
                        <button
                          onClick={() => setCancelOpen(true)}
                          className="w-full text-[11px] text-muted-foreground hover:text-destructive transition-colors"
                        >
                          Cancelar assinatura
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => handleSelectPlan(p.id)}
                      disabled={changing !== null || (p.id === "business" && pendingEnterprise) || (p.id === "vip" && pendingVip)}
                      className={`w-full py-3 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${
                        isRecommended
                          ? "bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:from-amber-600 hover:to-amber-700 shadow-lg"
                          : p.price_monthly > (currentPlan?.price_monthly || 0)
                          ? "bg-primary text-primary-foreground hover:bg-primary/90"
                          : "border text-foreground hover:bg-muted"
                      }`}
                    >
                      {changing === p.id
                        ? "Processando..."
                        : p.id === "business" && pendingEnterprise
                        ? "Em análise"
                        : p.id === "vip" && pendingVip
                        ? "Em análise"
                        : p.price_monthly > (currentPlan?.price_monthly || 0)
                        ? "Fazer upgrade"
                        : "Mudar plano"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center mt-6">
          A cobrança será processada mensalmente. Cancele a qualquer momento.
        </p>

        {/* Regular Payment Dialog (Pro) */}
        <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-primary" />
                Dados do cartão
              </DialogTitle>
            </DialogHeader>
            {selectedPlan && (
              <div className="space-y-4">
                <div className="bg-muted/50 rounded-xl p-3 text-center">
                  <p className="text-xs text-muted-foreground">Plano {selectedPlan.name}</p>
                  <p className="text-xl font-bold text-foreground">R$ {selectedPlan.price_monthly.toFixed(2).replace(".", ",")}<span className="text-sm font-normal text-muted-foreground">/mês</span></p>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Número do cartão</label>
                    <input value={cardForm.number} onChange={(e) => setCardForm(f => ({ ...f, number: formatCardNumber(e.target.value) }))} placeholder="0000 0000 0000 0000" maxLength={19} className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 font-mono" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome no cartão</label>
                    <input value={cardForm.name} onChange={(e) => setCardForm(f => ({ ...f, name: e.target.value.toUpperCase() }))} placeholder="NOME COMPLETO" className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 uppercase" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Validade</label>
                      <input value={cardForm.expiry} onChange={(e) => setCardForm(f => ({ ...f, expiry: formatExpiry(e.target.value) }))} placeholder="MM/AA" maxLength={5} className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 font-mono" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">CVV</label>
                      <input value={cardForm.cvv} onChange={(e) => setCardForm(f => ({ ...f, cvv: e.target.value.replace(/\D/g, "").slice(0, 4) }))} placeholder="123" maxLength={4} type="password" className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 font-mono" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Endereço de cobrança</label>
                    <input value={cardForm.address} onChange={(e) => setCardForm(f => ({ ...f, address: e.target.value }))} placeholder="Rua, número, cidade" className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                </div>

                <button onClick={handlePaymentSubmit} disabled={processing} className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {processing ? (
                    <><div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> Processando...</>
                  ) : (
                    <><Lock className="w-4 h-4" /> Assinar agora</>
                  )}
                </button>

                <p className="text-[10px] text-muted-foreground text-center flex items-center justify-center gap-1">
                  <Lock className="w-3 h-3" /> Pagamento seguro e criptografado
                </p>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* VIP / Enterprise Upgrade Dialog */}
        <Dialog open={enterpriseOpen} onOpenChange={setEnterpriseOpen}>
          <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedPlanId === "vip" ? (
                  <><Crown className="w-5 h-5 text-amber-500" /> Upgrade VIP</>
                ) : (
                  <><Building2 className="w-5 h-5 text-violet-500" /> {enterpriseStep === "cnpj" ? "Dados da empresa" : "Cadastrar cartão"}</>
                )}
              </DialogTitle>
            </DialogHeader>

            {enterpriseStep === "cnpj" && selectedPlanId !== "vip" && (
              <div className="space-y-4">
                <div className="bg-violet-500/10 border border-violet-500/30 rounded-xl p-3 text-center">
                  <p className="text-xs text-muted-foreground">Plano Empresarial</p>
                  {businessPlan && (
                    <p className="text-xl font-bold text-foreground">R$ {businessPlan.price_monthly.toFixed(2).replace(".", ",")}<span className="text-sm font-normal text-muted-foreground">/mês</span></p>
                  )}
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">CNPJ</label>
                    <input value={enterpriseForm.cnpj} onChange={(e) => setEnterpriseForm(f => ({ ...f, cnpj: formatCnpj(e.target.value) }))} placeholder="00.000.000/0000-00" maxLength={18} className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 font-mono" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Razão Social</label>
                    <input value={enterpriseForm.companyName} onChange={(e) => setEnterpriseForm(f => ({ ...f, companyName: e.target.value }))} placeholder="Nome da empresa" className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Situação Cadastral</label>
                    <select value={enterpriseForm.cadastralStatus} onChange={(e) => setEnterpriseForm(f => ({ ...f, cadastralStatus: e.target.value }))} className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30">
                      <option value="">Selecione</option>
                      <option value="ativa">Ativa</option>
                      <option value="suspensa">Suspensa</option>
                      <option value="inapta">Inapta</option>
                      <option value="baixada">Baixada</option>
                    </select>
                  </div>

                  <div className="border-t pt-3">
                    <p className="text-xs font-semibold text-foreground mb-2">Endereço da empresa</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">CEP</label>
                    <input value={enterpriseForm.addressZip} onChange={(e) => setEnterpriseForm(f => ({ ...f, addressZip: e.target.value.replace(/\D/g, "").slice(0, 8) }))} placeholder="00000000" maxLength={8} className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 font-mono" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Rua</label>
                    <input value={enterpriseForm.addressStreet} onChange={(e) => setEnterpriseForm(f => ({ ...f, addressStreet: e.target.value }))} placeholder="Rua / Avenida" className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Número</label>
                      <input value={enterpriseForm.addressNumber} onChange={(e) => setEnterpriseForm(f => ({ ...f, addressNumber: e.target.value }))} placeholder="123" className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Complemento</label>
                      <input value={enterpriseForm.addressComplement} onChange={(e) => setEnterpriseForm(f => ({ ...f, addressComplement: e.target.value }))} placeholder="Sala, andar" className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Bairro</label>
                    <input value={enterpriseForm.addressNeighborhood} onChange={(e) => setEnterpriseForm(f => ({ ...f, addressNeighborhood: e.target.value }))} placeholder="Bairro" className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Cidade</label>
                      <input value={enterpriseForm.addressCity} onChange={(e) => setEnterpriseForm(f => ({ ...f, addressCity: e.target.value }))} placeholder="Cidade" className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Estado</label>
                      <input value={enterpriseForm.addressState} onChange={(e) => setEnterpriseForm(f => ({ ...f, addressState: e.target.value.toUpperCase().slice(0, 2) }))} placeholder="UF" maxLength={2} className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 uppercase" />
                    </div>
                  </div>
                </div>

                <button onClick={handleEnterpriseCnpjNext} className="w-full py-3 rounded-xl bg-violet-600 text-white font-semibold text-sm hover:bg-violet-700 transition-colors flex items-center justify-center gap-2">
                  Próximo: cadastrar cartão <ArrowLeft className="w-4 h-4 rotate-180" />
                </button>
              </div>
            )}

            {enterpriseStep === "card" && (
              <div className="space-y-4">
                {selectedPlanId === "vip" ? (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-center">
                    <p className="text-xs text-muted-foreground">Plano VIP</p>
                    {vipPlan && (
                      <p className="text-xl font-bold text-foreground">R$ {vipPlan.price_monthly.toFixed(2).replace(".", ",")}<span className="text-sm font-normal text-muted-foreground">/mês</span></p>
                    )}
                  </div>
                ) : null}
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 mb-1">
                  <p className="text-xs font-medium text-amber-700">💳 O cartão será salvo mas <strong>não será cobrado agora</strong>.</p>
                  <p className="text-xs text-amber-600 mt-0.5">A cobrança só será realizada após aprovação da equipe Chamô.</p>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Número do cartão</label>
                    <input value={enterpriseCard.number} onChange={(e) => setEnterpriseCard(f => ({ ...f, number: formatCardNumber(e.target.value) }))} placeholder="0000 0000 0000 0000" maxLength={19} className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 font-mono" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome no cartão</label>
                    <input value={enterpriseCard.name} onChange={(e) => setEnterpriseCard(f => ({ ...f, name: e.target.value.toUpperCase() }))} placeholder="NOME COMPLETO" className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 uppercase" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Validade</label>
                      <input value={enterpriseCard.expiry} onChange={(e) => setEnterpriseCard(f => ({ ...f, expiry: formatExpiry(e.target.value) }))} placeholder="MM/AA" maxLength={5} className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 font-mono" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">CVV</label>
                      <input value={enterpriseCard.cvv} onChange={(e) => setEnterpriseCard(f => ({ ...f, cvv: e.target.value.replace(/\D/g, "").slice(0, 4) }))} placeholder="123" maxLength={4} type="password" className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 font-mono" />
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  {selectedPlanId !== "vip" && (
                    <button onClick={() => setEnterpriseStep("cnpj")} className="flex-1 py-3 rounded-xl border text-sm font-medium text-foreground hover:bg-muted transition-colors">
                      Voltar
                    </button>
                  )}
                  <button onClick={handleVipEnterpriseCardSubmit} disabled={enterpriseProcessing} className={`${selectedPlanId === "vip" ? "w-full" : "flex-1"} py-3 rounded-xl ${selectedPlanId === "vip" ? "bg-amber-500 hover:bg-amber-600" : "bg-violet-600 hover:bg-violet-700"} text-white font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2`}>
                    {enterpriseProcessing ? (
                      <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Enviando...</>
                    ) : (
                      "Enviar solicitação"
                    )}
                  </button>
                </div>

                <p className="text-[10px] text-muted-foreground text-center flex items-center justify-center gap-1">
                  <Lock className="w-3 h-3" /> Dados seguros e criptografados
                </p>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Downgrade Confirmation Dialog */}
        <Dialog open={downgradeOpen} onOpenChange={setDowngradeOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Tem certeza?
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                <p className="text-sm text-foreground font-medium">Ao mudar para um plano inferior, você poderá perder benefícios como:</p>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <li>• Recebimento de pagamentos pelo app</li>
                  <li>• Selo de verificado</li>
                  <li>• Destaque na plataforma</li>
                  <li>• Suporte no app</li>
                  <li>• Limite de dispositivos reduzido</li>
                </ul>
              </div>
              {downgradePlanId && (
                <p className="text-sm text-center text-muted-foreground">
                  O valor da cobrança será ajustado para{" "}
                  <strong className="text-foreground">
                    {formatPrice(plans.find(p => p.id === downgradePlanId)?.price_monthly || 0)}
                  </strong>
                </p>
              )}
              <div className="flex gap-2">
                <button onClick={() => setDowngradeOpen(false)} className="flex-1 py-2.5 rounded-xl border text-sm font-medium text-foreground hover:bg-muted transition-colors">
                  Cancelar
                </button>
                <button onClick={handleDowngradeConfirm} disabled={downgrading} className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground font-semibold text-sm hover:bg-destructive/90 transition-colors disabled:opacity-50">
                  {downgrading ? "Processando..." : "Confirmar mudança"}
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Cancel Subscription Dialog */}
        <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                Cancelar assinatura
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Ao cancelar sua assinatura, você voltará para o plano <strong>Grátis</strong> e perderá todos os benefícios do plano atual.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setCancelOpen(false)} className="flex-1 py-2.5 rounded-xl border text-sm font-medium text-foreground hover:bg-muted transition-colors">
                  Manter plano
                </button>
                <button onClick={handleCancelSubscription} disabled={cancelling} className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground font-semibold text-sm hover:bg-destructive/90 transition-colors disabled:opacity-50">
                  {cancelling ? "Cancelando..." : "Cancelar assinatura"}
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </AppLayout>
  );
};

export default Subscriptions;