import { Home, Search, MessageSquare, Bell, User } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
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

  useEffect(() => {
    let cancelled = false;

    const fetchBadges = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      // Unread notifications count
      const { count: notifCount } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("read", false);

      // Unread chat messages count
      // Get all service_requests where user is client or professional
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
        // Get read statuses
        const { data: readStatuses } = await supabase
          .from("chat_read_status")
          .select("request_id, last_read_at")
          .eq("user_id", user.id)
          .in("request_id", allReqIds);

        const readMap = new Map((readStatuses || []).map(rs => [rs.request_id, rs.last_read_at]));

        // For each request, count unread messages
        for (const reqId of allReqIds) {
          const lastRead = readMap.get(reqId);
          let query = supabase
            .from("chat_messages")
            .select("*", { count: "exact", head: true })
            .eq("request_id", reqId)
            .neq("sender_id", user.id);

          if (lastRead) {
            query = query.gt("created_at", lastRead);
          }

          const { count } = await query;
          totalUnread += count || 0;
        }
      }

      if (!cancelled) {
        setBadges({ chat: totalUnread, notifications: notifCount || 0 });
      }
    };

    fetchBadges();

    // Subscribe to realtime changes for notifications and chat_messages
    const channel = supabase
      .channel("bottom-nav-badges")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => { fetchBadges(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, () => { fetchBadges(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_read_status" }, () => { fetchBadges(); })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md border-t safe-area-bottom">
      <div className="flex items-center justify-around max-w-screen-lg mx-auto h-16">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.path || location.pathname.startsWith(tab.path + "/");
          const badgeCount = tab.badgeKey ? badges[tab.badgeKey] : 0;
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors relative ${
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className="relative">
                <tab.icon className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : ""}`} />
                {badgeCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center px-1">
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
