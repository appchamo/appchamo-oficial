import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CreditCard, Building2, Upload, Loader2, Check, FileText, Clock, ShieldCheck, Lock } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

// Máscaras de Formatação
const formatCNPJ = (val: string) => val.replace(/\D/g, "").replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5").slice(0, 18);
const formatCEP = (val: string) => val.replace(/\D/g, "").replace(/^(\d{5})(\d{3})/, "$1-$2").slice(0, 9);
const formatCardNumber = (val: string) => val.replace(/\D/g, "").replace(/(\d{4})(?=\d)/g, "$1 ").slice(0, 19);
const formatExpiry = (val: string) => val.replace(/\D/g, "").replace(/(\d{2})(\d)/, "$1/$2").slice(0, 5);
const formatCVV = (val: string) => val.replace(/\D/g).slice(0, 4);

const BusinessCheckout = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [searchingCep, setSearchingCep] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);

  const [cardForm, setCardForm] = useState({ number: "", name: "", expiry: "", cvv: "" });
  const [businessData, setBusinessData] = useState({ 
    cnpj: "", cep: "", street: "", number: "", neighborhood: "", city: "", state: "" 
  });

  // Busca de CEP automática
  const handleCepChange = async (value: string) => {
    const rawCep = value.replace(/\D/g, "");
    setBusinessData(d => ({ ...d, cep: formatCEP(value) }));

    if (rawCep.length === 8) {
      setSearchingCep(true);
      try {
        const res = await fetch(`https://viacep.com.br/ws/${rawCep}/json/`);
        const data = await res.json();
        if (!data.erro) {
          setBusinessData(d => ({ 
            ...d, 
            street: data.logradouro, 
            neighborhood: data.bairro, 
            city: data.localidade, 
            state: data.uf 
          }));
        } else {
          toast({ title: "CEP não encontrado", variant: "destructive" });
        }
      } catch (err) {
        console.error("Erro ao buscar CEP");
      } finally {
        setSearchingCep(false);
      }
    }
  };

  const handleSubscribe = async () => {
    if (!proofFile) {
      toast({ title: "Anexe o Cartão CNPJ", description: "O documento PDF é obrigatório.", variant: "destructive" });
      return;
    }
    
    if (!cardForm.number || !cardForm.name || !businessData.cnpj || !businessData.number) {
      toast({ title: "Campos incompletos", description: "Verifique os dados da empresa e do pagamento.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não identificado.");

      // 1. Upload do PDF
      const fileExt = proofFile.name.split('.').pop();
      const filePath = `business-proofs/${user.id}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from("business-proofs").upload(filePath, proofFile);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("business-proofs").getPublicUrl(filePath);

      // 2. Salva Assinatura
      const fullAddress = `${businessData.street}, ${businessData.number} - ${businessData.neighborhood}, ${businessData.city}/${businessData.state}`;
      const { error: subError } = await supabase.from("subscriptions").upsert({
        user_id: user.id,
        plan_id: "business",
        status: "PENDING",
        business_cnpj: businessData.cnpj,
        business_address: fullAddress,
        business_proof_url: urlData.publicUrl
      });

      if (subError) throw subError;

      toast({ title: "Solicitação enviada!", description: "Analisaremos seus dados em breve." });
      navigate("/profile");
    } catch (err: any) {
      toast({ title: "Erro na assinatura", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <main className="max-w-md mx-auto px-4 py-6 pb-12">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>

        <div className="flex items-center gap-4 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-violet-600/10 flex items-center justify-center shadow-inner">
            <ShieldCheck className="w-7 h-7 text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">Plano Business</h1>
            <div className="flex items-center gap-2 text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
              <Lock className="w-3 h-3" /> Verificação de Segurança
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Seção Empresa */}
          <div className="bg-card border rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
               <p className="text-xs font-black uppercase text-muted-foreground flex items-center gap-2">
                 <Building2 className="w-4 h-4" /> Dados da Empresa
               </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-bold text-muted-foreground mb-1.5 block ml-1">CNPJ</label>
                <input 
                  placeholder="00.000.000/0001-00" 
                  value={businessData.cnpj} 
                  onChange={e => setBusinessData({...businessData, cnpj: formatCNPJ(e.target.value)})} 
                  className="w-full p-4 border rounded-2xl bg-background outline-none focus:ring-2 focus:ring-violet-500/20 transition-all" 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground mb-1.5 block ml-1 flex items-center gap-2">
                    CEP {searchingCep && <Clock className="w-3 h-3 animate-spin text-violet-600" />}
                  </label>
                  <input 
                    placeholder="00000-000" 
                    value={businessData.cep} 
                    onChange={e => handleCepChange(e.target.value)} 
                    className="w-full p-4 border rounded-2xl bg-background outline-none focus:ring-2 focus:ring-violet-500/20 transition-all" 
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground mb-1.5 block ml-1">NÚMERO</label>
                  <input 
                    placeholder="Ex: 123" 
                    value={businessData.number} 
                    onChange={e => setBusinessData({...businessData, number: e.target.value})} 
                    className="w-full p-4 border rounded-2xl bg-background outline-none focus:ring-2 focus:ring-violet-500/20 transition-all" 
                  />
                </div>
              </div>

              {businessData.street && (
                <div className="p-4 bg-violet-500/5 rounded-2xl border border-violet-200 border-dashed animate-in fade-in slide-in-from-top-2">
                  <p className="text-xs font-bold text-violet-900">{businessData.street}</p>
                  <p className="text-[10px] text-violet-700/70">{businessData.neighborhood} — {businessData.city}/{businessData.state}</p>
                </div>
              )}

              <div>
                <label className="text-[11px] font-bold text-muted-foreground mb-1.5 block ml-1">CARTÃO CNPJ (PDF)</label>
                <label className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl p-8 cursor-pointer transition-all ${proofFile ? 'border-emerald-500 bg-emerald-500/5' : 'border-muted-foreground/20 hover:border-violet-500/50'}`}>
                  {proofFile ? <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg"><Check className="text-white w-6 h-6" /></div> : <Upload className="w-8 h-8 text-muted-foreground" />}
                  <span className="text-sm font-bold text-center px-4 truncate max-w-full">
                    {proofFile ? proofFile.name : "Toque para selecionar o PDF"}
                  </span>
                  <input type="file" className="hidden" accept="application/pdf" onChange={e => setProofFile(e.target.files?.[0] || null)} />
                </label>
              </div>
            </div>
          </div>

          {/* Seção Pagamento */}
          <div className="bg-card border rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
               <p className="text-xs font-black uppercase text-muted-foreground flex items-center gap-2">
                 <CreditCard className="w-4 h-4" /> Pagamento
               </p>
               <span className="text-sm font-black text-violet-600">R$ 250,00</span>
            </div>

            <div className="space-y-4">
              <input 
                placeholder="NOME NO CARTÃO" 
                value={cardForm.name} 
                onChange={e => setCardForm({...cardForm, name: e.target.value.toUpperCase()})} 
                className="w-full p-4 border rounded-2xl bg-background outline-none focus:ring-2 focus:ring-violet-500/20 transition-all uppercase font-medium" 
              />
              <input 
                placeholder="0000 0000 0000 0000" 
                value={cardForm.number} 
                onChange={e => setCardForm({...cardForm, number: formatCardNumber(e.target.value)})} 
                className="w-full p-4 border rounded-2xl bg-background outline-none focus:ring-2 focus:ring-violet-500/20 transition-all font-mono" 
              />
              <div className="grid grid-cols-2 gap-4">
                <input 
                  placeholder="MM/AA" 
                  value={cardForm.expiry} 
                  onChange={e => setCardForm({...cardForm, expiry: formatExpiry(e.target.value)})} 
                  className="w-full p-4 border rounded-2xl bg-background outline-none focus:ring-2 focus:ring-violet-500/20 transition-all text-center" 
                />
                <input 
                  placeholder="CVV" 
                  type="password"
                  value={cardForm.cvv} 
                  onChange={e => setCardForm({...cardForm, cvv: formatCVV(e.target.value)})} 
                  className="w-full p-4 border rounded-2xl bg-background outline-none focus:ring-2 focus:ring-violet-500/20 transition-all text-center" 
                />
              </div>
            </div>
          </div>

          <button 
            onClick={handleSubscribe} 
            disabled={loading}
            className="w-full py-5 bg-violet-600 text-white rounded-2xl font-black text-lg shadow-xl shadow-violet-500/20 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3"
          >
            {loading ? <Loader2 className="animate-spin w-6 h-6" /> : "ASSINAR AGORA"}
          </button>

          <p className="text-[10px] text-center text-muted-foreground flex items-center justify-center gap-2">
            <ShieldCheck className="w-3 h-3" /> Seus dados de pagamento estão criptografados e seguros.
          </p>
        </div>
      </main>
    </AppLayout>
  );
};

export default BusinessCheckout;