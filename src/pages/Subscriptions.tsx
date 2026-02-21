import AppLayout from "@/components/AppLayout";
import { Check, Crown, Star, Zap, Building2, ArrowLeft, CreditCard, Lock, Clock, AlertTriangle, FileText, Upload, Search, MapPin } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { useState, useEffect, useRef } from "react";
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

const Subscriptions = () => {
  const navigate = useNavigate();
  const { plan: currentPlan, plans, loading, changePlan, callsUsed, callsRemaining, isFreePlan } = useSubscription();
  const { user, profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [changing, setChanging] = useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [cardForm, setCardForm] = useState({ number: "", name: "", expiry: "", cvv: "", address: "" });
  const [processing, setProcessing] = useState(false);
  const [proStatus, setProStatus] = useState<string | null>(null);
  
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
    if (!user) return;
    const load = async () => {
      // 1. Busca o status do profissional
      const { data: pro } = await supabase
        .from("professionals")
        .select("profile_status")
        .eq("user_id", user.id)
        .maybeSingle();
      if (pro) setProStatus(pro.profile_status);

      // 2. ✅ Busca os benefícios dinâmicos dos planos no banco de dados
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
    setCardForm({ number: "", name: "", expiry: "", cvv: "", address: "" });
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
    if (!cardForm.number || !cardForm.name || !cardForm.expiry || !cardForm.cvv) {
      toast({ title: "Preencha todos os dados do cartão", variant: "destructive" });
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

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Não autenticado");

      const { data: profileData } = await supabase
        .from("profiles")
        .select("full_name, email, cpf, cnpj, phone, address_zip, address_number")
        .eq("user_id", session.user.id)
        .single();

      if (!profileData?.cpf && !profileData?.cnpj) {
        toast({ title: "Cadastre seu CPF ou CNPJ no perfil antes de assinar.", variant: "destructive" });
        setProcessing(false);
        return;
      }

      const finalStatus = selectedPlanId === "pro" ? "ACTIVE" : "PENDING";
      
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
          email: profileData?.email || "",
          cpfCnpj: profileData?.cnpj || profileData?.cpf || "",
          postalCode: profileData?.address_zip || "",
          addressNumber: profileData?.address_number || "",
          phone: profileData?.phone || "",
          cnpjBusiness: businessData.cnpj,
          addressBusiness: fullAddress,
          proofUrl: proofUrl,
        },
      });

      if (res.error || res.data?.error) throw new Error(res.data?.error || "Erro no processamento do pagamento.");

      if (finalStatus === "ACTIVE") {
        toast({ title: "Plano Pro Ativado!", description: "Seu pagamento foi processado e o plano já está liberado." });
      } else {
        toast({ title: "Assinatura pré-aprovada!", description: "Seu plano entrará em vigor após aprovação do administrador." });
      }
      
      setPaymentOpen(false);
      setTimeout(() => { window.location.reload(); }, 2000);

    } catch (err: any) {
      toast({ title: err.message || "Erro ao processar assinatura", variant: "destructive" });
    }
    setProcessing(false);
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

              // ✅ Usa os benefícios do banco se existirem, senão usa o padrão fixo
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

        <p className="text-xs text-muted-foreground text-center mt-6">A cobrança será processada mensalmente. Cancele a qualquer momento.</p>

        <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
          <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-primary" />
                Dados do pagamento
              </DialogTitle>
            </DialogHeader>
            {selectedPlan && (
              <div className="space-y-4">
                <div className="bg-muted/50 rounded-xl p-3 text-center">
                  <p className="text-xs text-muted-foreground">Plano {selectedPlan.name}</p>
                  <p className="text-xl font-bold text-foreground">R$ {selectedPlan.price_monthly.toFixed(2).replace(".", ",")}<span className="text-sm font-normal text-muted-foreground">/mês</span></p>
                </div>
                
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
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-bold text-muted-foreground uppercase">Bairro</label>
                            <input readOnly value={businessData.neighborhood} className="w-full border-b bg-transparent py-1 text-sm text-muted-foreground outline-none" />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-muted-foreground uppercase">Cidade/UF</label>
                            <input readOnly value={`${businessData.city}/${businessData.state}`} className="w-full border-b bg-transparent py-1 text-sm text-muted-foreground outline-none" />
                          </div>
                        </div>
                      </div>
                    )}

                    <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-violet-300 rounded-xl p-3 text-center cursor-pointer hover:bg-violet-50 transition-colors">
                      <input type="file" ref={fileInputRef} hidden accept=".pdf,.png,.jpg" onChange={(e) => setProofFile(e.target.files?.[0] || null)} />
                      {proofFile ? (
                        <span className="text-xs text-emerald-600 font-bold flex items-center justify-center gap-1">
                          <Check className="w-4 h-4" /> Comprovante OK!
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-muted-foreground uppercase flex items-center justify-center gap-1">
                          <Upload className="w-3 h-3" /> Anexar Cartão CNPJ
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1"><CreditCard className="w-3 h-3" /> Dados do Cartão</p>
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
                </div>

                <button onClick={handlePaymentSubmit} disabled={processing} className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {processing ? <><div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> Processando...</> : <><Lock className="w-4 h-4" /> Assinar Plano</>}
                </button>
                <p className="text-[10px] text-muted-foreground text-center flex items-center justify-center gap-1"><Lock className="w-3 h-3" /> Pagamento seguro e criptografado</p>
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
                <button onClick={() => setCancelOpen(false)} className="flex-1 py-2.5 rounded-xl border text-sm font-medium text-foreground hover:bg-muted transition-colors">Manter plano</button>
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