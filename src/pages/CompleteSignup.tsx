import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { User, Phone, IdCard, MapPin, ArrowRight } from "lucide-react";

const CompleteSignup = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    full_name: "",
    cpf: "",
    phone: "",
    address: ""
  });

  // Puxa o fundo e os dados iniciais do Google
  useEffect(() => {
    const loadData = async () => {
      // Carregar Background (mesma lógica do Login/Signup)
      const { data: settings } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "login_bg_url")
        .maybeSingle();
      
      if (settings?.value) {
        const val = typeof settings.value === "string" ? settings.value : JSON.stringify(settings.value).replace(/^"|"$/g, "");
        setBgUrl(val);
      }

      // Carregar Nome do Google
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setFormData(prev => ({
          ...prev,
          full_name: user.user_metadata?.full_name || "",
        }));
      }
    };
    loadData();
  }, []);

  // Máscara de CPF (000.000.000-00)
  const maskCPF = (value: string) => {
    return value
      .replace(/\D/g, "")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})/, "$1-$2")
      .replace(/(-\d{2})\d+?$/, "$1");
  };

  // Máscara de Telefone ((00) 00000-0000)
  const maskPhone = (value: string) => {
    return value
      .replace(/\D/g, "")
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{5})(\d)/, "$1-$2")
      .replace(/(-\d{4})\d+?$/, "$1");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from("profiles") 
      .update({
        full_name: formData.full_name,
        cpf: formData.cpf,
        phone: formData.phone,
        address: formData.address,
      })
      .eq("id", user.id);

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Cadastro finalizado!", description: "Bem-vindo ao Chamô." });
      navigate("/home");
    }
    setLoading(false);
  };

  return (
    <div
      className={`min-h-[100dvh] w-full flex flex-col items-center justify-center px-4 relative ${!bgUrl ? "bg-background" : ""}`}
      style={bgUrl ? { backgroundImage: `url(${bgUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
    >
      {/* Overlay de Blur para legibilidade (Igual ao Login/Signup) */}
      {bgUrl && <div className="absolute inset-0 backdrop-blur-sm bg-[#454545]/[0.12]" />}

      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-gradient mb-2">Chamô</h1>
          <p className="text-sm text-muted-foreground">
            Falta pouco para começar
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card border rounded-2xl p-6 shadow-card space-y-4">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Nome Completo</label>
              <div className="flex items-center gap-2 border rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-primary/30 transition-all">
                <User className="w-4 h-4 text-muted-foreground" />
                <input 
                  required 
                  value={formData.full_name} 
                  onChange={e => setFormData({...formData, full_name: e.target.value})} 
                  className="bg-transparent text-sm outline-none w-full text-foreground placeholder:text-muted-foreground" 
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">CPF</label>
              <div className="flex items-center gap-2 border rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-primary/30 transition-all">
                <IdCard className="w-4 h-4 text-muted-foreground" />
                <input 
                  required 
                  placeholder="000.000.000-00" 
                  value={formData.cpf} 
                  onChange={e => setFormData({...formData, cpf: maskCPF(e.target.value)})} 
                  className="bg-transparent text-sm outline-none w-full text-foreground placeholder:text-muted-foreground" 
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Telefone</label>
              <div className="flex items-center gap-2 border rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-primary/30 transition-all">
                <Phone className="w-4 h-4 text-muted-foreground" />
                <input 
                  required 
                  placeholder="(00) 00000-0000" 
                  value={formData.phone} 
                  onChange={e => setFormData({...formData, phone: maskPhone(e.target.value)})} 
                  className="bg-transparent text-sm outline-none w-full text-foreground placeholder:text-muted-foreground" 
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Onde você mora?</label>
              <div className="flex items-center gap-2 border rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-primary/30 transition-all">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <input 
                  required 
                  placeholder="Cidade - UF" 
                  value={formData.address} 
                  onChange={e => setFormData({...formData, address: e.target.value})} 
                  className="bg-transparent text-sm outline-none w-full text-foreground placeholder:text-muted-foreground" 
                />
              </div>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading} 
            className="w-full flex items-center justify-center gap-2 py-3 mt-2 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all disabled:opacity-50"
          >
            {loading ? "Salvando..." : "Finalizar cadastro"} <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};

export default CompleteSignup;