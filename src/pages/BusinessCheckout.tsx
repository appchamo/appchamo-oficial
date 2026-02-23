import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CreditCard, Building2, Upload, Loader2, FileText } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const BusinessCheckout = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);

  const [cardForm, setCardForm] = useState(() => {
    const saved = localStorage.getItem('business_card_draft');
    return saved ? JSON.parse(saved) : { number: "", name: "", expiry: "", cvv: "" };
  });

  const [businessData, setBusinessData] = useState(() => {
    const saved = localStorage.getItem('business_info_draft');
    return saved ? JSON.parse(saved) : { cnpj: "", cep: "", number: "" };
  });

  useEffect(() => {
    localStorage.setItem('business_card_draft', JSON.stringify(cardForm));
    localStorage.setItem('business_info_draft', JSON.stringify(businessData));
  }, [cardForm, businessData]);

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
    if (!cardForm.number || !cardForm.name || !businessData.cnpj || !proofFile) {
      toast({ title: "Preencha tudo", description: "Dados do cartão, CNPJ e comprovante PDF são obrigatórios.", variant: "destructive" });
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

      // Aqui os dados são salvos no banco. 
      // O status fica PENDING para você aprovar manualmente depois.
      const { error: subError } = await supabase.from("subscriptions").upsert({
        user_id: user.id,
        plan_id: "business",
        status: "PENDING",
        business_cnpj: businessData.cnpj,
        business_proof_url: urlData.publicUrl
      });

      if (subError) throw subError;

      toast({ title: "Assinatura solicitada!", description: "Analisaremos seu CNPJ em breve." });
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
      <main className="max-w-md mx-auto px-4 py-5">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>

        <h1 className="text-xl font-bold mb-6">Assinatura Business</h1>

        <div className="space-y-6">
          <div className="bg-card border p-5 rounded-2xl shadow-sm space-y-4">
            <p className="text-[10px] font-bold text-primary uppercase flex items-center gap-1"><Building2 className="w-3 h-3" /> Dados da Empresa</p>
            <input 
              placeholder="CNPJ" 
              value={businessData.cnpj}
              onChange={e => setBusinessData({...businessData, cnpj: e.target.value})}
              className="w-full p-3 border rounded-xl bg-background outline-none focus:ring-2 focus:ring-primary/30"
            />
            <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-6 cursor-pointer transition-all ${proofFile ? 'border-primary bg-primary/5' : 'border-muted-foreground/20'}`}>
              {proofFile ? <FileText className="w-8 h-8 text-primary" /> : <Upload className="w-8 h-8 text-muted-foreground" />}
              <span className="text-sm font-medium text-center">{proofFile ? proofFile.name : "Anexar Cartão CNPJ (PDF)"}</span>
              <input type="file" className="hidden" accept="application/pdf" onChange={handleFileChange} />
            </label>
          </div>

          <div className="bg-card border p-5 rounded-2xl shadow-sm space-y-4">
            <p className="text-[10px] font-bold text-primary uppercase flex items-center gap-1"><CreditCard className="w-3 h-3" /> Pagamento (R$ 250,00/mês)</p>
            <input 
              placeholder="Nome no Cartão" 
              value={cardForm.name}
              onChange={e => setCardForm({...cardForm, name: e.target.value.toUpperCase()})}
              className="w-full p-3 border rounded-xl bg-background outline-none focus:ring-2 focus:ring-primary/30 uppercase"
            />
            <input 
              placeholder="Número do Cartão" 
              value={cardForm.number}
              onChange={e => setCardForm({...cardForm, number: e.target.value})}
              className="w-full p-3 border rounded-xl bg-background outline-none focus:ring-2 focus:ring-primary/30"
            />
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="MM/AA" value={cardForm.expiry} onChange={e => setCardForm({...cardForm, expiry: e.target.value})} className="p-3 border rounded-xl bg-background outline-none" />
              <input placeholder="CVV" value={cardForm.cvv} onChange={e => setCardForm({...cardForm, cvv: e.target.value})} className="p-3 border rounded-xl bg-background outline-none" />
            </div>
          </div>

          <button onClick={handleSubscribe} disabled={loading} className="w-full py-4 bg-primary text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50">
            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : "Confirmar Assinatura"}
          </button>
        </div>
      </main>
    </AppLayout>
  );
};

export default BusinessCheckout;