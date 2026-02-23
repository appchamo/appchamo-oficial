import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CreditCard, Building2, Upload, Loader2, Check, FileText, Clock, ShieldCheck, Lock } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

// ✅ Máscaras de formatação
const formatCNPJ = (val: string) => val.replace(/\D/g, "").replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5").slice(0, 18);
const formatCEP = (val: string) => val.replace(/\D/g, "").replace(/^(\d{5})(\d{3})/, "$1-$2").slice(0, 9);
const formatCardNumber = (val: string) => val.replace(/\D/g, "").replace(/(\d{4})(?=\d)/g, "$1 ").slice(0, 19);
const formatExpiry = (val: string) => val.replace(/\D/g, "").replace(/(\d{2})(\d)/, "$1/$2").slice(0, 5);
const formatCVV = (val: string) => val.replace(/\D/g, "").slice(0, 4);

const BusinessCheckout = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [searchingCep, setSearchingCep] = useState(false);
  const [showFullAddress, setShowFullAddress] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);

  const [cardForm, setCardForm] = useState(() => {
    const saved = localStorage.getItem('business_card_draft');
    return saved ? JSON.parse(saved) : { number: "", name: "", expiry: "", cvv: "" };
  });

  const [businessData, setBusinessData] = useState(() => {
    const saved = localStorage.getItem('business_info_draft');
    return saved ? JSON.parse(saved) : { cnpj: "", cep: "", street: "", number: "", neighborhood: "", city: "", state: "" };
  });

  useEffect(() => {
    localStorage.setItem('business_card_draft', JSON.stringify(cardForm));
    localStorage.setItem('business_info_draft', JSON.stringify(businessData));
  }, [cardForm, businessData]);

  // ✅ Busca CEP inteligente (Igual ao modal anterior)
  const handleCepChange = async (value: string) => {
    const cep = value.replace(/\D/g, "");
    setBusinessData(d => ({ ...d, cep: formatCEP(value) }));

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast({ title: "Arquivo inválido", description: "Selecione apenas arquivos PDF.", variant: "destructive" });
      e.target.value = "";
      setProofFile(null);
      return;
    }
    setProofFile(file);
  };

  const handleSubscribe = async () => {
    if (!cardForm.number || !cardForm.name || !businessData.cnpj || !proofFile || !businessData.number) {
      toast({ title: "Atenção", description: "Preencha todos os campos e anexe o PDF do CNPJ.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não logado.");

      const path = `business-proofs/${user.id}/${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage.from("business-proofs").upload(path, proofFile);
      if (uploadError) throw new Error("Erro ao enviar PDF.");
      
      const { data: urlData } = supabase.storage.from("business-proofs").getPublicUrl(path);
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

      toast({ title: "Solicitação enviada!", description: "Analisaremos sua empresa em até 24h." });
      localStorage.removeItem('business_card_draft');
      localStorage.removeItem('business_info_draft');
      navigate("/profile");
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <main className="max-w-md mx-auto px-4 py-5 pb-10">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-muted-foreground mb-6 hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Voltar aos planos
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-violet-500/10 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-violet-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Assinatura Business</h1>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Verificação de Empresa</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Dados da Empresa */}
          <div className="bg-card border rounded-2xl p-5 shadow-sm space-y-4">
            <p className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1.5 border-b pb-2">
              <Building2 className="w-3.5 h-3.5" /> Informações do CNPJ
            </p>
            
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground ml-1 mb-1 block">CNPJ da Empresa *</label>
                <input 
                  placeholder="00.000.000/0001-00" 
                  value={businessData.cnpj}
                  onChange={e => setBusinessData({...businessData, cnpj: formatCNPJ(e.target.value)})}
                  className="w-full p-3 border rounded-xl bg-background outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground ml-1 mb-1 block flex items-center gap-1">
                    CEP {searchingCep && <Clock className="w-3 h-3 animate-spin" />}
                  </label>
                  <input 
                    placeholder="00000-000" 
                    value={businessData.cep}
                    onChange={e => handleCepChange(e.target.value)}
                    className="w-full p-3 border rounded-xl bg-background outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all"
                  />
                </div>
                {showFullAddress && (
                  <div>
                    <label className="text-[11px] font-bold text-primary ml-1 mb-1 block">Número *</label>
                    <input 
                      placeholder="123" 
                      value={businessData.number}
                      onChange={e => setBusinessData({...businessData, number: e.target.value})}
                      className="w-full p-3 border-2 border-primary rounded-xl bg-background outline-none"
                    />
                  </div>
                )}
              </div>

              {showFullAddress && (
                <div className="p-3 bg-muted/50 rounded-xl border space-y-1 animate-in fade-in slide-in-from-top-2">
                  <p className="text-xs font-medium text-foreground">{businessData.street}</p>
                  <p className="text-[11px] text-muted-foreground">{businessData.neighborhood} - {businessData.city}/{businessData.state}</p>
                </div>
              )}

              <div>
                <label className="text-[11px] font-semibold text-muted-foreground ml-1 mb-1 block">Cartão CNPJ (PDF Obrigatório) *</label>
                <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-6 cursor-pointer transition-all ${proofFile ? 'border-emerald-500 bg-emerald-500/5' : 'border-muted-foreground/20 hover:bg-muted/50'}`}>
                  {proofFile ? <FileText className="w-8 h-8 text-emerald-600" /> : <Upload className="w-8 h-8 text-muted-foreground" />}
                  <span className="text-sm font-medium text-center text-foreground px-2 truncate w-full">
                    {proofFile ? proofFile.name : "Anexar Comprovante PDF"}
                  </span>
                  <input type="file" className="hidden" accept="application/pdf" onChange={handleFileChange} />
                </label>
              </div>
            </div>
          </div>

          {/* Dados do Cartão */}
          <div className="bg-card border rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5" /> Pagamento Mensal
              </p>
              <span className="text-sm font-bold text-primary">R$ 250,00</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground ml-1 mb-1 block">Nome impresso no Cartão *</label>
                <input 
                  placeholder="NOME COMPLETO" 
                  value={cardForm.name}
                  onChange={e => setCardForm({...cardForm, name: e.target.value.toUpperCase()})}
                  className="w-full p-3 border rounded-xl bg-background outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary uppercase transition-all"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-muted-foreground ml-1 mb-1 block">Número do Cartão *</label>
                <input 
                  placeholder="0000 0000 0000 0000" 
                  value={cardForm.number}
                  onChange={e => setCardForm({...cardForm, number: formatCardNumber(e.target.value)})}
                  className="w-full p-3 border rounded-xl bg-background outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground ml-1 mb-1 block">Validade *</label>
                  <input 
                    placeholder="MM/AA" 
                    value={cardForm.expiry}
                    onChange={e => setCardForm({...cardForm, expiry: formatExpiry(e.target.value)})}
                    className="w-full p-3 border rounded-xl bg-background outline-none text-center font-mono" 
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground ml-1 mb-1 block">CVV *</label>
                  <input 
                    placeholder="123" 
                    value={cardForm.cvv}
                    onChange={e => setCardForm({...cardForm, cvv: formatCVV(e.target.value)})}
                    type="password"
                    className="w-full p-3 border rounded-xl bg-background outline-none text-center font-mono" 
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <button 
              onClick={handleSubscribe} 
              disabled={loading}
              className="w-full py-4 bg-primary text-primary-foreground rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-primary/20 active:scale-95 transition-all"
            >
              {loading ? <Loader2 className="animate-spin w-5 h-5" /> : "Assinar Plano Business"}
            </button>
            <p className="text-[10px] text-muted-foreground text-center flex items-center justify-center gap-1.5">
              <Lock className="w-3 h-3" /> Seus dados estão protegidos com criptografia de ponta a ponta.
            </p>
          </div>
        </div>
      </main>
    </AppLayout>
  );
};

export default BusinessCheckout;