import AppLayout from "@/components/AppLayout";
import { Bell, ChevronDown, Loader2 } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { syncAppIconBadge } from "@/lib/appBadge";

interface Notification {
  id: string;
  title: string;
  message: string | null;
  type: string;
  read: boolean;
  link: string | null;
  created_at: string;
}

const PAGE_SIZE = 7;

const Notifications = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);

  const fetchNotifications = useCallback(async (pageIndex = 0, append = false) => {
    if (!user) return;
    if (pageIndex === 0) setLoading(true); else setLoadingMore(true);

    const from = pageIndex * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .neq("type", "chat")
      .order("created_at", { ascending: false })
      .range(from, to + 1); // fetch 1 extra to detect hasMore

    const items = ((data as Notification[]) || []).slice(0, PAGE_SIZE);
    const more = (data?.length ?? 0) > PAGE_SIZE;

    if (append) {
      setNotifications((prev) => [...prev, ...items]);
    } else {
      setNotifications(items);
    }
    setHasMore(more);
    setPage(pageIndex);

    if (pageIndex === 0) setLoading(false); else setLoadingMore(false);

    // Mark all unread as read silently
    if (pageIndex === 0) {
      const unread = items.filter((n) => !n.read);
      if (unread.length > 0) {
        await supabase
          .from("notifications")
          .update({ read: true })
          .eq("user_id", user.id)
          .eq("read", false)
          .neq("type", "chat");
      }
      syncAppIconBadge(0);
    }
  }, [user]);

  useEffect(() => {
    fetchNotifications(0);

    if (!user) return;

    const channel = supabase
      .channel("notifications-page")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => { fetchNotifications(0); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, fetchNotifications]);

  const handleLoadMore = () => {
    fetchNotifications(page + 1, true);
  };

  const handleClick = (n: Notification) => {
    if (n.link) navigate(n.link);
  };

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "agora";
    if (mins < 60) return `${mins}min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  const sanitizeMessage = (msg: string | null): string | null => {
    if (!msg) return null;
    const cleaned = msg.replace(/"}\s*$/, "").replace(/\}"\s*$/, "").trim();
    return cleaned || null;
  };

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-foreground">Notificações</h1>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-accent flex items-center justify-center mb-4">
              <Bell className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Nenhuma notificação no momento</p>
            <p className="text-xs text-muted-foreground mt-1">Você será notificado sobre novos pedidos, mensagens e atualizações.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => {
              const message = sanitizeMessage(n.message);
              return (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`w-full text-left p-4 rounded-xl border transition-colors ${
                    n.read ? "bg-card" : "bg-primary/5 border-primary/20"
                  } hover:bg-muted/50`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${n.read ? "bg-transparent" : "bg-primary"}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${n.read ? "text-foreground" : "font-semibold text-foreground"}`}>{n.title}</p>
                      {message && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{message}</p>}
                    </div>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">{timeAgo(n.created_at)}</span>
                  </div>
                </button>
              );
            })}

            {hasMore && (
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-muted-foreground/30 text-sm text-muted-foreground hover:bg-muted/40 transition-colors disabled:opacity-50"
              >
                {loadingMore ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
                {loadingMore ? "Carregando..." : "Ver mais"}
              </button>
            )}
          </div>
        )}
      </main>
    </AppLayout>
  );
};

export default Notifications;
