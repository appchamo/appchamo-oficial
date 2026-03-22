import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRefresh } from "@/contexts/RefreshContext";
import { ArrowLeft, HelpCircle, Plus, RefreshCw, User, Briefcase, AlertTriangle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import PullToRefresh from "@/components/PullToRefresh";

/** Fluxo oficial do suporte Chamô – botões alinhados ao prompt da IA (OpenAI). */
const SUPPORT_FLOW = {
  /** Tela 1 – Identificação */
  identification: {
    message: "Olá! Bem-vindo ao suporte do Chamô.\nComo você está usando o app hoje?",
    buttons: [
      { label: "Sou Cliente", value: "client" as const },
      { label: "Sou Profissional", value: "professional" as const },
    ],
  },
  /** Fluxo Cliente – textos exatos para a IA */
  client: [
    "Encontrar profissional",
    "Falar com profissional",
    "Contratar serviço",
    "Cancelar serviço",
    "Problema com pagamento",
    "Solicitar reembolso",
    "Reclamar de profissional",
    "Avaliar serviço",
    "Problema técnico",
    "Outro assunto",
  ],
  /** Fluxo Profissional */
  professional: [
    "Criar cadastro",
    "Enviar documentos",
    "Aprovação do perfil",
    "Assinatura",
    "Recebimentos",
    "Problema no chat",
    "Cliente não pagou",
    "Conta bloqueada",
    "Problema técnico",
    "Outro assunto",
  ],
  /** Casos sensíveis – prioridade */
  sensitive: {
    message: "Esse caso é prioridade para nós.",
    buttons: [
      { label: "Abrir chamado urgente", subject: "Chamado urgente" },
      { label: "Falar com atendente humano", subject: "Atendente humano" },
    ],
  },
} as const;

interface Ticket {
  id: string;
  protocol: string | null;
  subject: string;
  status: string;
  created_at: string;
}

type SupportStep = "identification" | "client" | "professional";

const Support = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [step, setStep] = useState<SupportStep>("identification");
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
        {step === "identification" && (
          <>
            <p className="text-sm font-medium text-foreground mb-4 whitespace-pre-line">
              {SUPPORT_FLOW.identification.message}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <button
                onClick={() => setStep("client")}
                disabled={creating}
                className="flex items-center gap-3 w-full p-4 rounded-xl border border-border bg-card hover:border-amber-500/50 hover:bg-amber-500/5 transition-colors text-left disabled:opacity-50"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                  <User className="w-5 h-5 text-amber-600" />
                </div>
                <span className="font-medium text-sm text-foreground">{SUPPORT_FLOW.identification.buttons[0].label}</span>
              </button>
              <button
                onClick={() => setStep("professional")}
                disabled={creating}
                className="flex items-center gap-3 w-full p-4 rounded-xl border border-border bg-card hover:border-amber-500/50 hover:bg-amber-500/5 transition-colors text-left disabled:opacity-50"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                  <Briefcase className="w-5 h-5 text-amber-600" />
                </div>
                <span className="font-medium text-sm text-foreground">{SUPPORT_FLOW.identification.buttons[1].label}</span>
              </button>
            </div>
          </>
        )}

        {(step === "client" || step === "professional") && (
          <>
            <button
              onClick={() => setStep("identification")}
              className="text-xs font-medium text-muted-foreground hover:text-foreground mb-3 flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Voltar
            </button>
            <p className="text-sm font-medium text-foreground mb-3">
              {step === "client" ? "O que você precisa?" : "Em que podemos ajudar?"}
            </p>
            <div className="grid gap-2 mb-4">
              {(step === "client" ? SUPPORT_FLOW.client : SUPPORT_FLOW.professional).map((label) => (
                <button
                  key={label}
                  onClick={() => openTicketWithMessage(label)}
                  disabled={creating}
                  className="flex items-center gap-3 w-full p-3.5 rounded-xl border border-border bg-card hover:border-amber-500/40 hover:bg-amber-500/5 transition-colors text-left disabled:opacity-50"
                >
                  <HelpCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span className="font-medium text-sm text-foreground">{label}</span>
                </button>
              ))}
            </div>

            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 mb-4">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-200 mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Casos sensíveis
              </p>
              <p className="text-[11px] text-muted-foreground mb-2">{SUPPORT_FLOW.sensitive.message}</p>
              <div className="flex flex-col gap-2">
                {SUPPORT_FLOW.sensitive.buttons.map(({ label, subject }) => (
                  <button
                    key={label}
                    onClick={() => openTicketWithMessage(label, subject)}
                    disabled={creating}
                    className="w-full py-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200 text-sm font-medium hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleNewTicket}
              disabled={creating}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              {creating ? "Abrindo..." : "Abrir chat livre"}
            </button>
          </>
        )}

        {tickets.length > 0 && (
          <p className="text-sm font-medium text-foreground mt-6 mb-2">Suas solicitações</p>
        )}
        {tickets.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            <HelpCircle className="w-10 h-10 mx-auto mb-3 text-amber-500/40" />
            <p className="font-medium">Nenhuma solicitação ainda</p>
            <p className="text-xs mt-1">Clique acima para abrir sua primeira solicitação.</p>
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
