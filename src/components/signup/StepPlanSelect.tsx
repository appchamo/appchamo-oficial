import { useState, useEffect } from "react";
import { Check, Crown, Star, Briefcase, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Plan {
  id: string;
  name: string;
  description?: string;
  price_monthly: number;
  max_calls: number;
  has_featured: boolean;
  has_verified_badge: boolean;
  has_product_catalog: boolean;
  has_job_postings: boolean;
  has_in_app_support: boolean;
  has_vip_event: boolean;
  features?: string[]; // ✅ AGORA PUXA OS TEXTOS DO PAINEL ADMIN
}

interface Props {
  onSelect: (planId: string) => void;
  onBack: () => void;
}

const planIcons: Record<string, typeof Crown> = {
  free: Zap,
  pro: Star,
  vip: Crown,
  business: Briefcase,
};

const planColors: Record<string, string> = {
  free: "border-muted",
  pro: "border-primary/40",
  vip: "border-amber-400",
  business: "border-purple-500",
};

const StepPlanSelect = ({ onSelect, onBack }: Props) => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selected, setSelected] = useState("free");

  useEffect(() => {
    // Busca os planos do banco de dados e ordena conforme configurado no Admin
    supabase
      .from("plans")
      .select("*")
      .eq("active", true)
      .order("sort_order")
      .then(({ data }) => {
        setPlans((data as Plan[]) || []);
      });
  }, []);

  // ✅ NOVA FUNÇÃO: Puxa o que você escreveu no Admin
  const getBenefits = (plan: Plan) => {
    // 1. Se você escreveu uma lista de benefícios no painel admin (coluna features), ele usa ela
    if (plan.features && Array.isArray(plan.features) && plan.features.length > 0) {
      return plan.features;
    }
    
    // 2. Fallback (Garantia): Se a coluna de texto estiver vazia, ele monta pelas opções antigas
    const list: string[] = [];
    list.push(plan.max_calls === -1 ? "Chamadas ilimitadas" : `${plan.max_calls} chamadas/mês`);
    if (plan.has_in_app_support) list.push("Suporte no app");
    if (plan.has_featured) list.push("Destaque na busca");
    if (plan.has_verified_badge) list.push("Selo verificado");
    if (plan.has_product_catalog) list.push("Catálogo de produtos");
    if (plan.has_job_postings) list.push("Publicar vagas");
    if (plan.has_vip_event) list.push("Eventos VIP");
    return list;
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-start px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-4">
          <h1 className="text-2xl font-extrabold text-gradient mb-1">Chamô</h1>
          <p className="text-sm text-muted-foreground">Escolha seu plano</p>
          <button onClick={onBack} className="text-xs text-primary mt-1 hover:underline">← Voltar</button>
        </div>

        <div className="flex flex-col gap-3 mb-4">
          {plans.map((plan) => {
            const Icon = planIcons[plan.id] || Zap;
            const isSelected = selected === plan.id;
            
            return (
              <button
                key={plan.id}
                onClick={() => setSelected(plan.id)}
                className={`relative text-left bg-card border-2 rounded-2xl p-4 transition-all ${
                  isSelected 
                    ? planColors[plan.id] + " shadow-card ring-2 ring-primary/20" 
                    : "border-border hover:border-primary/20"
                }`}
              >
                {isSelected && (
                  <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <Check className="w-3 h-3 text-primary-foreground" />
                  </div>
                )}
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    plan.id === "vip" ? "bg-amber-100 dark:bg-amber-900/30" : 
                    plan.id === "business" ? "bg-purple-100 dark:bg-purple-900/30" : "bg-accent"
                  }`}>
                    <Icon className={`w-5 h-5 ${
                      plan.id === "vip" ? "text-amber-500" : 
                      plan.id === "business" ? "text-purple-500" : "text-primary"
                    }`} />
                  </div>
                  <div>
                    <p className="font-bold text-foreground">{plan.name}</p>
                    {/* ✅ Exibição de preço formatada e sincronizada com o banco */}
                    <p className="text-xs text-muted-foreground">
                      {Number(plan.price_monthly) === 0 
                        ? "Grátis" 
                        : `R$ ${Number(plan.price_monthly).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mês`}
                    </p>
                  </div>
                </div>

                {/* ✅ Renderiza os benefícios atualizados em tempo real */}
                <ul className="space-y-1 mt-3">
                  {getBenefits(plan).map((benefitText, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <Check className="w-3 h-3 text-primary flex-shrink-0 mt-0.5" /> 
                      <span className="leading-tight">{benefitText}</span>
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => onSelect(selected)}
          className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
        >
          {selected === "free" ? "Começar com plano Grátis" : "Selecionar plano"}
        </button>

        <p className="text-center text-[10px] text-muted-foreground mt-2">
          Você pode alterar seu plano a qualquer momento.
        </p>
      </div>
    </div>
  );
};

export default StepPlanSelect;