import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck, CreditCard, Building2, Clock, Upload, Check } from "lucide-react";

interface SubscriptionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  planId: string;
  onSuccess: () => void;
}

// ✅ Máscaras Profissionais
const formatCardNumber = (val: string) => val.replace(/\D/g, "").replace(/(\d{4})(?=\d)/g, "$1 ").slice(0, 19);
const formatExpiry = (val: string) => val.replace(/\D/g, "").replace(/(\d{2})(?=\d)/, "$1/").slice(0, 5);
const formatCVV = (val: string) => val.replace(/\D/g, "").slice(0, 4);
const formatCNPJ = (val: string) => val.replace(/\D/g, "").replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5").slice(0, 18);

export default function SubscriptionDialog({ isOpen, onClose, planId, onSuccess }: SubscriptionDialogProps) {
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estados do Cartão
  const [cardForm, setCardForm] = useState({ number: "", name: "", expiry: "", cvv: "" });

  // Estados detalhados para o plano Business
  const [businessData, setBusinessData] = useState({ 
    cnpj: "", cep: "", street: "", number: "", neighborhood: "", city: "", state: "" 
  });
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [searchingCep, setSearchingCep] = useState(false);
  const [showFullAddress, setShowFullAddress] = useState(false);

  // Busca de Endereço Automática via CEP (Igual ao Subscriptions.tsx)
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

  const handleSubscribe = async () => {
    // 1. Validações Iniciais
    if (!cardForm.number || !cardForm.name || !cardForm.expiry || !cardForm.cvv) {
      toast({ title: "Atenção", description: "Preencha todos os dados do cartão.", variant: "destructive" });
      return;
    }

    if (planId === "business") {
      if (!businessData.cnpj || !businessData.cep || !businessData.number || !proofFile) {
        toast({ title: "Atenção", description: "CNPJ, CEP, Número e Comprovante são obrigatórios.", variant: "destructive" });
        return;
      }
    }

    if (cardForm.number.replace(/\s/g, "").length < 16) {
      toast({ title: "Cartão inválido", description: "Verifique o número do cartão.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Usuário não logado. Faça login novamente.");
      const user = session.user;

      // 2. Busca Perfil do Usuário
      const { data: profileData } = await supabase
        .from("profiles")
        .select("full_name, email, cpf, cnpj, phone, address_zip, address_number")
        .eq("user_id", user.id)
        .single();

      if (!profileData?.cpf && !profileData?.cnpj) {
        toast({ title: "CPF/CNPJ ausente", description: "Seu cadastro não possui CPF. Volte e preencha corretamente.", variant: "destructive" });
        setLoading(false);
        return;
      }

      // 3. Prepara Upload e Variáveis (Igualzinho ao Subscriptions.tsx)
      const planValues = { pro: "49.90", vip: "140.00", business: "250.00" };
      const value = planValues[planId as keyof typeof planValues];
      
      let proofUrl = "";
      const fullAddress = `${businessData.street}, ${businessData.number} - ${businessData.neighborhood}, ${businessData.city}/${businessData.state} (CEP: ${businessData.cep})`;

      if (planId === "business" && proofFile) {
        const fileExt = proofFile.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from("business-proofs").upload(fileName, proofFile);
        if (uploadError) throw new Error("Erro ao enviar o comprovante de CNPJ.");
        const { data: urlData } = supabase.storage.from("business-proofs").getPublicUrl(fileName);
        proofUrl = urlData.publicUrl;
      }

      const finalStatus = planId === "pro" ? "ACTIVE" : "PENDING";

      // 4. Registra no Banco
      const { error: upsertError } = await supabase.from("subscriptions").upsert({
        user_id: user.id,
        plan_id: planId,
        status: finalStatus,
        business_cnpj: businessData.cnpj || null,
        business_address: fullAddress || null,
        business_proof_url: proofUrl || null
      }, { onConflict: 'user_id' });

      if (upsertError) throw new Error("Erro ao registrar assinatura no banco.");

      // 5. Envia pro Asaas via Edge Function (payload exato)
      const expiryParts = cardForm.expiry.split("/");
      const res = await supabase.functions.invoke("create_subscription", {
        body: {
          userId: user.id,
          planId: planId,
          value: parseFloat(value),
          holderName: cardForm.name,
          number: cardForm.number.replace(/\s/g, ""),
          expiryMonth: expiryParts[0],
          expiryYear: `20${expiryParts[1]}`,
          ccv: cardForm.cvv,
          email: profileData?.email || user.email,
          cpfCnpj: profileData?.cnpj || profileData?.cpf || "",
          postalCode: profileData?.address_zip || "",
          addressNumber: profileData?.address_number || "",
          phone: profileData?.phone || "",
          cnpjBusiness: businessData.cnpj,
          addressBusiness: fullAddress,
          proofUrl: proofUrl,
        },
      });

      if (res.error || res.data?.error) throw new Error(res.data?.error || "Erro no processamento do pagamento Asaas.");

      if (finalStatus === "ACTIVE") {
        toast({ title: "Plano Ativado!", description: "Seu pagamento foi processado com sucesso." });
      } else {
        toast({ title: "Assinatura pré-aprovada!", description: "Seu plano entrará em vigor após análise." });
      }
      
      onSuccess();
    } catch (error: any) {
      toast({ title: "Erro na Assinatura", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md overflow-y-auto max-h-[90vh] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <ShieldCheck className="w-5 h-5" /> Concluir Assinatura
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-2">
          {/* Se for plano BUSINESS, mostra a inteligência de CNPJ igual ao Subscriptions */}
          {planId === "business" && (
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

              <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-violet-300 rounded-xl p-3 text-center cursor-pointer hover:bg-violet-50 transition-colors">
                <input type="file" ref={fileInputRef} hidden accept=".pdf,.png,.jpg" onChange={(e) => setProofFile(e.target.files?.[0] || null)} />
                {proofFile ? (
                  <span className="text-xs text-emerald-600 font-bold flex items-center justify-center gap-1">
                    <Check className="w-4 h-4" /> Comprovante Anexado!
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
              <label className="text-xs font-semibold text-muted-foreground ml-1 mb-1 block">Nome no cartão</label>
              <input 
                placeholder="NOME COMPLETO" 
                value={cardForm.name}
                className="w-full p-3 border rounded-xl bg-background outline-none focus:border-primary focus:ring-1 focus:ring-primary uppercase transition-all" 
                onChange={e => setCardForm({...cardForm, name: e.target.value.toUpperCase()})} 
              />
            </div>
            
            <div>
              <label className="text-xs font-semibold text-muted-foreground ml-1 mb-1 block">Número do cartão</label>
              <div className="relative">
                <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input 
                  placeholder="0000 0000 0000 0000" 
                  value={cardForm.number}
                  maxLength={19}
                  className="w-full p-3 pl-9 border rounded-xl bg-background outline-none focus:border-primary focus:ring-1 focus:ring-primary font-mono transition-all" 
                  onChange={e => setCardForm({...cardForm, number: formatCardNumber(e.target.value)})} 
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground ml-1 mb-1 block">Validade</label>
                <input 
                  placeholder="MM/AA" 
                  value={cardForm.expiry}
                  maxLength={5}
                  className="w-full p-3 border rounded-xl bg-background outline-none focus:border-primary focus:ring-1 focus:ring-primary font-mono transition-all text-center" 
                  onChange={e => setCardForm({...cardForm, expiry: formatExpiry(e.target.value)})} 
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground ml-1 mb-1 block">CVV</label>
                <input 
                  placeholder="123" 
                  value={cardForm.cvv}
                  maxLength={4}
                  type="password"
                  className="w-full p-3 border rounded-xl bg-background outline-none focus:border-primary focus:ring-1 focus:ring-primary font-mono transition-all text-center" 
                  onChange={e => setCardForm({...cardForm, cvv: formatCVV(e.target.value)})} 
                />
              </div>
            </div>
          </div>

          <button 
            onClick={handleSubscribe} 
            disabled={loading}
            className="w-full py-3.5 mt-2 bg-primary hover:bg-primary/90 transition-colors text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : "Confirmar Assinatura"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}