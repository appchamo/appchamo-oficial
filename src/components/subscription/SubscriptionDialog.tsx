import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck } from "lucide-react";

interface SubscriptionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  planId: string;
  onSuccess: () => void;
}

export default function SubscriptionDialog({ isOpen, onClose, planId, onSuccess }: SubscriptionDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    holderName: "",
    number: "",
    expiryMonth: "",
    expiryYear: "",
    ccv: "",
    cpfCnpj: "",
    postalCode: "",
    addressNumber: "",
  });

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não logado");

      const planValues = { pro: "49.90", vip: "140.00", business: "250.00" };
      const value = planValues[planId as keyof typeof planValues];

      const { data, error } = await supabase.functions.invoke("create-subscription", {
        body: {
          ...formData,
          userId: user.id,
          email: user.email,
          planId: planId,
          value: value,
        }
      });

      if (error) throw error;

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
      <DialogContent className="max-w-md overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="text-primary" /> Dados do Pagamento
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-3 py-4">
          <input placeholder="Nome no cartão" className="w-full p-2 border rounded" 
            onChange={e => setFormData({...formData, holderName: e.target.value})} />
          
          <input placeholder="Número do cartão" className="w-full p-2 border rounded" 
            onChange={e => setFormData({...formData, number: e.target.value})} />
          
          <div className="grid grid-cols-3 gap-2">
            <input placeholder="Mês (MM)" className="p-2 border rounded" onChange={e => setFormData({...formData, expiryMonth: e.target.value})} />
            <input placeholder="Ano (AAAA)" className="p-2 border rounded" onChange={e => setFormData({...formData, expiryYear: e.target.value})} />
            <input placeholder="CVV" className="p-2 border rounded" onChange={e => setFormData({...formData, ccv: e.target.value})} />
          </div>

          <input placeholder="CPF ou CNPJ" className="w-full p-2 border rounded" 
            onChange={e => setFormData({...formData, cpfCnpj: e.target.value})} />
          
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="CEP" className="p-2 border rounded" onChange={e => setFormData({...formData, postalCode: e.target.value})} />
            <input placeholder="Nº da Residência" className="p-2 border rounded" onChange={e => setFormData({...formData, addressNumber: e.target.value})} />
          </div>

          <button 
            onClick={handleSubscribe} 
            disabled={loading}
            className="w-full py-3 bg-primary text-white rounded-xl font-bold flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" /> : "Confirmar Assinatura"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}