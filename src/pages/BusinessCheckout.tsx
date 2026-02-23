import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CreditCard, Building2, Upload, Loader2, Check, FileText, Clock, ShieldCheck, Lock, ChevronRight } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

// Funções de Máscara (Idênticas ao padrão do app)
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

  // Busca de CEP (ViaCEP)
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
        toast({ title: "Erro ao buscar CEP", variant: "destructive" });
      } finally {
        setSearchingCep(false);
      }
    }
  };

  const handleSubscribe = async () => {
    if (!proofFile || !cardForm.number || !businessData.cnpj || !businessData.number) {
      toast({ title: "Atenção", description: "Preencha todos os dados e anexe o Cartão CNPJ.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não logado.");

      // Upload do arquivo
      const fileExt = proofFile.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from("business-proofs").upload(fileName, proofFile);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("business-proofs").getPublicUrl(fileName);
      const fullAddress = `${businessData.street}, ${businessData.number} - ${businessData.neighborhood}, ${businessData.city}/${businessData.state}`;

      // Inserção no banco (Status PENDING conforme os outros planos)
      const { error: subError } = await supabase.from("subscriptions").upsert({
        user_id: user.id,
        plan_id: "business",
        status: "PENDING",
        business_cnpj: businessData.cnpj,
        business_address: fullAddress,
        business_proof_url: urlData.publicUrl
      });

      if (subError) throw subError;

      toast({ title: "Assinatura pré-aprovada!", description: "Analisaremos seus dados em breve." });
      navigate("/profile");
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <main className="max-w-md mx-auto px-4 py-5 pb-16 animate-in fade-in duration-500">
        <button 
          onClick={() => navigate(-1)} 
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar para Planos
        </button>

        <div className="space-y-6">
          {/* Cabeçalho de Preço (Igual ao estilo do Modal) */}
          <div className="bg-violet-600/5 border border-violet-500/20 rounded-2xl p-6 text-center">
            <div className="inline-flex p-3 rounded-2xl bg-violet-600/10 mb-3">
              <Building2 className="w-6 h-6 text-violet-600" />
            </div>
            <p className="text-xs font-bold text-violet-600 uppercase tracking-widest mb-1">Plano Business</p>
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-3xl font-black text-foreground">R$ 250,00</span>
              <span className="text-sm font-medium text-muted-foreground">/mês</span>
            </div>
          </div>

          {/* Dados da Empresa */}
          <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4">
            <p className="text-[10px] font-bold text-violet-600 uppercase flex items-center gap-2 mb-2">
              <ShieldCheck className="w-3.5 h-3.5" /> Verificação Profissional
            </p>
            
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1 mb-1 block">CNPJ da Empresa</label>
                <input 
                  value={businessData.cnpj} 
                  onChange={e => setBusinessData({...businessData, cnpj: formatCNPJ(e.target.value)})}
                  placeholder="00.000.000/0001-00" 
                  className="w-full p-3.5 border rounded-xl bg-background outline-none focus:ring-2 focus:ring-violet-500/20 transition-all text-sm" 
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1 mb-1 block flex items-center gap-1">
                    CEP {searchingCep && <Clock className="w-3 h-3 animate-spin text-violet-500" />}
                  </label>
                  <input 
                    value={businessData.cep} 
                    onChange={e => handleCepChange(e.target.value)}
                    placeholder="00000-000" 
                    className="w-full p-3.5 border rounded-xl bg-background outline-none focus:ring-2 focus:ring-violet-500/20 text-sm" 
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1 mb-1 block">Número</label>
                  <input 
                    value={businessData.number} 
                    onChange={e => setBusinessData({...businessData, number: e.target.value})}
                    placeholder="Ex: 123" 
                    className="w-full p-3.5 border rounded-xl bg-background outline-none focus:ring-2 focus:ring-violet-500/20 text-sm" 
                  />
                </div>
              </div>

              {businessData.street && (
                <div className="p-3 bg-muted/50 rounded-xl border border-dashed text-[11px] animate-in slide-in-from-top-1">
                  <p className="font-bold text-foreground">{businessData.street}</p>
                  <p className="text-muted-foreground">{businessData.neighborhood} — {businessData.city}/{businessData.state}</p>
                </div>
              )}

              <div className="pt-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1 mb-1 block">Cartão CNPJ (PDF Obrigatório)</label>
                <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-6 cursor-pointer transition-all ${proofFile ? 'border-emerald-500 bg-emerald-500/5' : 'border-border hover:bg-muted/50'}`}>
                  {proofFile ? <FileText className="w-8 h-8 text-emerald-600" /> : <Upload className="w-8 h-8 text-violet-500" />}
                  <span className="text-xs font-bold text-center px-2 truncate w-full">
                    {proofFile ? proofFile.name : "Toque para selecionar"}
                  </span>
                  <input type="file" className="hidden" accept="application/pdf" onChange={e => setProofFile(e.target.files?.[0] || null)} />
                </label>
              </div>
            </div>
          </div>

          {/* Dados do Cartão (Estilo idêntico ao Modal Pro/Vip) */}
          <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4">
            <p className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-2 mb-2">
              <CreditCard className="w-3.5 h-3.5" /> Detalhes do Pagamento
            </p>
            
            <div className="space-y-3">
              <input 
                placeholder="NOME NO CARTÃO" 
                value={cardForm.name}
                onChange={e => setCardForm({...cardForm, name: e.target.value.toUpperCase()})}
                className="w-full p-3.5 border rounded-xl bg-background outline-none focus:ring-2 focus:ring-violet-500/20 text-sm uppercase font-medium" 
              />
              <input 
                placeholder="0000 0000 0000 0000" 
                value={cardForm.number}
                onChange={e => setCardForm({...cardForm, number: formatCardNumber(e.target.value)})}
                className="w-full p-3.5 border rounded-xl bg-background outline-none focus:ring-2 focus:ring-violet-500/20 text-sm font-mono" 
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
          </div>

          <button 
            onClick={handleSubscribe} 
            disabled={loading}
            className="w-full py-4 bg-violet-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-violet-500/20 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <>Confirmar Assinatura <ChevronRight className="w-4 h-4" /></>}
          </button>
          
          <div className="flex items-center justify-center gap-1.5 text-muted-foreground">
            <Lock className="w-3 h-3" />
            <span className="text-[10px] font-bold uppercase tracking-tight">Transação Segura e Criptografada</span>
          </div>
        </div>
      </main>
    </AppLayout>
  );
};

export default BusinessCheckout;