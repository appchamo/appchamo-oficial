import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRefresh } from "@/contexts/RefreshContext";
import { ArrowLeft, HelpCircle, Plus, RefreshCw } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import PullToRefresh from "@/components/PullToRefresh";

interface Ticket {
  id: string;
  protocol: string | null;
  subject: string;
  status: string;
  created_at: string;
}

const Support = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const scrollContainerRef = useRef<HTMLElement | null>(null);

  const loadTickets = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await supabase
        .from("support_tickets")
        .select("id, protocol, subject, status, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setTickets((data as Ticket[]) || []);
    } catch {
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTickets();
    setRefreshing(false);
  }, [loadTickets]);

  useEffect(() => {
    if (!user) return;
    loadTickets();
  }, [user, loadTickets]);

  useRefresh(handleRefresh);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("support-tickets-updates")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "support_tickets", filter: `user_id=eq.${user.id}` },
        () => { loadTickets(); }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_tickets", filter: `user_id=eq.${user.id}` },
        () => { loadTickets(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, loadTickets]);

  const openTicketWithSubject = async (
    subject: string,
    ticketMessage: string,
    firstThreadMessage?: string
  ) => {
    if (!user?.id) return;
    setCreating(true);
    try {
      const { data: newTicket, error } = await supabase
        .from("support_tickets")
        .insert({ user_id: user.id, subject, message: ticketMessage })
        .select("id")
        .single();
      if (error || !newTicket?.id) {
        setCreating(false);
        return;
      }
      if (firstThreadMessage) {
        await supabase.from("support_messages").insert({
          user_id: user.id,
          sender_id: user.id,
          ticket_id: newTicket.id,
          content: firstThreadMessage,
        });
      }
      const [{ data: supportProfile }, { data: adminProfile }] = await Promise.all([
        supabase.from("profiles").select("user_id").eq("email", "suporte@appchamo.com").maybeSingle(),
        supabase.from("profiles").select("user_id").eq("email", "admin@appchamo.com").maybeSingle(),
      ]);
      const notifRows: any[] = [];
      if (supportProfile?.user_id) notifRows.push({ user_id: supportProfile.user_id, title: "🎧 Nova solicitação de suporte", message: subject, type: "support", link: "/suporte-desk" });
      if (adminProfile?.user_id) notifRows.push({ user_id: adminProfile.user_id, title: "🎧 Novo Suporte", message: subject, type: "support", link: "/suporte-desk" });
      if (notifRows.length > 0) await supabase.from("notifications").insert(notifRows as any);
      if (firstThreadMessage) {
        navigate(`/support/${newTicket.id}`);
      } else {
        navigate(`/support/${newTicket.id}`, { state: { initialMessage: subject } });
      }
    } finally {
      setCreating(false);
    }
  };

  /** Abre ticket com o texto do botão como assunto e primeira mensagem (para a IA). */
  const openTicketWithMessage = (buttonLabel: string, subject?: string) => {
    openTicketWithSubject(subject ?? buttonLabel, "", buttonLabel);
  };

  const handleNewTicket = () => {
    openTicketWithSubject("Nova solicitação", "Abertura de suporte", "Quero falar com um atendente humano");
  };

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );

  return (
    <div className="h-[100dvh] bg-background flex flex-col pb-20 overflow-hidden">
      <header className="flex-shrink-0 z-30 bg-amber-500/90 backdrop-blur-md border-b border-amber-600/30">
        <div className="flex items-center gap-3 px-4 py-2.5 max-w-screen-lg mx-auto">
          <Link to="/home" className="p-1.5 rounded-lg hover:bg-amber-600/20 transition-colors">
            <ArrowLeft className="w-5 h-5 text-white" />
          </Link>
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
            <HelpCircle className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">Suporte Chamô</p>
            <p className="text-[10px] text-white/70">Suas solicitações</p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 rounded-lg hover:bg-amber-600/20 transition-colors disabled:opacity-60"
            aria-label="Atualizar"
          >
            <RefreshCw className={`w-5 h-5 text-white ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      <PullToRefresh scrollContainerRef={scrollContainerRef}>
      <main
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden max-w-screen-lg mx-auto w-full px-4 py-4"
      >
        {/* Botão principal de nova solicitação */}
        <button
          onClick={handleNewTicket}
          disabled={creating}
          className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-primary text-primary-foreground font-semibold text-base hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50 shadow-sm mb-6"
        >
          <Plus className="w-5 h-5" />
          {creating ? "Abrindo..." : "Nova Solicitação"}
        </button>

        {/* Lista de solicitações anteriores */}
        {tickets.length > 0 && (
          <p className="text-sm font-medium text-foreground mb-2">Suas solicitações</p>
        )}
        {tickets.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            <HelpCircle className="w-10 h-10 mx-auto mb-3 text-amber-500/40" />
            <p className="font-medium">Nenhuma solicitação ainda</p>
            <p className="text-xs mt-1">Toque em "Nova Solicitação" para abrir um atendimento.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {tickets.map((t) => (
              <Link
                key={t.id}
                to={`/support/${t.id}`}
                className="flex items-center gap-3 bg-card border rounded-xl p-4 hover:border-primary/30 hover:shadow-card transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <HelpCircle className="w-5 h-5 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm text-foreground truncate">{t.protocol || "Suporte"}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      t.status === "closed" ? "bg-muted text-muted-foreground" : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    }`}>
                      {t.status === "closed" ? "Encerrado" : "Aberto"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(t.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
      </PullToRefresh>
      <BottomNav />
    </div>
  );
};

export default Support;
