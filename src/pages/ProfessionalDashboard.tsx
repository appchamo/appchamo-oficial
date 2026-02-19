import AppLayout from "@/components/AppLayout";
import { Eye, Users, Briefcase, DollarSign, Pencil, CreditCard, ShoppingBag, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const ProfessionalDashboard = () => {
  const { user, profile } = useAuth();
  const [requestCount, setRequestCount] = useState(0);
  const [proId, setProId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: pro } = await supabase
        .from("professionals")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (pro) {
        setProId(pro.id);
        const { count } = await supabase
          .from("service_requests")
          .select("*", { count: "exact", head: true })
          .eq("professional_id", pro.id);
        setRequestCount(count || 0);
      }
    };
    load();
  }, [user]);

  const stats = [
    { icon: Users, label: "Solicitações", value: String(requestCount) },
    { icon: Briefcase, label: "Serviços fechados", value: "—" },
  ];

  const actions = [
    { icon: Pencil, label: "Editar perfil", description: "Atualize suas informações", path: "/profile" },
    { icon: DollarSign, label: "Financeiro", description: "Relatório de faturamento", path: "/pro/financeiro" },
    { icon: CreditCard, label: "Minha assinatura", description: "Gerencie seu plano", path: "/subscriptions" },
    ...(profile?.user_type === "company" ? [
      { icon: ShoppingBag, label: "Catálogo de Produtos", description: "Gerencie seus produtos e serviços", path: "/my-catalog" },
    ] : []),
    { icon: FileText, label: "Vagas de Emprego", description: "Publique e gerencie vagas", path: "/my-jobs" },
  ];

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5">
        <h1 className="text-xl font-bold text-foreground mb-5">Painel Profissional</h1>
        <div className="grid grid-cols-2 gap-3 mb-6">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-card border rounded-xl p-4 shadow-card">
              <stat.icon className="w-5 h-5 text-primary mb-2" />
              <p className="text-xl font-bold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
        <h2 className="font-semibold text-foreground mb-3">Ações rápidas</h2>
        <div className="flex flex-col gap-2">
          {actions.map((action) => (
            <Link
              key={action.label}
              to={action.path}
              className="flex items-center gap-3 bg-card border rounded-xl p-4 hover:border-primary/30 hover:shadow-card transition-all group text-left w-full"
            >
              <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                <action.icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm text-foreground">{action.label}</p>
                <p className="text-xs text-muted-foreground">{action.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </AppLayout>
  );
};

export default ProfessionalDashboard;
