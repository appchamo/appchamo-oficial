import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck, CreditCard } from "lucide-react";

interface SubscriptionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  planId: string;
  onSuccess: () => void;
}

// Funções de Máscara
const formatCardNumber = (val: string) => {
  return val.replace(/\D/g, "").replace(/(\d{4})(?=\d)/g, "$1 ").slice(0, 19);
};

const formatExpiry = (val: string) => {
  return val.replace(/\D/g, "").replace(/(\d{2})(?=\d)/, "$1/").slice(0, 5);
};

const formatCVV = (val: string) => {
  return val.replace(/\D/g, "").slice(0, 4);
};

const formatCpfCnpj = (val: string) => {
  const v = val.replace(/\D/g, "");
  if (v.length <= 11) {
    return v.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  } else {
    return v.replace(/(\d{2})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1/$2").replace(/(\d{4})(\d{1,2})$/, "$1-$2").slice(0, 18);
  }
};

const formatCEP = (val: string) => {
  return val.replace(/\D/g, "").replace(/(\d{5})(\d)/, "$1-$2").slice(0, 9);
};

export default function SubscriptionDialog({ isOpen, onClose, planId, onSuccess }: SubscriptionDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    holderName: "",
    number: "",
    expiry: "", 
    ccv: "",
    cpfCnpj: "",
    postalCode: "",
    addressNumber: "",
  });

  const handleSubscribe = async () => {
    // 1. Validações Locais
    if (!formData.holderName || !formData.number || !formData.expiry || !formData.ccv || !formData.cpfCnpj || !formData.postalCode || !formData.addressNumber) {
      toast({ title: "Atenção", description: "Preencha todos os campos do pagamento.", variant: "destructive" });
      return;
    }

    if (formData.number.length < 19) {
      toast({ title: "Cartão inválido", description: "Verifique o número do cartão.", variant: "destructive" });
      return;
    }

    if (formData.expiry.length !== 5 || !formData.expiry.includes("/")) {
      toast({ title: "Validade inválida", description: "Preencha no formato MM/AA.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não logado");

      const planValues = { pro: "49.90", vip: "140.00", business: "250.00" };
      const value = planValues[planId as keyof typeof planValues];

      // ✅ BLINDAGEM: Garante que a data sempre vai ser extraída corretamente
      const parts = formData.expiry.split("/");
      const expMonth = parts[0];
      const expYear = `20${parts[1]}`;

      // ✅ Limpeza de todos os dados antes de enviar pro Asaas
      const payload = {
        holderName: formData.holderName.trim(),
        number: formData.number.replace(/\s/g, ""), 
        expiryMonth: expMonth,
        expiryYear: expYear,
        ccv: formData.ccv,
        cpfCnpj: formData.cpfCnpj.replace(/\D/g, ""), 
        postalCode: formData.postalCode.replace(/\D/g, ""),
        addressNumber: formData.addressNumber.trim(),
        userId: user.id,
        email: user.email,
        planId: planId,
        value: value,
      };

      const { data, error } = await supabase.functions.invoke("create-subscription", {
        body: payload
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error); // Pega erro interno do Asaas se houver

      toast({ title: "Assinatura realizada!", description: "Seu plano foi processado com sucesso." });
      onSuccess();
    } catch (error: any) {
      toast({ title: "Erro no pagamento", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md overflow-y-auto max-h-[90vh] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <ShieldCheck className="w-5 h-5" /> Dados do Pagamento
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs font-semibold text-muted-foreground ml-1 mb-1 block">Nome no cartão</label>
            <input 
              placeholder="NOME COMPLETO" 
              value={formData.holderName}
              className="w-full p-3 border rounded-xl bg-background outline-none focus:border-primary focus:ring-1 focus:ring-primary uppercase transition-all" 
              onChange={e => setFormData({...formData, holderName: e.target.value.toUpperCase()})} 
            />
          </div>
          
          <div>
            <label className="text-xs font-semibold text-muted-foreground ml-1 mb-1 block">Número do cartão</label>
            <div className="relative">
              <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input 
                placeholder="0000 0000 0000 0000" 
                value={formData.number}
                maxLength={19}
                className="w-full p-3 pl-9 border rounded-xl bg-background outline-none focus:border-primary focus:ring-1 focus:ring-primary font-mono transition-all" 
                onChange={e => setFormData({...formData, number: formatCardNumber(e.target.value)})} 
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground ml-1 mb-1 block">Validade</label>
              <input 
                placeholder="MM/AA" 
                value={formData.expiry}
                maxLength={5}
                className="w-full p-3 border rounded-xl bg-background outline-none focus:border-primary focus:ring-1 focus:ring-primary font-mono transition-all text-center" 
                onChange={e => setFormData({...formData, expiry: formatExpiry(e.target.value)})} 
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground ml-1 mb-1 block">CVV</label>
              <input 
                placeholder="123" 
                value={formData.ccv}
                maxLength={4}
                type="password"
                className="w-full p-3 border rounded-xl bg-background outline-none focus:border-primary focus:ring-1 focus:ring-primary font-mono transition-all text-center" 
                onChange={e => setFormData({...formData, ccv: formatCVV(e.target.value)})} 
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground ml-1 mb-1 block">CPF ou CNPJ do titular</label>
            <input 
              placeholder="000.000.000-00" 
              value={formData.cpfCnpj}
              maxLength={18}
              className="w-full p-3 border rounded-xl bg-background outline-none focus:border-primary focus:ring-1 focus:ring-primary font-mono transition-all" 
              onChange={e => setFormData({...formData, cpfCnpj: formatCpfCnpj(e.target.value)})} 
            />
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground ml-1 mb-1 block">CEP</label>
              <input 
                placeholder="00000-000" 
                value={formData.postalCode}
                maxLength={9}
                className="w-full p-3 border rounded-xl bg-background outline-none focus:border-primary focus:ring-1 focus:ring-primary font-mono transition-all" 
                onChange={e => setFormData({...formData, postalCode: formatCEP(e.target.value)})} 
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground ml-1 mb-1 block">Nº da Residência</label>
              <input 
                placeholder="Ex: 123" 
                value={formData.addressNumber}
                className="w-full p-3 border rounded-xl bg-background outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" 
                onChange={e => setFormData({...formData, addressNumber: e.target.value})} 
              />
            </div>
          </div>

          <button 
            onClick={handleSubscribe} 
            disabled={loading}
            className="w-full py-3.5 mt-2 bg-primary hover:bg-primary/90 transition-colors text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : "Confirmar Assinatura"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}