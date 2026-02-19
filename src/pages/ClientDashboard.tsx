import AppLayout from "@/components/AppLayout";
import { FileText, CreditCard, Ticket, MessageSquare, User } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const ClientDashboard = () => {
  const [requestCount, setRequestCount] = useState(0);
  const [couponCount, setCouponCount] = useState(0);
  const [seenRequests, setSeenRequests] = useState(false);
  const [seenCoupons, setSeenCoupons] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [{ count: rq }, { count: cp }] = await Promise.all([
        supabase.from("service_requests").select("*", { count: "exact", head: true })
          .eq("client_id", user.id)
          .in("status", ["pending", "accepted"]),
        supabase.from("coupons").select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("used", false),
      ]);
      setRequestCount(rq || 0);
      setCouponCount(cp || 0);
    };
    load();
  }, []);

  const dashboardItems = [
    { icon: FileText, label: "Meus pedidos", description: `${requestCount} solicitações ativas`, path: "/client/requests", count: !seenRequests ? requestCount : 0, onSee: () => setSeenRequests(true) },
    { icon: CreditCard, label: "Histórico de pagamentos", description: "Veja suas transações", path: "/client/requests" },
    { icon: Ticket, label: "Meus cupons", description: `${couponCount} cupons disponíveis`, path: "/coupons", count: !seenCoupons ? couponCount : 0, onSee: () => setSeenCoupons(true) },
    { icon: MessageSquare, label: "Mensagens", description: "Converse com profissionais", path: "/messages" },
    { icon: User, label: "Meu perfil", description: "Edite suas informações", path: "/profile" },
  ];

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5">
        <h1 className="text-xl font-bold text-foreground mb-5">Meu Painel</h1>
        <div className="flex flex-col gap-2">
          {dashboardItems.map((item) => (
            <Link key={item.label} to={item.path} onClick={item.onSee} className="flex items-center gap-3 bg-card border rounded-xl p-4 hover:border-primary/30 hover:shadow-card transition-all group">
              <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                <item.icon className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
              {item.count != null && item.count > 0 && (
                <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">{item.count}</span>
              )}
            </Link>
          ))}
        </div>
      </main>
    </AppLayout>
  );
};

export default ClientDashboard;
