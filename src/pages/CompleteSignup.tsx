import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { User, Phone, IdCard, MapPin, ArrowRight, Building2, Search } from "lucide-react";

type AccountType = "client" | "professional";

const CompleteSignup = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"type" | "data">("type");
  const [accountType, setAccountType] = useState<AccountType>("client");
  const [bgUrl, setBgUrl] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    full_name: "",
    cpf: "",
    phone: "",
    cep: "",
    street: "",
    number: "",
    neighborhood: "",
    city: "",
    state: ""
  });

  useEffect(() => {
    const loadData = async () => {
      const { data: settings } = await supabase.from("platform_settings").select("value").eq("key", "login_bg_url").maybeSingle();
      if (settings?.value) {
        const val = typeof settings.value === "string" ? settings.value : JSON.stringify(settings.value).replace(/^"|"$/g, "");
        setBgUrl(val);
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setFormData(prev => ({ ...prev, full_name: user.user_metadata?.full_name || "" }));
      }
    };
    loadData();
  }, []);

  const handleFetchAddress = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, "");
    if (cleanCep.length === 8) {
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const data = await response.json();
        if (!data.erro) {
          setFormData(prev => ({
            ...prev,
            street: data.logradouro,
            neighborhood: data.bairro,
            city: data.localidade,
            state: data.uf
          }));
        }
      } catch (e) { console.error("Erro CEP"); }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const fullAddress = `${formData.street}, ${formData.number} - ${formData.neighborhood}, ${formData.city}/${formData.state}`;

    // ✅ ESTRATÉGIA DE SALVAMENTO:
    // Tentamos salvar no campo 'address'. Se o seu banco usa outro nome, 
    // a gente captura o erro e avisa exatamente qual coluna falta.
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: formData.full_name,
        cpf: formData.cpf,
        phone: formData.phone,
        address: fullAddress, // Se der erro aqui, o nome no seu banco é outro
        onboarding_completed: true
      } as any)
      .eq("id", user.id);

    if (error) {
      toast({ 
        title: "Quase lá!", 
        description: "O campo 'address' não foi achado. Verifique o nome da coluna de endereço no seu banco de dados.", 
        variant: "destructive" 
      });
      console.log("Erro do Banco:", error.message);
    } else {
      toast({ title: "Bem-vindo!", description: "Cadastro finalizado com sucesso." });
      navigate(accountType === "professional" ? "/pro-dashboard" : "/home");
    }
    setLoading(false);
  };

  const mCPF = (v: string) => v.replace(/\D/g, "").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})/, "$1-$2").replace(/(-\d{2})\d+?$/, "$1");
  const mPhone = (v: string) => v.replace(/\D/g, "").replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2").replace(/(-\d{4})\d+?$/, "$1");
  const mCEP = (v: string) => v.replace(/\D/g, "").replace(/(\d{5})(\d)/, "$1-$2").replace(/(-\d{3})\d+?$/, "$1");

  return (
    <div className={`min-h-[100dvh] w-full flex flex-col items-center justify-center px-4 relative ${!bgUrl ? "bg-background" : ""}`}
      style={bgUrl ? { backgroundImage: `url(${bgUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
      {bgUrl && <div className="absolute inset-0 backdrop-blur-sm bg-[#454545]/[0.12]" />}

      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-gradient mb-2">Chamô</h1>
          <p className="text-sm text-muted-foreground">Escolha como quer usar o app</p>
        </div>

        {step === "type" ? (
          <div className="space-y-4 animate-in fade-in zoom-in-95 duration-300">
            <button onClick={() => { setAccountType("client"); setStep("data"); }} className="w-full p-6 bg-card border hover:border-primary rounded-2xl flex items-center gap-4 transition-all shadow-sm">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center"><User className="text-primary" /></div>
              <div className="text-left"><b className="block font-bold">Sou Cliente</b><span className="text-xs text-muted-foreground">Quero contratar profissionais</span></div>
            </button>
            <button onClick={() => { setAccountType("professional"); setStep("data"); }} className="w-full p-6 bg-card border hover:border-primary rounded-2xl flex items-center gap-4 transition-all shadow-sm">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center"><Building2 className="text-primary" /></div>
              <div className="text-left"><b className="block font-bold">Sou Profissional</b><span className="text-xs text-muted-foreground">Quero oferecer meus serviços</span></div>
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-card border rounded-2xl p-6 shadow-card space-y-3">
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Dados Pessoais</label>
                <input required placeholder="Nome Completo" value={formData.full_name} onChange={e => setFormData({ ...formData, full_name: e.target.value })} className="w-full bg-muted/20 border rounded-xl px-3 py-2.5 text-sm outline-none" />
                <input required placeholder="CPF" value={formData.cpf} onChange={e => setFormData({ ...formData, cpf: mCPF(e.target.value) })} className="w-full bg-muted/20 border rounded-xl px-3 py-2.5 text-sm outline-none" />
                <input required placeholder="Telefone" value={formData.phone} onChange={e => setFormData({ ...formData, phone: mPhone(e.target.value) })} className="w-full bg-muted/20 border rounded-xl px-3 py-2.5 text-sm outline-none" />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Endereço</label>
                <div className="relative">
                  <input required placeholder="CEP" value={formData.cep} onChange={e => { const v = mCEP(e.target.value); setFormData({ ...formData, cep: v }); handleFetchAddress(v); }} className="w-full bg-muted/20 border rounded-xl px-3 py-2.5 text-sm outline-none" />
                  <Search className="absolute right-3 top-3 w-4 h-4 text-muted-foreground" />
                </div>

                {formData.city && (
                  <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                    <input required placeholder="Rua" value={formData.street} onChange={e => setFormData({ ...formData, street: e.target.value })} className="w-full bg-muted/20 border rounded-xl px-3 py-2.5 text-sm outline-none" />
                    <div className="grid grid-cols-2 gap-2">
                      <input required placeholder="Nº" value={formData.number} onChange={e => setFormData({ ...formData, number: e.target.value })} className="w-full bg-muted/20 border rounded-xl px-3 py-2.5 text-sm outline-none" />
                      <input required placeholder="Bairro" value={formData.neighborhood} onChange={e => setFormData({ ...formData, neighborhood: e.target.value })} className="w-full bg-muted/20 border rounded-xl px-3 py-2.5 text-sm outline-none" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <button type="submit" disabled={loading} className="w-full py-3 mt-2 rounded-xl bg-primary text-white font-bold hover:opacity-90 transition-all shadow-md flex items-center justify-center gap-2">
              {loading ? "Processando..." : "Finalizar cadastro"} <ArrowRight className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => setStep("type")} className="w-full text-xs text-muted-foreground text-center py-2 hover:underline">Voltar e alterar perfil</button>
          </form>
        )}
      </div>
    </div>
  );
};

export default CompleteSignup;