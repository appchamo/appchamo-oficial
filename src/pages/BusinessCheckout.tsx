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
  const [searchingCep, setSearchingCep] = useState(false);
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
    // Se o arquivo não estiver no estado, mas o input tiver um arquivo (fallback para o refresh do Android)
    const fileInput = document.getElementById('pdf-upload') as HTMLInputElement;
    const finalFile = proofFile || (fileInput?.files ? fileInput.files[0] : null);

    if (!finalFile) {
      toast({ title: "Anexe o arquivo", description: "Selecione o PDF do cartão CNPJ.", variant: "destructive" });
      return;
    }
    
    if (!cardForm.number || !cardForm.name || !businessData.cnpj || !businessData.number) {
      toast({ title: "Campos incompletos", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não logado.");

      const path = `business-proofs/${user.id}/${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage.from("business-proofs").upload(path, finalFile);
      if (uploadError) throw new Error("Erro no upload do PDF.");
      
      const { data: urlData } = supabase.storage.from("business-proofs").getPublicUrl(path);
      const fullAddress = `${businessData.street}, ${businessData.number} - ${businessData.neighborhood}, ${businessData.city}/${businessData.state}`;

      const { error: subError } = await supabase.from("subscriptions").upsert({
        user_id: user.id, plan_id: "business", status: "PENDING",
        business_cnpj: businessData.cnpj, business_address: fullAddress, business_proof_url: urlData.publicUrl
      });

      if (subError) throw subError;

      toast({ title: "Solicitação enviada!" });
      localStorage.removeItem('business_card_draft');
      localStorage.removeItem('business_info_draft');
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
            <div>
               <label className="text-[11px] font-bold text-muted-foreground mb-1 block">CNPJ *</label>
               <input placeholder="00.000.000/0001-00" value={businessData.cnpj} onChange={e => setBusinessData({...businessData, cnpj: formatCNPJ(e.target.value)})} className="w-full p-3 border rounded-xl bg-background outline-none" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-muted-foreground mb-1 block flex items-center gap-1">CEP {searchingCep && <Clock className="w-3 h-3 animate-spin" />}</label>
                <input placeholder="00000-000" value={businessData.cep} onChange={e => handleCepChange(e.target.value)} className="w-full p-3 border rounded-xl bg-background outline-none" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-muted-foreground mb-1 block">Nº *</label>
                <input placeholder="123" value={businessData.number} onChange={e => setBusinessData({...businessData, number: e.target.value})} className="w-full p-3 border rounded-xl bg-background outline-none" />
              </div>
            </div>

            {businessData.street && (
              <div className="p-3 bg-muted/50 rounded-xl border border-dashed text-[11px]">
                <p className="font-bold">{businessData.street}</p>
                <p>{businessData.neighborhood} — {businessData.city}/{businessData.state}</p>
              </div>
            )}

            <div>
              <label className="text-[11px] font-bold text-muted-foreground mb-1 block">Cartão CNPJ (PDF) *</label>
              <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-6 cursor-pointer transition-all ${proofFile ? 'border-emerald-500 bg-emerald-500/5' : 'border-muted-foreground/20'}`}>
                {proofFile ? <FileText className="w-8 h-8 text-emerald-600" /> : <Upload className="w-8 h-8 text-muted-foreground" />}
                <span className="text-sm font-bold text-center text-foreground px-2 truncate w-full">
                  {proofFile ? proofFile.name : "Selecionar PDF"}
                </span>
                <input id="pdf-upload" type="file" className="hidden" accept="application/pdf" onChange={(e) => setProofFile(e.target.files?.[0] || null)} />
              </label>
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

          <button onClick={handleSubscribe} disabled={loading} className="w-full py-4 bg-primary text-primary-foreground rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all">
            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : "Confirmar Assinatura"}
          </button>
        </div>
      </main>
    </AppLayout>
  );
};

export default BusinessCheckout;