import { Home, Search, MessageSquare, Bell, User } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const tabs = [
  { icon: Home, label: "Início", path: "/home" },
  { icon: Search, label: "Buscar", path: "/search" },
  { icon: MessageSquare, label: "Chat", path: "/messages", badgeKey: "chat" as const },
  { icon: Bell, label: "Notificações", path: "/notifications", badgeKey: "notifications" as const },
  { icon: User, label: "Perfil", path: "/profile" },
];

const BottomNav = () => {
  const location = useLocation();
  const [badges, setBadges] = useState<{ chat: number; notifications: number }>({ chat: 0, notifications: 0 });

  // 🛡️ TRAVA DE DEBOUNCE: Impede que o Realtime crie loops de requisição
  const isFetchingRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchBadges = useCallback(async () => {
    // Se já estiver buscando ou se estiver no cooldown de debounce, ignora
    if (isFetchingRef.current) return;

    try {
      isFetchingRef.current = true;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Unread notifications count (exclui chat; mensagens só no push)
      const { count: notifCount } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("read", false)
        .neq("type", "chat");

      // 2. Unread chat messages count
      const { data: clientReqs } = await supabase
        .from("service_requests")
        .select("id")
        .eq("client_id", user.id);

      const { data: proData } = await supabase
        .from("professionals")
        .select("id")
        .eq("user_id", user.id);

      let proReqIds: string[] = [];
      if (proData && proData.length > 0) {
        const { data: proReqs } = await supabase
          .from("service_requests")
          .select("id")
          .in("professional_id", proData.map(p => p.id));
        proReqIds = (proReqs || []).map(r => r.id);
      }

      const allReqIds = [
        ...new Set([
          ...(clientReqs || []).map(r => r.id),
          ...proReqIds,
        ]),
      ];

      let totalUnread = 0;
      if (allReqIds.length > 0) {
        const { data: readStatuses } = await supabase
          .from("chat_read_status")
          .select("request_id, last_read_at, manual_unread")
          .eq("user_id", user.id)
          .in("request_id", allReqIds);

        const readMap = new Map((readStatuses || []).map(rs => [rs.request_id, rs]));

        // Para evitar N+1 gigantesco se houver muitos chats, vamos rodar em paralelo os counts limitados
        const promises = allReqIds.map(async (reqId) => {
          const statusData = readMap.get(reqId) || { last_read_at: null, manual_unread: false };
          
          if (statusData.manual_unread) {
             return 1;
          }

          let query = supabase
            .from("chat_messages")
            .select("*", { count: "exact", head: true })
            .eq("request_id", reqId)
            .neq("sender_id", user.id);

          if (statusData.last_read_at) {
            query = query.gt("created_at", statusData.last_read_at);
          }

          const { count } = await query;
          return count || 0;
        });

        const counts = await Promise.all(promises);
        totalUnread = counts.reduce((a, b) => a + b, 0);
      }

      setBadges({ chat: totalUnread, notifications: notifCount || 0 });
    } catch (err) {
      console.error("Erro no fetchBadges:", err);
    } finally {
      // Libera a trava base após 1 segundo para evitar re-render imediato
      setTimeout(() => {
        isFetchingRef.current = false;
      }, 1000);
    }
  }, []);

  // 🛡️ Função wrapper para o Realtime (Debounce de 3 segundos)
  const debouncedFetchBadges = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      fetchBadges();
    }, 3000); // Aguarda 3 segundos de "silêncio" no canal para buscar
  }, [fetchBadges]);

  useEffect(() => {
    fetchBadges();

    // Realtime: atualiza badges em qualquer mudança nas tabelas relevantes
    const channel = supabase
      .channel("bottom-nav-badges")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, debouncedFetchBadges)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, debouncedFetchBadges)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_read_status" }, debouncedFetchBadges)
      .on("postgres_changes", { event: "*", schema: "public", table: "service_requests" }, debouncedFetchBadges)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [fetchBadges, debouncedFetchBadges]);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md border-t safe-area-bottom">
      <div className="flex items-center justify-around max-w-screen-lg mx-auto h-16">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.path || location.pathname.startsWith(tab.path + "/");
          const badgeCount = tab.badgeKey ? badges[tab.badgeKey] : 0;
          const handleTabClick = (e: React.MouseEvent) => {
            if (isActive) {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }
          };
          return (
            <Link
              key={tab.path}
              to={tab.path}
              onClick={handleTabClick}
              className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors relative ${
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className="relative">
                <tab.icon className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : ""}`} />
                {badgeCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center px-1 shadow-sm">
                    {badgeCount > 99 ? "99+" : badgeCount}
                  </span>
                )}
              </div>
              <span className={`text-[10px] font-medium ${isActive ? "font-semibold" : ""}`}>
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;