import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Upload, Loader2, FileText, Check } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const BusinessCheckout = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [hasFile, setHasFile] = useState(false);
  
  const [form, setForm] = useState(() => {
    const saved = localStorage.getItem(`bus_draft`);
    return saved ? JSON.parse(saved) : { cnpj: "", card: "" };
  });

  useEffect(() => {
    localStorage.setItem(`bus_draft`, JSON.stringify(form));
  }, [form]);

  // ✅ BLOQUEIO DE REFRESH: Se o Android tentar atualizar, ele vai perguntar se você quer sair
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const handleFileChange = () => {
    if (fileInputRef.current?.files?.[0]) {
      setHasFile(true);
      toast({ title: "Arquivo detectado!" });
    }
  };

  const handleFinish = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file || !form.cnpj) {
      toast({ title: "Preencha o CNPJ e selecione o PDF", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const path = `business-proofs/${user.id}/${Date.now()}.pdf`;
      await supabase.storage.from("business-proofs").upload(path, file);
      const { data: urlData } = supabase.storage.from("business-proofs").getPublicUrl(path);

      await supabase.from("subscriptions").upsert({
        user_id: user.id,
        plan_id: "business",
        status: "PENDING",
        business_cnpj: form.cnpj,
        business_proof_url: urlData.publicUrl,
      });

      toast({ title: "Sucesso!" });
      localStorage.removeItem("bus_draft");
      navigate("/profile");
    } catch (err) {
      toast({ title: "Erro no envio", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <main className="max-w-md mx-auto px-4 py-8">
        <button onClick={() => navigate(-1)} className="mb-6 flex items-center gap-2 text-muted-foreground">
          <ArrowLeft size={18} /> Voltar
        </button>

        <div className="bg-card border rounded-2xl p-6 shadow-sm space-y-6">
          <h1 className="text-xl font-bold text-center">Assinatura Business</h1>

          <input 
            placeholder="Digite seu CNPJ" 
            value={form.cnpj}
            onChange={e => setForm({...form, cnpj: e.target.value})}
            className="w-full p-4 border rounded-xl bg-background outline-none focus:ring-2 focus:ring-primary"
          />

          <div 
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer transition-colors ${hasFile ? 'border-green-500 bg-green-50' : 'border-muted-foreground/20'}`}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="application/pdf" 
              onChange={handleFileChange}
            />
            {hasFile ? <Check className="text-green-600 mb-2" /> : <Upload className="text-muted-foreground mb-2" />}
            <span className="text-sm font-medium">
              {hasFile ? "PDF Selecionado" : "Toque para selecionar o PDF"}
            </span>
          </div>

          <button 
            onClick={handleFinish} 
            disabled={loading}
            className="w-full py-4 bg-primary text-white rounded-xl font-bold shadow-lg disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin mx-auto" /> : "Finalizar Agora"}
          </button>
        </div>
      </main>
    </AppLayout>
  );
};

export default BusinessCheckout;