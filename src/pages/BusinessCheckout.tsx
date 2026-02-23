import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { ArrowLeft, Send, Upload, Loader2, FileText, CreditCard, Building2 } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const BusinessCheckout = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  
  // Igual ao das vagas: salva o texto para não perder no refresh
  const [form, setForm] = useState(() => {
    const saved = localStorage.getItem(`business_form_draft`);
    return saved ? JSON.parse(saved) : { cnpj: "", address: "", card_name: "", card_number: "", expiry: "", cvv: "" };
  });

  useEffect(() => {
    localStorage.setItem(`business_form_draft`, JSON.stringify(form));
  }, [form]);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/login");
        return;
      }
      setLoading(false);
    };
    checkAuth();
  }, [navigate]);

  const handleApply = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (!form.cnpj || !form.card_number || !resumeFile) {
      toast({ title: "Preencha os dados e anexe o PDF", variant: "destructive" });
      return;
    }

    setApplying(true);

    try {
      // 1. Upload do Arquivo (Exatamente como nas vagas)
      const ext = resumeFile.name.split(".").pop();
      const path = `business-proofs/${user.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("business-proofs").upload(path, resumeFile);
      
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("business-proofs").getPublicUrl(path);

      // 2. Salva a Assinatura
      const { error } = await supabase.from("subscriptions").upsert({
        user_id: user.id,
        plan_id: "business",
        status: "PENDING",
        business_cnpj: form.cnpj,
        business_address: form.address,
        business_proof_url: urlData.publicUrl,
      });

      if (error) throw error;

      toast({ title: "Solicitação enviada!" });
      localStorage.removeItem(`business_form_draft`);
      navigate("/profile");

    } catch (err) {
      toast({ title: "Erro ao enviar", variant: "destructive" });
    } finally {
      setApplying(false);
    }
  };

  if (loading) return <div className="p-10 text-center">Carregando...</div>;

  return (
    <AppLayout>
      <main className="max-w-md mx-auto px-4 py-5">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>

        <h1 className="text-xl font-bold mb-6">Assinatura Business</h1>

        <div className="space-y-5 bg-card border p-5 rounded-2xl shadow-sm">
          {/* Dados da Empresa */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-primary uppercase flex items-center gap-1"><Building2 className="w-3 h-3" /> Empresa</p>
            <input 
              placeholder="CNPJ"
              value={form.cnpj} 
              onChange={e => setForm({...form, cnpj: e.target.value})} 
              className="w-full border rounded-xl px-4 py-3 bg-background outline-none" 
            />
            <input 
              placeholder="Endereço"
              value={form.address} 
              onChange={e => setForm({...form, address: e.target.value})} 
              className="w-full border rounded-xl px-4 py-3 bg-background outline-none" 
            />
          </div>

          {/* Upload (O segredo que funcionou nas vagas) */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-primary uppercase ml-1">Cartão CNPJ (PDF)</p>
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-6 cursor-pointer hover:bg-muted/50 transition-all border-muted-foreground/20">
              {resumeFile ? <FileText className="w-6 h-6 text-primary" /> : <Upload className="w-6 h-6 text-primary" />}
              <span className="text-sm font-medium text-center">
                {resumeFile ? resumeFile.name : "Clique para selecionar PDF"}
              </span>
              <input 
                type="file" 
                className="hidden" 
                accept="application/pdf" 
                onChange={e => setResumeFile(e.target.files?.[0] || null)} 
              />
            </label>
          </div>

          {/* Pagamento */}
          <div className="space-y-3 pt-2">
            <p className="text-[10px] font-bold text-primary uppercase flex items-center gap-1"><CreditCard className="w-3 h-3" /> Pagamento</p>
            <input 
              placeholder="Número do Cartão"
              value={form.card_number} 
              onChange={e => setForm({...form, card_number: e.target.value})} 
              className="w-full border rounded-xl px-4 py-3 bg-background outline-none" 
            />
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="MM/AA" value={form.expiry} onChange={e => setForm({...form, expiry: e.target.value})} className="border rounded-xl px-4 py-3 bg-background outline-none" />
              <input placeholder="CVV" value={form.cvv} onChange={e => setForm({...form, cvv: e.target.value})} className="border rounded-xl px-4 py-3 bg-background outline-none" />
            </div>
          </div>

          <button 
            onClick={handleApply} 
            disabled={applying}
            className="w-full py-4 bg-primary text-primary-foreground rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-transform active:scale-95"
          >
            {applying ? <Loader2 className="animate-spin w-5 h-5" /> : "Finalizar Assinatura"}
          </button>
        </div>
      </main>
    </AppLayout>
  );
};

export default BusinessCheckout;