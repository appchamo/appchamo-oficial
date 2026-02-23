import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CreditCard, Building2, Upload, Loader2, Check, FileText, Clock, ShieldCheck, Lock } from "lucide-react";
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
  const [uploadingFile, setUploadingFile] = useState(false);
  const [searchingCep, setSearchingCep] = useState(false);
  
  // ✅ O "Pulo do Gato": Salvamos apenas o LINK do arquivo para resistir ao refresh
  const [proofUrl, setProofUrl] = useState<string | null>(localStorage.getItem('temp_business_pdf_url'));

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
    if (proofUrl) localStorage.setItem('temp_business_pdf_url', proofUrl);
  }, [cardForm, businessData, proofUrl]);

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

  // ✅ NOVO: Upload automático assim que seleciona
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast({ title: "Apenas PDF", variant: "destructive" });
      return;
    }

    setUploadingFile(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const path = `business-proofs/${user.id}/temp_${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage.from("business-proofs").upload(path, file);
      
      if (uploadError) throw uploadError;
      
      const { data: urlData } = supabase.storage.from("business-proofs").getPublicUrl(path);
      setProofUrl(urlData.publicUrl);
      toast({ title: "Arquivo carregado com sucesso!" });
    } catch (err) {
      toast({ title: "Erro no upload", description: "Tente selecionar o arquivo novamente.", variant: "destructive" });
    } finally {
      setUploadingFile(false);
    }
  };

  const handleSubscribe = async () => {
    if (!proofUrl) {
      toast({ title: "Anexe o arquivo", description: "O PDF do CNPJ é obrigatório.", variant: "destructive" });
      return;
    }
    
    if (!cardForm.number || !cardForm.name || !businessData.cnpj || !businessData.number) {
      toast({ title: "Preencha tudo", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não logado.");

      const fullAddress = `${businessData.street}, ${businessData.number} - ${businessData.neighborhood}, ${businessData.city}/${businessData.state}`;

      const { error: subError } = await supabase.from("subscriptions").upsert({
        user_id: user.id, plan_id: "business", status: "PENDING",
        business_cnpj: businessData.cnpj, business_address: fullAddress, business_proof_url: proofUrl
      });

      if (subError) throw subError;

      toast({ title: "Solicitação enviada com sucesso!" });
      localStorage.removeItem('business_card_draft');
      localStorage.removeItem('business_info_draft');
      localStorage.removeItem('temp_business_pdf_url');
      navigate("/profile");
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <AppLayout>
      <main className="max-w-md mx-auto px-4 py-5 pb-10">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-muted-foreground mb-6"><ArrowLeft className="w-4 h-4" /> Voltar</button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-violet-500/10 flex items-center justify-center"><ShieldCheck className="w-6 h-6 text-violet-600" /></div>
          <div><h1 className="text-xl font-bold">Plano Business</h1><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Verificação Empresa</p></div>
        </div>

        <div className="space-y-5">
          <div className="bg-card border rounded-2xl p-5 shadow-sm space-y-4">
            <p className="text-[10px] font-bold text-muted-foreground uppercase border-b pb-2">Informações da Empresa</p>
            <input placeholder="CNPJ" value={businessData.cnpj} onChange={e => setBusinessData({...businessData, cnpj: formatCNPJ(e.target.value)})} className="w-full p-3 border rounded-xl bg-background outline-none" />
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="CEP" value={businessData.cep} onChange={e => handleCepChange(e.target.value)} className="w-full p-3 border rounded-xl bg-background outline-none" />
              <input placeholder="Nº *" value={businessData.number} onChange={e => setBusinessData({...businessData, number: e.target.value})} className="w-full p-3 border rounded-xl bg-background outline-none" />
            </div>

            <div>
              <label className="text-[11px] font-bold text-muted-foreground mb-1 block">Cartão CNPJ (PDF) *</label>
              <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-6 cursor-pointer transition-all ${proofUrl ? 'border-emerald-500 bg-emerald-500/5' : 'border-muted-foreground/20'}`}>
                {uploadingFile ? (
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                ) : proofUrl ? (
                  <FileText className="w-8 h-8 text-emerald-600" />
                ) : (
                  <Upload className="w-8 h-8 text-muted-foreground" />
                )}
                <span className="text-sm font-bold text-center text-foreground px-2 truncate w-full">
                  {uploadingFile ? "Enviando arquivo..." : proofUrl ? "PDF Carregado com Sucesso!" : "Selecionar PDF"}
                </span>
                <input type="file" className="hidden" accept="application/pdf" onChange={handleFileChange} disabled={uploadingFile} />
              </label>
              {proofUrl && !uploadingFile && (
                <p className="text-[10px] text-emerald-600 text-center font-bold mt-2 uppercase flex items-center justify-center gap-1">
                  <Check className="w-3 h-3" /> Arquivo salvo na nuvem
                </p>
              )}
            </div>
          </div>

          <div className="bg-card border rounded-2xl p-5 shadow-sm space-y-4">
             <p className="text-[10px] font-bold text-muted-foreground uppercase border-b pb-2 flex justify-between">
              <span><CreditCard className="w-3.5 h-3.5 inline mr-1" /> Pagamento</span> 
              <span className="text-primary font-bold">R$ 250,00</span>
            </p>
            <input placeholder="NOME NO CARTÃO" value={cardForm.name} onChange={e => setCardForm({...cardForm, name: e.target.value.toUpperCase()})} className="w-full p-3 border rounded-xl bg-background outline-none uppercase" />
            <input placeholder="0000 0000 0000 0000" value={cardForm.number} onChange={e => setCardForm({...cardForm, number: formatCardNumber(e.target.value)})} className="w-full p-3 border rounded-xl bg-background outline-none font-mono" />
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="MM/AA" value={cardForm.expiry} onChange={e => setCardForm({...cardForm, expiry: formatExpiry(e.target.value)})} className="w-full p-3 border rounded-xl bg-background outline-none text-center" />
              <input placeholder="CVV" value={cardForm.cvv} onChange={e => setCardForm({...cardForm, cvv: formatCVV(e.target.value)})} type="password" className="w-full p-3 border rounded-xl bg-background outline-none text-center" />
            </div>
          </div>

          <button onClick={handleSubscribe} disabled={loading || uploadingFile} className="w-full py-4 bg-primary text-primary-foreground rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all">
            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : "Confirmar Assinatura"}
          </button>
        </div>
      </main>
    </AppLayout>
  );
};

export default BusinessCheckout;