import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CreditCard, Building2, Upload, Loader2, Check, FileText, Clock, ShieldCheck, Lock, ChevronRight, Crown } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const formatCNPJ = (val: string) => val.replace(/\D/g, "").replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5").slice(0, 18);
const formatCEP = (val: string) => val.replace(/\D/g, "").replace(/^(\d{5})(\d{3})/, "$1-$2").slice(0, 9);
const formatCardNumber = (val: string) => val.replace(/\D/g, "").replace(/(\d{4})(?=\d)/g, "$1 ").slice(0, 19);
const formatExpiry = (val: string) => val.replace(/\D/g, "").replace(/(\d{2})(\d)/, "$1/$2").slice(0, 5);
const formatCVV = (val: string) => val.replace(/\D/g, "").slice(0, 4);

const BusinessCheckout = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [searchingCep, setSearchingCep] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);

  const [cardForm, setCardForm] = useState({ number: "", name: "", expiry: "", cvv: "" });
  const [businessData, setBusinessData] = useState({ 
    cnpj: "", cep: "", street: "", number: "", neighborhood: "", city: "", state: "" 
  });

  const handleCepChange = async (value: string) => {
    const rawCep = value.replace(/\D/g, "");
    setBusinessData(d => ({ ...d, cep: formatCEP(value) }));
    if (rawCep.length === 8) {
      setSearchingCep(true);
      try {
        const res = await fetch(`https://viacep.com.br/ws/${rawCep}/json/`);
        const data = await res.json();
        if (!data.erro) {
          setBusinessData(d => ({ ...d, street: data.logradouro, neighborhood: data.bairro, city: data.localidade, state: data.uf }));
        }
      } finally { setSearchingCep(false); }
    }
  };

  const handleSubscribe = async () => {
    if (!proofFile || !cardForm.number || !businessData.cnpj) {
      toast({ title: "Ops!", description: "Preencha os dados e anexe o PDF do CNPJ.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não identificado.");
      const filePath = `business-proofs/${user.id}/${Date.now()}.pdf`;
      await supabase.storage.from("business-proofs").upload(filePath, proofFile);
      const { data: urlData } = supabase.storage.from("business-proofs").getPublicUrl(filePath);
      const fullAddress = `${businessData.street}, ${businessData.number} - ${businessData.neighborhood}, ${businessData.city}/${businessData.state}`;
      await supabase.from("subscriptions").upsert({
        user_id: user.id, plan_id: "business", status: "PENDING",
        business_cnpj: businessData.cnpj, business_address: fullAddress, business_proof_url: urlData.publicUrl
      });
      toast({ title: "Tudo pronto!", description: "Sua assinatura está em análise." });
      navigate("/profile");
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <AppLayout>
      <main className="max-w-md mx-auto px-4 py-5 pb-20">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors font-medium">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>

        <header className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
              <Crown className="w-3 h-3" /> Plano Business
            </span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Finalizar Assinatura</h1>
          <p className="text-sm text-muted-foreground">Complete a verificação da sua empresa</p>
        </header>

        <div className="space-y-4">
          {/* Header de Preço - Estilo das Subscriptions */}
          <div className="bg-accent border rounded-2xl p-5 text-center">
            <p className="text-xs font-bold text-muted-foreground uppercase mb-1">Total a pagar</p>
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-3xl font-black text-foreground">R$ 250,00</span>
              <span className="text-sm font-medium text-muted-foreground">/mês</span>
            </div>
          </div>

          {/* Dados da Empresa */}
          <section className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 mb-1 border-b pb-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building2 className="w-4 h-4 text-primary" />
              </div>
              <h2 className="text-sm font-bold text-foreground">Dados da Empresa</h2>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">CNPJ</label>
                <input 
                  value={businessData.cnpj} 
                  onChange={e => setBusinessData({...businessData, cnpj: formatCNPJ(e.target.value)})}
                  placeholder="00.000.000/0001-00" 
                  className="w-full p-3.5 border rounded-xl bg-background outline-none focus:ring-2 focus:ring-primary/20 text-sm" 
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">CEP</label>
                  <div className="relative">
                    <input 
                      value={businessData.cep} 
                      onChange={e => handleCepChange(e.target.value)}
                      placeholder="00000-000" 
                      className="w-full p-3.5 border rounded-xl bg-background outline-none focus:ring-2 focus:ring-primary/20 text-sm" 
                    />
                    {searchingCep && <Clock className="w-4 h-4 animate-spin absolute right-3 top-3.5 text-primary" />}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Número</label>
                  <input 
                    value={businessData.number} 
                    onChange={e => setBusinessData({...businessData, number: e.target.value})}
                    placeholder="123" 
                    className="w-full p-3.5 border rounded-xl bg-background outline-none focus:ring-2 focus:ring-primary/20 text-sm" 
                  />
                </div>
              </div>

              {businessData.street && (
                <div className="p-3 bg-primary/5 rounded-xl border border-dashed border-primary/20 animate-in fade-in">
                  <p className="text-xs font-semibold text-primary">{businessData.street}</p>
                  <p className="text-[10px] text-muted-foreground">{businessData.neighborhood} - {businessData.city}/{businessData.state}</p>
                </div>
              )}

              <div className="pt-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1 mb-1 block">Cartão CNPJ (PDF)</label>
                <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-6 cursor-pointer transition-all ${proofFile ? 'border-emerald-500 bg-emerald-500/5' : 'border-border hover:bg-muted/50'}`}>
                  {proofFile ? <FileText className="w-6 h-6 text-emerald-600" /> : <Upload className="w-6 h-6 text-primary" />}
                  <span className="text-xs font-bold text-center px-2 truncate w-full">
                    {proofFile ? proofFile.name : "Anexar Comprovante PDF"}
                  </span>
                  <input type="file" className="hidden" accept="application/pdf" onChange={e => setProofFile(e.target.files?.[0] || null)} />
                </label>
              </div>
            </div>
          </section>

          {/* Sessão Pagamento */}
          <section className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 mb-1 border-b pb-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <CreditCard className="w-4 h-4 text-primary" />
              </div>
              <h2 className="text-sm font-bold text-foreground">Dados do Cartão</h2>
            </div>

            <div className="space-y-3">
              <input 
                placeholder="NOME NO CARTÃO" 
                value={cardForm.name}
                onChange={e => setCardForm({...cardForm, name: e.target.value.toUpperCase()})}
                className="w-full p-3.5 border rounded-xl bg-background outline-none focus:ring-2 focus:ring-primary/20 text-sm uppercase" 
              />
              <input 
                placeholder="0000 0000 0000 0000" 
                value={cardForm.number}
                onChange={e => setCardForm({...cardForm, number: formatCardNumber(e.target.value)})}
                className="w-full p-3.5 border rounded-xl bg-background outline-none focus:ring-2 focus:ring-primary/20 text-sm font-mono" 
              />
              <div className="grid grid-cols-2 gap-3">
                <input 
                  placeholder="MM/AA" 
                  value={cardForm.expiry}
                  onChange={e => setCardForm({...cardForm, expiry: formatExpiry(e.target.value)})}
                  className="p-3.5 border rounded-xl bg-background outline-none text-center text-sm" 
                />
                <input 
                  placeholder="CVV" 
                  value={cardForm.cvv}
                  onChange={e => setCardForm({...cardForm, cvv: formatCVV(e.target.value)})}
                  type="password"
                  className="p-3.5 border rounded-xl bg-background outline-none text-center text-sm" 
                />
              </div>
            </div>
          </section>

          <button 
            onClick={handleSubscribe} 
            disabled={loading}
            className="w-full py-4 bg-primary text-primary-foreground rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <>Assinar Plano Business <ChevronRight className="w-4 h-4" /></>}
          </button>
          
          <div className="flex items-center justify-center gap-1.5 text-muted-foreground">
            <Lock className="w-3 h-3 text-emerald-600" />
            <span className="text-[10px] font-bold uppercase tracking-tight">Pagamento 100% Seguro</span>
          </div>
        </div>
      </main>
    </AppLayout>
  );
};

export default BusinessCheckout;