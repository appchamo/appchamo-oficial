import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, FileText, Upload } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const BusinessCheckout = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);

  // Estados simples - Sem máscaras para não pesar a RAM
  const [cnpj, setCnpj] = useState("");
  const [address, setAddress] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");

  const handleApply = async () => {
    if (!proofFile || !cnpj || !cardNumber) {
      toast({ title: "Preencha os campos obrigatórios e o PDF", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Upload do PDF
      const path = `business-proofs/${user.id}/${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage.from("business-proofs").upload(path, proofFile);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("business-proofs").getPublicUrl(path);

      // 2. Salva no Banco
      const { error: subError } = await supabase.from("subscriptions").upsert({
        user_id: user.id,
        plan_id: "business",
        status: "PENDING",
        business_cnpj: cnpj,
        business_address: address,
        business_proof_url: urlData.publicUrl
      });

      if (subError) throw subError;

      toast({ title: "Enviado com sucesso!" });
      navigate("/profile");
    } catch (err: any) {
      toast({ title: "Erro ao enviar", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <main className="max-w-md mx-auto px-4 py-5">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm mb-6 text-muted-foreground">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>

        <h1 className="text-xl font-bold mb-6">Assinatura Business</h1>

        <div className="space-y-4">
          {/* Sessão Empresa */}
          <div className="bg-white border rounded-xl p-4 space-y-3 shadow-sm">
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Empresa</p>
            <input placeholder="CNPJ (Somente números)" value={cnpj} onChange={e => setCnpj(e.target.value)} className="w-full p-3 border rounded-lg bg-gray-50 outline-none" />
            <input placeholder="Endereço completo" value={address} onChange={e => setAddress(e.target.value)} className="w-full p-3 border rounded-lg bg-gray-50 outline-none" />
            
            <label className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-6 cursor-pointer ${proofFile ? 'border-green-500 bg-green-50' : 'border-gray-300'}`}>
              {proofFile ? <FileText className="text-green-600 mb-2" /> : <Upload className="text-gray-400 mb-2" />}
              <span className="text-sm font-medium truncate w-full text-center">
                {proofFile ? proofFile.name : "Selecionar Cartão CNPJ (PDF)"}
              </span>
              <input type="file" className="hidden" accept="application/pdf" onChange={e => setProofFile(e.target.files?.[0] || null)} />
            </label>
          </div>

          {/* Sessão Pagamento */}
          <div className="bg-white border rounded-xl p-4 space-y-3 shadow-sm">
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Cartão (R$ 250,00)</p>
            <input placeholder="Nome no cartão" value={cardName} onChange={e => setCardName(e.target.value)} className="w-full p-3 border rounded-lg bg-gray-50 outline-none" />
            <input placeholder="Número do cartão" value={cardNumber} onChange={e => setCardNumber(e.target.value)} className="w-full p-3 border rounded-lg bg-gray-50 outline-none" />
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="MM/AA" value={expiry} onChange={e => setExpiry(e.target.value)} className="p-3 border rounded-lg bg-gray-50 outline-none" />
              <input placeholder="CVV" value={cvv} onChange={e => setCvv(e.target.value)} className="p-3 border rounded-lg bg-gray-50 outline-none" />
            </div>
          </div>

          <button 
            onClick={handleApply} 
            disabled={loading}
            className="w-full py-4 bg-primary text-white rounded-xl font-bold flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" /> : "Finalizar Assinatura"}
          </button>
        </div>
      </main>
    </AppLayout>
  );
};

export default BusinessCheckout;