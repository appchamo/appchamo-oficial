import AppLayout from "@/components/AppLayout";
import { ProfessionalSealIcon } from "@/components/seals/ProfessionalSealIcon";
import { Users, Briefcase, DollarSign, Pencil, CreditCard, ShoppingBag, FileText, Image, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const ProfessionalDashboard = () => {
  const { user, profile } = useAuth();
  const { plan } = useSubscription();
  const [requestCount, setRequestCount] = useState(0);
  const [proId, setProId] = useState<string | null>(null);
  const [sealRows, setSealRows] = useState<
    { id: string; title: string; description: string; icon_variant: string; is_special: boolean; awarded: boolean }[]
  >([]);

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

        const [{ data: defs }, { data: awarded }] = await Promise.all([
          supabase
            .from("professional_seal_definitions" as never)
            .select("id, title, description, icon_variant, is_special, sort_order")
            .eq("is_active", true)
            .order("sort_order", { ascending: true }),
          supabase.from("professional_seals_awarded" as never).select("seal_id").eq("professional_id", pro.id),
        ]);
        const earned = new Set((awarded as { seal_id: string }[] | null)?.map((a) => a.seal_id) ?? []);
        const list = (defs as { id: string; title: string; description: string; icon_variant: string; is_special: boolean }[] | null) ?? [];
        setSealRows(
          list.map((d) => ({
            ...d,
            awarded: earned.has(d.id),
          }))
        );
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
    { icon: Wallet, label: "Carteira", description: "Saldo a receber e recebido", path: "/pro/financeiro" },
    { icon: DollarSign, label: "Extrato", description: "Relatório de faturamento", path: "/pro/financeiro?tab=transactions" },
    { icon: CreditCard, label: "Minha assinatura", description: "Gerencie seu plano", path: "/subscriptions" },
    ...(plan?.id === "business" && profile?.user_type === "company"
      ? [{ icon: ShoppingBag, label: "Catálogo de Produtos", description: "Gerencie seus produtos e serviços", path: "/my-catalog" }]
      : (plan?.id === "pro" || plan?.id === "vip")
        ? [{ icon: Image, label: "Serviços", description: "Fotos dos seus trabalhos no perfil", path: "/my-services" }]
        : []),
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

        {proId && sealRows.length > 0 && (
          <section className="mb-6">
            <h2 className="font-semibold text-foreground mb-2">Meus selos</h2>
            <p className="text-xs text-muted-foreground mb-3">
              Conquistas da plataforma. Os selos são atualizados automaticamente conforme seus resultados.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {sealRows.map((s) => (
                <div
                  key={s.id}
                  className={`rounded-xl border bg-card p-3 flex flex-col items-center text-center gap-2 ${
                    s.is_special && s.awarded
                      ? "border-amber-400/50 shadow-[0_0_16px_rgba(251,191,36,0.15)]"
                      : s.awarded
                        ? "border-primary/20"
                        : "opacity-80"
                  }`}
                >
                  <ProfessionalSealIcon variant={s.icon_variant} size={48} earned={s.awarded} />
                  <p className="text-xs font-semibold text-foreground leading-tight">{s.title}</p>
                  <p className="text-[10px] text-muted-foreground leading-snug line-clamp-3">{s.description}</p>
                  {!s.awarded && (
                    <span className="text-[10px] font-medium text-muted-foreground">Em progresso</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

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
