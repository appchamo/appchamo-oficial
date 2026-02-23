import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CreditCard, Building2, Upload, Loader2, Check, FileText, ShieldCheck, Lock, FileUp } from "lucide-react";
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
  const [step, setStep] = useState(1); // 1: Dados, 2: Upload
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchingCep, setSearchingCep] = useState(false);
  
  const [cardForm, setCardForm] = useState({ number: "", name: "", expiry: "", cvv: "" });
  const [businessData, setBusinessData] = useState({ cnpj: "", cep: "", street: "", number: "", neighborhood: "", city: "", state: "" });

  // Tenta recuperar se o usuário já passou do passo 1 (ajuda no refresh do Android)
  useEffect(() => {
    const savedStep = localStorage.getItem('business_step');
    if (savedStep === '2') setStep(2);

    const savedBus = localStorage.getItem('bus_data');
    if (savedBus) setBusinessData(JSON.parse(savedBus));
  }, []);

  const handleCepChange = async (value: string) => {
    const rawCep = value.replace(/\D/g, "");
    setBusinessData(d => ({ ...d, cep: formatCEP(value) }));
    if (rawCep.length === 8) {
      setSearchingCep(true);
      try {
        const res = await fetch(`https://viacep.com.br/ws/${rawCep}/json/`);
        const data = await res.json();
        if (!data.erro) {
          const newData = { ...businessData, cep: formatCEP(value), street: data.logradouro, neighborhood: data.bairro, city: data.localidade, state: data.uf };
          setBusinessData(newData);
          localStorage.setItem('bus_data', JSON.stringify(newData));
        }
      } finally { setSearchingCep(false); }
    }
  };

  const goToStep2 = () => {
    if (!businessData.cnpj || !businessData.number || !cardForm.number) {
      toast({ title: "Preencha os dados", variant: "destructive" });
      return;
    }
    localStorage.setItem('business_step', '2');
    localStorage.setItem('bus_data', JSON.stringify(businessData));
    setStep(2);
    window.scrollTo(0, 0);
  };

  const handleUploadAndFinish = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast({ title: "Apenas PDF", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Logue novamente");

      // Faz o upload direto
      const path = `business-proofs/${user.id}/${Date.now()}.pdf`;
      await supabase.storage.from("business-proofs").upload(path, file);
      const { data: urlData } = supabase.storage.from("business-proofs").getPublicUrl(path);

      // Salva no banco
      const fullAddress = `${businessData.street}, ${businessData.number} - ${businessData.neighborhood}, ${businessData.city}/${businessData.state}`;
      await supabase.from("subscriptions").upsert({
        user_id: user.id, plan_id: "business", status: "PENDING",
        business_cnpj: businessData.cnpj, business_address: fullAddress, business_proof_url: urlData.publicUrl
      });

      toast({ title: "Sucesso!", description: "Sua assinatura está em análise." });
      localStorage.removeItem('business_step');
      localStorage.removeItem('bus_data');
      navigate("/profile");
    } catch (err: any) {
      toast({ title: "Erro", description: "Ocorreu um erro no upload. Tente novamente.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <AppLayout>
      <main className="max-w-md mx-auto px-4 py-5 pb-10">
        
        {step === 1 ? (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center"><CreditCard className="w-6 h-6 text-primary" /></div>
              <div><h1 className="text-xl font-bold">Plano Business</h1><p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Passo 1 de 2</p></div>
            </div>

            <div className="space-y-5">
              <div className="bg-card border rounded-2xl p-5 shadow-sm space-y-4">
                <p className="text-[10px] font-bold text-muted-foreground uppercase border-b pb-2">Dados da Empresa</p>
                <input placeholder="CNPJ" value={businessData.cnpj} onChange={e => setBusinessData({...businessData, cnpj: formatCNPJ(e.target.value)})} className="w-full p-3 border rounded-xl bg-background outline-none" />
                <div className="grid grid-cols-2 gap-3">
                  <input placeholder="CEP" value={businessData.cep} onChange={e => handleCepChange(e.target.value)} className="w-full p-3 border rounded-xl bg-background outline-none" />
                  <input placeholder="Nº" value={businessData.number} onChange={e => setBusinessData({...businessData, number: e.target.value})} className="w-full p-3 border rounded-xl bg-background outline-none" />
                </div>
              </div>

              <div className="bg-card border rounded-2xl p-5 shadow-sm space-y-4">
                <p className="text-[10px] font-bold text-muted-foreground uppercase border-b pb-2">Cartão de Crédito</p>
                <input placeholder="NOME NO CARTÃO" value={cardForm.name} onChange={e => setCardForm({...cardForm, name: e.target.value.toUpperCase()})} className="w-full p-3 border rounded-xl bg-background outline-none" />
                <input placeholder="NÚMERO DO CARTÃO" value={cardForm.number} onChange={e => setCardForm({...cardForm, number: formatCardNumber(e.target.value)})} className="w-full p-3 border rounded-xl bg-background outline-none" />
                <div className="grid grid-cols-2 gap-3">
                  <input placeholder="MM/AA" value={cardForm.expiry} onChange={e => setCardForm({...cardForm, expiry: formatExpiry(e.target.value)})} className="w-full p-3 border rounded-xl bg-background outline-none text-center" />
                  <input placeholder="CVV" value={cardForm.cvv} onChange={e => setCardForm({...cardForm, cvv: formatCVV(e.target.value)})} type="password" className="w-full p-3 border rounded-xl bg-background outline-none text-center" />
                </div>
              </div>

              <button onClick={goToStep2} className="w-full py-4 bg-primary text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg">
                Próximo Passo <ArrowLeft className="w-4 h-4 rotate-180" />
              </button>
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in zoom-in-95 duration-300">
            <button onClick={() => setStep(1)} className="flex items-center gap-2 text-sm text-muted-foreground mb-6"><ArrowLeft className="w-4 h-4" /> Voltar aos dados</button>
            
            <div className="flex flex-col items-center text-center mb-8">
              <div className="w-20 h-20 rounded-3xl bg-emerald-500/10 flex items-center justify-center mb-4">
                <FileUp className="w-10 h-10 text-emerald-600" />
              </div>
              <h1 className="text-2xl font-bold">Último Passo!</h1>
              <p className="text-muted-foreground text-sm mt-2 px-6">Precisamos do PDF do seu cartão CNPJ para validar sua empresa.</p>
            </div>

            <div className="bg-card border-2 border-dashed border-emerald-500/30 rounded-3xl p-8 shadow-sm">
               <label className="flex flex-col items-center justify-center cursor-pointer group">
                  {uploading ? (
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="w-12 h-12 text-primary animate-spin" />
                      <p className="text-sm font-bold text-primary animate-pulse">Enviando documento...</p>
                    </div>
                  ) : (
                    <>
                      <div className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg group-active:scale-90 transition-transform mb-4">
                        <Upload className="w-8 h-8" />
                      </div>
                      <p className="font-bold text-lg">Selecionar PDF</p>
                      <p className="text-xs text-muted-foreground mt-1">Toque aqui para abrir sua galeria</p>
                    </>
                  )}
                  <input type="file" className="hidden" accept="application/pdf" onChange={handleUploadAndFinish} disabled={uploading} />
               </label>
            </div>

            <div className="mt-8 p-4 bg-muted/50 rounded-2xl flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-muted-foreground mt-0.5" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Se a página atualizar ao selecionar o arquivo, não se preocupe. O Chamô vai te manter nesta tela de upload para você tentar novamente.
              </p>
            </div>
          </div>
        )}
      </main>
    </AppLayout>
  );
};

export default BusinessCheckout;