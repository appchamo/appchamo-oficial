import AdminLayout from "@/components/AdminLayout";
import { Users, BadgeCheck, Megaphone, CreditCard, Ticket, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const actionMap: Record<string, string> = {
  change_plan: "Alterar plano",
  toggle_visibility: "Alternar visibilidade",
  approve_professional: "Aprovar profissional",
  reject_professional: "Rejeitar profissional",
  block_user: "Bloquear usuário",
  unblock_user: "Desbloquear usuário",
  delete_user: "Excluir usuário",
  create_coupon: "Criar cupom",
  delete_coupon: "Excluir cupom",
  create_sponsor: "Criar patrocinador",
  update_sponsor: "Atualizar patrocinador",
  delete_sponsor: "Excluir patrocinador",
  update_settings: "Atualizar configurações",
  create_banner: "Criar banner",
  delete_banner: "Excluir banner",
  update_banner: "Atualizar banner",
  create_category: "Criar categoria",
  update_category: "Atualizar categoria",
  delete_category: "Excluir categoria",
  reply_support: "Responder suporte",
};
const translateAction = (action: string) => actionMap[action] || action.replace(/_/g, " ");
const translateTargetType = (type: string | null) => {
  if (!type) return "";
  const map: Record<string, string> = { user: "usuário", professional: "profissional", sponsor: "patrocinador", coupon: "cupom", banner: "banner", category: "categoria", settings: "configurações" };
  return map[type] || type;
};

const AdminDashboard = () => {
  const [stats, setStats] = useState({
    users: 0, pros: 0, sponsors: 0, transactions: "0", coupons: 0, fees: "0",
  });
  const [recentLogs, setRecentLogs] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const [
        { count: usersCount },
        { count: prosCount },
        { count: sponsorsCount },
        { count: couponsCount },
        { data: summaryData },
        { data: logsData },
      ] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("professionals").select("*", { count: "exact", head: true }),
        supabase.from("sponsors").select("*", { count: "exact", head: true }),
        supabase.from("coupons").select("*", { count: "exact", head: true }),
        supabase.rpc("get_transaction_summary"),
        supabase.from("admin_logs").select("*").order("created_at", { ascending: false }).limit(5),
      ]);

      const summary = Array.isArray(summaryData) ? summaryData[0] : summaryData;
      const totalVol = Number(summary?.total_volume || 0);
      const totalFees = Number(summary?.total_fees || 0);

      setStats({
        users: usersCount || 0,
        pros: prosCount || 0,
        sponsors: sponsorsCount || 0,
        transactions: totalVol >= 1000 ? `R$ ${(totalVol / 1000).toFixed(1)}k` : `R$ ${totalVol.toLocaleString("pt-BR")}`,
        coupons: couponsCount || 0,
        fees: totalFees >= 1000 ? `R$ ${(totalFees / 1000).toFixed(1)}k` : `R$ ${totalFees.toLocaleString("pt-BR")}`,
      });
      setRecentLogs(logsData || []);
    };
    fetchData();
  }, []);

  const statCards = [
    { icon: Users, label: "Usuários", value: stats.users.toLocaleString("pt-BR"), path: "/admin/users", color: "text-primary" },
    { icon: BadgeCheck, label: "Profissionais", value: stats.pros.toLocaleString("pt-BR"), path: "/admin/pros", color: "text-primary" },
    { icon: Megaphone, label: "Patrocinadores", value: stats.sponsors.toLocaleString("pt-BR"), path: "/admin/sponsors", color: "text-primary" },
    { icon: CreditCard, label: "Transações", value: stats.transactions, path: "/admin/transactions", color: "text-primary" },
    { icon: Ticket, label: "Cupons", value: stats.coupons.toLocaleString("pt-BR"), path: "/admin/coupons", color: "text-primary" },
    { icon: TrendingUp, label: "Comissões", value: stats.fees, path: "/admin/transactions", color: "text-primary" },
  ];

  return (
    <AdminLayout title="Dashboard">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        {statCards.map((stat) => (
          <Link key={stat.label} to={stat.path}
            className="bg-card border rounded-xl p-4 hover:border-primary/30 hover:shadow-card transition-all group">
            <stat.icon className={`w-5 h-5 ${stat.color} mb-2`} />
            <p className="text-2xl font-bold text-foreground">{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
          </Link>
        ))}
      </div>

      <h2 className="font-semibold text-foreground mb-3">Atividade recente</h2>
      {recentLogs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Nenhuma atividade registrada</div>
      ) : (
        <div className="bg-card border rounded-xl divide-y">
          {recentLogs.map((item) => (
            <div key={item.id} className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium text-foreground">{translateAction(item.action)}</p>
                <p className="text-xs text-muted-foreground">{translateTargetType(item.target_type)} {item.target_id ? `· ${item.target_id.slice(0, 8)}...` : ""}</p>
              </div>
              <span className="text-[10px] text-muted-foreground">{new Date(item.created_at).toLocaleString("pt-BR")}</span>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
};

export default AdminDashboard;
