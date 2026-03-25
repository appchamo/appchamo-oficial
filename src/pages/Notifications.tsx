import AppLayout from "@/components/AppLayout";
import { Bell, ChevronDown, Loader2, XCircle, Home, UserCheck, Ticket, CalendarCheck, MessageSquare, Wallet, X } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { syncAppIconBadge } from "@/lib/appBadge";
import { useRefreshAtKey } from "@/contexts/RefreshContext";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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

// ─── Lógica de destino por tipo/título ───────────────────────────────────────
const resolveAction = (n: Notification): "navigate" | "modal" => {
  const t = n.title.toLowerCase();
  // Sempre navega se tiver link e for desses tipos
  if (n.type === "rejection") return "modal";
  if (n.type === "coupon" || t.includes("cupom")) return "navigate";
  if (n.type === "appointment" || t.includes("agendamento")) return "navigate";
  if (n.type === "reminder" && n.link) return "navigate";
  if (n.link?.includes("/messages/")) return "navigate";
  if (n.type === "admin" && n.link) return "navigate";
  if (n.type === "support" && n.link) return "navigate";
  if (t.includes("plano") && n.link) return "navigate";
  if ((t.includes("repasse") || t.includes("transferi")) && n.link) return "navigate";
  // Pagamento e qualquer coisa sem destino claro → modal
  return "modal";
};

const resolveDestination = (n: Notification): string => {
  const t = n.title.toLowerCase();
  if (n.type === "coupon" || t.includes("cupom")) return "/coupons";
  if (n.type === "appointment" || t.includes("agendamento")) return n.link || "/meus-agendamentos";
  return n.link || "/home";
};

// ─── Ícone do modal por tipo ──────────────────────────────────────────────────
const ModalIcon = ({ n }: { n: Notification }) => {
  const t = n.title.toLowerCase();
  if (n.type === "rejection") return <XCircle className="w-8 h-8 text-destructive" />;
  if (n.type === "coupon" || t.includes("cupom")) return <Ticket className="w-8 h-8 text-primary" />;
  if (n.type === "appointment" || t.includes("agendamento")) return <CalendarCheck className="w-8 h-8 text-primary" />;
  if (t.includes("mensagem") || t.includes("pagamento") || t.includes("recebeu") || t.includes("recebido")) return <MessageSquare className="w-8 h-8 text-primary" />;
  if (t.includes("repasse") || t.includes("transferi")) return <Wallet className="w-8 h-8 text-primary" />;
  return <Bell className="w-8 h-8 text-primary" />;
};

const Notifications = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [rejectionNotif, setRejectionNotif] = useState<Notification | null>(null);
  const [expandedNotif, setExpandedNotif] = useState<Notification | null>(null);

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
      .range(from, to + 1);

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

  useRefreshAtKey("/notifications", async () => {
    await fetchNotifications(0, false);
  });

  useEffect(() => {
    fetchNotifications(0);

    if (!user) return;

    const channel = supabase
      .channel("notifications-page")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => { fetchNotifications(0); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, fetchNotifications]);

  const handleLoadMore = () => { fetchNotifications(page + 1, true); };

  const handleClick = (n: Notification) => {
    if (n.type === "rejection") {
      setRejectionNotif(n);
      return;
    }
    const action = resolveAction(n);
    if (action === "navigate") {
      navigate(resolveDestination(n));
    } else {
      setExpandedNotif(n);
    }
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
      {/* Modal: cadastro reprovado */}
      <Dialog open={!!rejectionNotif} onOpenChange={(o) => !o && setRejectionNotif(null)}>
        <DialogContent className="max-w-sm">
          <div className="flex flex-col items-center text-center gap-4 py-2">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <XCircle className="w-8 h-8 text-destructive" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground mb-1">Cadastro não aprovado</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {rejectionNotif?.message || "Seu cadastro não foi aprovado. Verifique seus documentos e tente novamente."}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Você pode corrigir as informações e enviar novamente para análise.
            </p>
            <div className="flex flex-col gap-2 w-full pt-1">
              <button
                onClick={() => { setRejectionNotif(null); navigate("/signup-pro"); }}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors"
              >
                <UserCheck className="w-4 h-4" />
                Tornar-se Profissional
              </button>
              <button
                onClick={() => { setRejectionNotif(null); navigate("/home"); }}
                className="w-full py-3 rounded-xl border text-sm font-medium text-foreground flex items-center justify-center gap-2 hover:bg-muted transition-colors"
              >
                <Home className="w-4 h-4" />
                Voltar à Tela Inicial
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: notificação expandida (sem destino específico) */}
      <Dialog open={!!expandedNotif} onOpenChange={(o) => !o && setExpandedNotif(null)}>
        <DialogContent className="max-w-sm">
          <div className="flex flex-col items-center text-center gap-4 py-2">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              {expandedNotif && <ModalIcon n={expandedNotif} />}
            </div>
            <div className="w-full">
              <h2 className="text-base font-bold text-foreground mb-2 leading-tight">
                {expandedNotif?.title}
              </h2>
              {expandedNotif?.message && (
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                  {sanitizeMessage(expandedNotif.message)}
                </p>
              )}
              <p className="text-[11px] text-muted-foreground/60 mt-3">
                {expandedNotif && timeAgo(expandedNotif.created_at)}
              </p>
            </div>
            {/* Se tiver link, mostra botão de ir junto com o fechar */}
            {expandedNotif?.link && (
              <Button
                className="w-full"
                onClick={() => { setExpandedNotif(null); navigate(expandedNotif.link!); }}
              >
                Abrir
              </Button>
            )}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setExpandedNotif(null)}
            >
              <X className="w-4 h-4 mr-1" /> Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
              const action = resolveAction(n);
              // Ícone de indicação do tipo de ação
              const ActionHint = () => {
                if (action === "navigate") {
                  const t = n.title.toLowerCase();
                  if (n.type === "coupon" || t.includes("cupom")) return <Ticket className="w-3.5 h-3.5 text-muted-foreground/50" />;
                  if (n.type === "appointment" || t.includes("agendamento")) return <CalendarCheck className="w-3.5 h-3.5 text-muted-foreground/50" />;
                  if (n.link?.includes("/messages/")) return <MessageSquare className="w-3.5 h-3.5 text-muted-foreground/50" />;
                }
                return null;
              };

              return (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`w-full text-left p-4 rounded-xl border transition-colors ${
                    n.read ? "bg-card" : "bg-primary/5 border-primary/20"
                  } hover:bg-muted/50 active:scale-[0.99]`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${n.read ? "bg-transparent" : "bg-primary"}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${n.read ? "text-foreground" : "font-semibold text-foreground"}`}>{n.title}</p>
                      {message && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{message}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <span className="text-[10px] text-muted-foreground">{timeAgo(n.created_at)}</span>
                      <ActionHint />
                    </div>
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
                {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronDown className="w-4 h-4" />}
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
