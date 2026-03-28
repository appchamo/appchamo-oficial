import {
  HelpCircle,
  Send,
  ArrowLeft,
  Clock,
  XCircle,
  FileText,
  AlertTriangle,
  MessageSquare,
  CheckCircle2,
  Eye,
  Search,
  Bot,
  Maximize2,
  X,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import AudioPlayer from "@/components/AudioPlayer";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { isSupportBotMessage } from "@/lib/supportBot";
import { parseAnySupportAttachment } from "@/lib/supportMessageAttachments";

export interface TicketThread {
  id: string;
  user_id: string;
  protocol: string | null;
  subject: string;
  status: string;
  created_at: string;
  requested_human_at: string | null;
  full_name: string;
  avatar_url: string | null;
  unreadCount: number;
  lastMessage: string;
  lastTime: string;
}

interface Message {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  image_urls?: string[] | null;
}

interface ChatReport {
  id: string;
  reporter_id: string;
  chat_id: string;
  reason: string;
  status: string;
  created_at: string;
  reporter_name: string;
  reporter_avatar: string | null;
}

interface CommentCommunityReport {
  id: string;
  comment_id: string;
  reporter_id: string;
  reason: string;
  status: string;
  created_at: string;
  reporter_name: string;
  reporter_avatar: string | null;
  comment_preview: string;
  comment_author_id: string | null;
}

interface ReportedChatMessage {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender_name?: string;
}

interface SupportCentralContentProps {
  /** Quando fornecido, o conteúdo é envolvido por este layout (ex.: AdminLayout). Caso contrário retorna só o conteúdo. */
  renderLayout?: (props: { title: string; children: React.ReactNode }) => React.ReactNode;
}

const SupportCentralContent = ({ renderLayout }: SupportCentralContentProps) => {
  const [tickets, setTickets] = useState<TicketThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<TicketThread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [adminId, setAdminId] = useState<string | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [mediaViewer, setMediaViewer] = useState<{
    kind: "image" | "video" | "pdf";
    url: string;
    name: string;
  } | null>(null);
  const [mediaViewerFullscreen, setMediaViewerFullscreen] = useState(false);

  const [activeTab, setActiveTab] = useState<"support" | "reports">("support");
  const [searchSupport, setSearchSupport] = useState("");
  const [reports, setReports] = useState<ChatReport[]>([]);
  const [commentCommunityReports, setCommentCommunityReports] = useState<CommentCommunityReport[]>(
    [],
  );
  const [loadingReports, setLoadingReports] = useState(false);
  const [viewingReportChat, setViewingReportChat] = useState<string | null>(null);
  const [reportedMessages, setReportedMessages] = useState<ReportedChatMessage[]>([]);
  const [loadingReportedChat, setLoadingReportedChat] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAdminId(data.user?.id || null));
  }, []);

  const fetchTickets = async () => {
    setLoading(true);
    const { data: ticketRows } = await supabase
      .from("support_tickets")
      .select("id, user_id, protocol, subject, status, created_at, requested_human_at")
      .order("created_at", { ascending: false });

    if (!ticketRows || ticketRows.length === 0) {
      setTickets([]);
      setLoading(false);
      return;
    }

    const userIds = [...new Set(ticketRows.map(t => t.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, avatar_url")
      .in("user_id", userIds);
    const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));

    const result: TicketThread[] = [];
    for (const t of ticketRows) {
      const p = profileMap.get(t.user_id);
      const { data: lastMsg } = await supabase
        .from("support_messages")
        .select("content, created_at, image_urls")
        .eq("ticket_id", t.id)
        .order("created_at", { ascending: false })
        .limit(1);

      result.push({
        id: t.id,
        user_id: t.user_id,
        protocol: t.protocol,
        subject: t.subject,
        status: t.status,
        created_at: t.created_at,
        requested_human_at: (t as any).requested_human_at ?? null,
        full_name: p?.full_name || "Usuário",
        avatar_url: p?.avatar_url || null,
        unreadCount: 0,
        lastMessage: (() => {
          const c = lastMsg?.[0]?.content?.trim() || "";
          if (lastMsg?.[0]?.image_urls?.length) return "📷 Imagem";
          const a = parseAnySupportAttachment(c);
          if (a?.kind === "VIDEO") return "🎬 Vídeo";
          if (a?.kind === "FILE") return "📄 Documento";
          return c || t.subject || "";
        })(),
        lastTime: lastMsg?.[0]?.created_at || t.created_at,
      });
    }

    setTickets(result);
    setLoading(false);
  };

  const fetchReports = async () => {
    setLoadingReports(true);
    try {
      const { data: reportRows } = await supabase
        .from("chat_reports" as any)
        .select("*")
        .order("created_at", { ascending: false });

      let enrichedReports: ChatReport[] = [];
      if (reportRows && reportRows.length > 0) {
        const userIds = [...new Set((reportRows as any[]).map((r) => r.reporter_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name, avatar_url")
          .in("user_id", userIds);
        const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
        enrichedReports = (reportRows as any[]).map((r) => ({
          ...r,
          reporter_name: profileMap.get(r.reporter_id)?.full_name || "Usuário",
          reporter_avatar: profileMap.get(r.reporter_id)?.avatar_url || null,
        }));
      }
      setReports(enrichedReports);

      const { data: cRepRows, error: cRepErr } = await supabase
        .from("community_comment_reports" as any)
        .select("id, comment_id, reporter_id, reason, status, created_at")
        .order("created_at", { ascending: false });

      if (cRepErr || !cRepRows?.length) {
        if (cRepErr) console.error(cRepErr);
        setCommentCommunityReports([]);
      } else {
        const rows = cRepRows as any[];
        const cids = [...new Set(rows.map((r) => r.comment_id))];
        const { data: cmtData } = await supabase
          .from("community_post_comments" as any)
          .select("id, body, user_id")
          .in("id", cids);
        const cMap = new Map((cmtData || []).map((c: any) => [c.id, c]));
        const ruids = [...new Set(rows.map((r) => r.reporter_id))];
        const { data: rProfs } = await supabase
          .from("profiles")
          .select("user_id, full_name, avatar_url")
          .in("user_id", ruids);
        const rMap = new Map((rProfs || []).map((p: any) => [p.user_id, p]));
        const enriched: CommentCommunityReport[] = rows.map((r) => {
          const c = cMap.get(r.comment_id) as { body?: string; user_id?: string } | undefined;
          return {
            id: r.id,
            comment_id: r.comment_id,
            reporter_id: r.reporter_id,
            reason: r.reason,
            status: r.status,
            created_at: r.created_at,
            reporter_name: rMap.get(r.reporter_id)?.full_name || "Usuário",
            reporter_avatar: rMap.get(r.reporter_id)?.avatar_url || null,
            comment_preview: c?.body != null ? String(c.body).slice(0, 400) : "(comentário removido ou indisponível)",
            comment_author_id: c?.user_id ?? null,
          };
        });
        setCommentCommunityReports(enriched);
      }
    } finally {
      setLoadingReports(false);
    }
  };

  useEffect(() => {
    if (activeTab === "support") fetchTickets();
    else fetchReports();
  }, [activeTab]);

  const openTicket = async (ticket: TicketThread) => {
    setSelected(ticket);
    if (ticket.requested_human_at) {
      await supabase.from("support_tickets").update({ requested_human_at: null }).eq("id", ticket.id);
      setTickets((prev) => prev.map((t) => (t.id === ticket.id ? { ...t, requested_human_at: null } : t)));
    }
    const { data } = await supabase
      .from("support_messages")
      .select("*")
      .eq("ticket_id", ticket.id)
      .order("created_at");
    setMessages((data as Message[]) || []);
  };

  const handleViewReportedChat = async (chatId: string) => {
    setViewingReportChat(chatId);
    setLoadingReportedChat(true);

    const { data: chatData } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("request_id", chatId)
      .order("created_at", { ascending: true });

    if (chatData && chatData.length > 0) {
      const uids = [...new Set(chatData.map(m => m.sender_id))];
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", uids);
      const pMap = new Map((profs || []).map(p => [p.user_id, p.full_name]));

      const enrichedChat = chatData.map(m => ({
        ...m,
        sender_name: pMap.get(m.sender_id) || "Usuário"
      }));
      setReportedMessages(enrichedChat);
    } else {
      setReportedMessages([]);
    }
    setLoadingReportedChat(false);
  };

  const handleResolveReport = async (reportId: string) => {
    await supabase.from("chat_reports" as any).update({ status: 'resolvido' }).eq("id", reportId);
    toast({ title: "Denúncia resolvida com sucesso!" });
    fetchReports();
  };

  const handleResolveCommentReport = async (reportId: string) => {
    const { error } = await supabase
      .from("community_comment_reports" as any)
      .update({ status: "resolvido" })
      .eq("id", reportId);
    if (error) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Denúncia de comentário marcada como resolvida" });
    fetchReports();
  };

  useEffect(() => {
    if (!selected) return;
    const channel = supabase
      .channel(`admin-support-${selected.id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "support_messages",
        filter: `ticket_id=eq.${selected.id}`,
      }, (payload) => {
        setMessages(prev => [...prev, payload.new as Message]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selected]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, reportedMessages]);

  const handleSend = async () => {
    if (!text.trim() || !selected || !adminId) return;
    if (selected.status === "closed" || messages.some(m => m.content === "[CLOSED]")) {
      toast({ title: "Chamado já encerrado", variant: "destructive" });
      return;
    }
    setSending(true);
    const { error } = await supabase.from("support_messages").insert({
      user_id: selected.user_id,
      sender_id: adminId,
      content: text.trim(),
      ticket_id: selected.id,
    });
    if (error) toast({ title: "Erro ao enviar", variant: "destructive" });
    else setText("");
    setSending(false);
  };

  const handleCloseThread = async () => {
    if (!selected || !adminId) return;
    await supabase.from("support_messages").insert({
      user_id: selected.user_id,
      sender_id: adminId,
      content: "[CLOSED]",
      ticket_id: selected.id,
    });
    await supabase.from("support_tickets").update({ status: "closed" }).eq("id", selected.id);
    await supabase.from("notifications").insert({
      user_id: selected.user_id,
      title: "Suporte encerrado",
      message: `Sua solicitação ${selected.protocol || ""} foi concluída. Caso precise, abra uma nova solicitação.`,
      type: "support",
      link: "/support",
    });
    setCloseOpen(false);
    toast({ title: "Chamado encerrado" });
    setSelected({ ...selected, status: "closed" });
    openTicket({ ...selected, status: "closed" });
  };

  const parseAudio = (content: string) => {
    const match = content.match(/\[AUDIO:(.+):(\d+)\]$/);
    if (match) return { url: match[1], duration: parseInt(match[2]) };
    return null;
  };

  const openViewer = (kind: "image" | "video" | "pdf", url: string, name: string) => {
    setMediaViewerFullscreen(false);
    setMediaViewer({ kind, url, name });
  };

  const renderContent = (msg: Message, isAdmin: boolean) => {
    if (msg.content.startsWith("[CLOSED]")) {
      return (
        <div className="text-center">
          <p className="text-xs font-medium">✅ Chamado encerrado</p>
        </div>
      );
    }

    if (msg.image_urls && msg.image_urls.length > 0) {
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-1 gap-1.5">
            {msg.image_urls.map((url, i) => (
              <button
                key={i}
                type="button"
                className="relative block max-w-[220px] rounded-lg overflow-hidden border border-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                onClick={() => openViewer("image", url, "Imagem")}
              >
                <img
                  src={url}
                  alt=""
                  className="w-full object-cover max-h-52 hover:opacity-95 transition-opacity"
                />
                <span className="absolute bottom-1 right-1 rounded-md bg-black/55 p-1 text-white">
                  <Maximize2 className="w-3.5 h-3.5" />
                </span>
              </button>
            ))}
          </div>
          {msg.content && <p className="whitespace-pre-wrap">{msg.content}</p>}
        </div>
      );
    }

    const audioData = parseAudio(msg.content);
    if (audioData) return <AudioPlayer src={audioData.url} duration={audioData.duration} isMine={isAdmin} />;
    const attachment = parseAnySupportAttachment(msg.content.trim());
    if (attachment) {
      if (attachment.kind === "IMAGE") {
        return (
          <button
            type="button"
            className="relative block max-w-[220px] rounded-lg overflow-hidden border border-white/10"
            onClick={() => openViewer("image", attachment.url, attachment.name)}
          >
            <img src={attachment.url} alt="" className="w-full object-cover max-h-52" />
            <span className="absolute bottom-1 right-1 rounded-md bg-black/55 p-1 text-white">
              <Maximize2 className="w-3.5 h-3.5" />
            </span>
            <p className="text-[10px] mt-1 opacity-70 truncate px-1">{attachment.name}</p>
          </button>
        );
      }
      if (attachment.kind === "VIDEO") {
        return (
          <div className="relative max-w-[min(260px,85vw)] rounded-xl overflow-hidden border border-white/10 bg-black/20">
            <video src={attachment.url} controls className="w-full max-h-56 object-contain" playsInline />
            <button
              type="button"
              className="absolute top-2 right-2 rounded-full bg-black/55 p-1.5 text-white"
              onClick={() => openViewer("video", attachment.url, attachment.name)}
              aria-label="Tela cheia"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <p className="text-[10px] px-2 py-1 opacity-70 truncate">{attachment.name}</p>
          </div>
        );
      }
      return (
        <button
          type="button"
          onClick={() => openViewer("pdf", attachment.url, attachment.name)}
          className="flex w-full max-w-[260px] flex-col gap-1 rounded-xl border border-white/15 bg-muted/30 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
        >
          <span className="flex items-center gap-2 text-xs font-semibold">
            <FileText className="w-4 h-4 shrink-0" />
            <span className="truncate">{attachment.name}</span>
          </span>
          <span className="text-[10px] text-muted-foreground">Toque para ver o PDF</span>
        </button>
      );
    }
    return <p className="whitespace-pre-wrap">{msg.content}</p>;
  };

  const threadIsClosed = selected ? (selected.status === "closed" || messages.some(m => m.content === "[CLOSED]")) : false;
  const openTickets = tickets.filter(t => t.status !== "closed");
  const pendingReports = reports.filter((r) => r.status !== "resolvido");
  const pendingCommentReports = commentCommunityReports.filter((r) => r.status !== "resolvido");
  const pendingReportsTotal = pendingReports.length + pendingCommentReports.length;

  const normalizeSearch = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/\u0300-\u036f/g, "");
  const filteredTickets = !searchSupport.trim()
    ? tickets
    : tickets.filter((t) => {
        const q = normalizeSearch(searchSupport);
        const name = normalizeSearch(t.full_name);
        const protocol = normalizeSearch(t.protocol || "");
        return name.includes(q) || protocol.includes(q);
      });

  const wrap = (title: string, children: React.ReactNode) => {
    if (renderLayout) return renderLayout({ title, children });
    return <>{children}</>;
  };

  if (selected) {
    const initials = selected.full_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    return wrap("Atendimento", (
      <>
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => { setSelected(null); fetchTickets(); }} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          {selected.avatar_url ? (
            <img src={selected.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-amber-500/20 flex items-center justify-center text-xs font-bold text-amber-600">{initials}</div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">{selected.full_name}</p>
            <p className="text-[10px] text-muted-foreground">{selected.protocol || "Suporte"}</p>
          </div>
          {!threadIsClosed && (
            <button onClick={() => setCloseOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-destructive/30 text-destructive text-xs font-medium hover:bg-destructive/10 transition-colors">
              <XCircle className="w-3.5 h-3.5" /> Encerrar
            </button>
          )}
        </div>

        <div className="bg-card border rounded-xl p-4 max-h-[60vh] overflow-y-auto flex flex-col gap-2">
          {messages.length === 0 && <p className="text-center text-muted-foreground text-sm py-8">Nenhuma mensagem ainda.</p>}
          {messages.map((msg) => {
            const isBot = isSupportBotMessage(msg.sender_id);
            const isAdmin = !isBot && msg.sender_id === adminId;
            // No painel admin: bot e admin ficam à direita; cliente fica à esquerda
            const showOnRight = isAdmin || isBot;
            const isSystem = msg.content.startsWith("[CLOSED]");
            if (isSystem) {
              return (
                <div key={msg.id} className="flex justify-center my-2">
                  <div className="bg-muted/50 border rounded-xl px-4 py-2 text-center">
                    <p className="text-xs font-medium text-muted-foreground">✅ Chamado encerrado</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(msg.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              );
            }
            return (
              <div key={msg.id} className={`flex items-end gap-2 ${showOnRight ? "justify-end" : "justify-start"}`}>
                {/* Avatar do cliente (esquerda) */}
                {!showOnRight && (
                  <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0 mb-1">
                    <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
                  </div>
                )}

                <div className={`max-w-[75%] px-3.5 py-2.5 rounded-2xl text-sm ${
                  isAdmin
                    ? "bg-primary text-primary-foreground rounded-br-md"          // Admin: laranja/primário
                    : isBot
                    ? "bg-violet-500/15 border border-violet-400/30 rounded-br-md text-foreground" // Bot: roxo
                    : "bg-muted/60 border rounded-bl-md text-foreground"           // Cliente: cinza
                }`}>
                  {isBot && (
                    <p className="text-[9px] font-semibold text-violet-600 dark:text-violet-400 mb-1 flex items-center gap-1">
                      <Bot className="w-2.5 h-2.5" /> Assistente Chamô
                    </p>
                  )}
                  {renderContent(msg, isAdmin || isBot)}
                  <p className={`text-[10px] mt-1 ${isAdmin ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                    {new Date(msg.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>

                {/* Avatar do bot (direita) */}
                {isBot && (
                  <div className="w-6 h-6 rounded-full bg-violet-500/15 flex items-center justify-center flex-shrink-0 mb-1">
                    <Bot className="w-3.5 h-3.5 text-violet-600" />
                  </div>
                )}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {threadIsClosed ? (
          <div className="bg-muted/50 border rounded-xl px-4 py-3 mt-3 text-center">
            <p className="text-sm text-muted-foreground font-medium">🔒 Chamado encerrado</p>
          </div>
        ) : (
          <div className="flex items-center gap-2 mt-3">
            <input
              type="text" value={text} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Responder..."
              className="flex-1 bg-background border rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button onClick={handleSend} disabled={sending} className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50">
              <Send className="w-4 h-4" />
            </button>
          </div>
        )}

        <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Encerrar chamado</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">Tem certeza que deseja encerrar este chamado de suporte? O cliente será notificado.</p>
            <div className="flex gap-2 mt-3">
              <button onClick={() => setCloseOpen(false)} className="flex-1 py-2.5 rounded-xl border text-sm font-medium hover:bg-muted transition-colors">Cancelar</button>
              <button onClick={handleCloseThread} className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold hover:bg-destructive/90 transition-colors">Encerrar</button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    ));
  }

  const mainContent = (
    <>
      <div className="flex bg-muted/30 p-1 rounded-xl mb-6 border">
        <button
          onClick={() => setActiveTab("support")}
          className={`flex-1 py-2 text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-all ${
            activeTab === "support" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <HelpCircle className="w-4 h-4" />
          Suporte {openTickets.length > 0 && <span className="bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{openTickets.length}</span>}
        </button>
        <button
          onClick={() => setActiveTab("reports")}
          className={`flex-1 py-2 text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-all ${
            activeTab === "reports" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          Denúncias{" "}
          {pendingReportsTotal > 0 && (
            <span className="bg-destructive text-white text-[10px] px-1.5 py-0.5 rounded-full">
              {pendingReportsTotal}
            </span>
          )}
        </button>
      </div>

      {activeTab === "support" && (
        <>
          {tickets.length > 0 && (
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchSupport}
                onChange={(e) => setSearchSupport(e.target.value)}
                placeholder="Buscar por nome ou protocolo..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          )}
          {loading ? (
            <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div>
          ) : tickets.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Nenhuma conversa de suporte.</div>
          ) : filteredTickets.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Nenhum resultado para &quot;{searchSupport}&quot;</div>
          ) : (
            <div className="space-y-3">
              {openTickets.length > 0 && !searchSupport.trim() && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 mb-4">
                  <p className="text-sm font-medium text-amber-700 flex items-center gap-2">
                    <Clock className="w-4 h-4" /> {openTickets.length} chamado(s) aberto(s)
                  </p>
                </div>
              )}
              <div className="flex flex-col">
                {filteredTickets.map((t) => {
                  const initials = t.full_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
                  let preview = t.lastMessage;
                  if (preview.includes("[AUDIO:")) preview = "🎤 Mensagem de voz";
                  if (preview.includes("[IMAGE:")) preview = "📷 Imagem";
                  if (preview.includes("[VIDEO:")) preview = "🎥 Vídeo";
                  if (preview.includes("[FILE:")) preview = "📎 Arquivo";
                  if (preview.includes("[CLOSED]")) preview = "✅ Chamado encerrado";
                  return (
                    <button
                      key={t.id}
                      onClick={() => openTicket(t)}
                      className={`flex items-center gap-3 px-3 py-3 border-b last:border-b-0 hover:bg-muted/40 transition-colors text-left w-full ${
                        t.requested_human_at ? "border-l-4 border-l-red-500 bg-red-500/10" : t.status !== "closed" ? "bg-amber-500/5" : ""
                      }`}
                    >
                      {t.avatar_url ? (
                        <img src={t.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover" />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center text-sm font-bold text-amber-600">{initials}</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-foreground truncate">{t.full_name}</p>
                          <span className="text-[11px] text-muted-foreground">{new Date(t.lastTime).toLocaleDateString("pt-BR")}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] text-muted-foreground">{t.protocol || ""}</span>
                          {t.requested_human_at && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-red-500/20 text-red-700 dark:text-red-400">
                              Quer atendente
                            </span>
                          )}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            t.status === "closed" ? "bg-muted text-muted-foreground" : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          }`}>
                            {t.status === "closed" ? "Encerrado" : "Aberto"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{preview}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === "reports" && (
        <>
          {loadingReports ? (
            <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-destructive border-t-transparent rounded-full" /></div>
          ) : reports.length === 0 && commentCommunityReports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
              <CheckCircle2 className="w-10 h-10 text-green-500/50" />
              <p className="text-sm font-medium">Nenhuma denúncia registrada.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {reports.length > 0 ? (
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide px-1">
                  Chats
                </p>
              ) : null}
              {reports.map((r) => {
                const initials = r.reporter_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
                return (
                  <div key={r.id} className={`flex flex-col gap-3 p-4 border rounded-xl ${r.status === 'resolvido' ? 'bg-muted/30 opacity-70' : 'bg-card'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {r.reporter_avatar ? (
                          <img src={r.reporter_avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center text-xs font-bold text-destructive">{initials}</div>
                        )}
                        <div>
                          <p className="text-sm font-bold text-foreground">{r.reporter_name}</p>
                          <p className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleString("pt-BR")}</p>
                        </div>
                      </div>
                      <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${r.status === 'resolvido' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {r.status === 'resolvido' ? 'Resolvido' : 'Pendente'}
                      </span>
                    </div>

                    <div className="bg-destructive/5 border border-destructive/10 p-3 rounded-lg">
                      <p className="text-xs font-semibold text-destructive mb-1 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Motivo da denúncia:
                      </p>
                      <p className="text-sm text-foreground">{r.reason}</p>
                    </div>

                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => handleViewReportedChat(r.chat_id)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-semibold hover:bg-muted transition-colors"
                      >
                        <Eye className="w-4 h-4" /> Ler Conversa
                      </button>

                      {r.status !== 'resolvido' && (
                        <button
                          onClick={() => handleResolveReport(r.id)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold transition-colors"
                        >
                          <CheckCircle2 className="w-4 h-4" /> Marcar Resolvido
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {commentCommunityReports.length > 0 ? (
                <>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide px-1 mt-4">
                    Comunidade (comentários)
                  </p>
                  {commentCommunityReports.map((r) => {
                    const initials = r.reporter_name
                      .split(" ")
                      .map((w) => w[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase();
                    return (
                      <div
                        key={r.id}
                        className={`flex flex-col gap-3 p-4 border rounded-xl ${
                          r.status === "resolvido" ? "bg-muted/30 opacity-70" : "bg-card"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {r.reporter_avatar ? (
                              <img
                                src={r.reporter_avatar}
                                alt=""
                                className="w-10 h-10 rounded-full object-cover"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center text-xs font-bold text-destructive">
                                {initials}
                              </div>
                            )}
                            <div>
                              <p className="text-sm font-bold text-foreground">{r.reporter_name}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {new Date(r.created_at).toLocaleString("pt-BR")}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`text-[10px] px-2 py-1 rounded-full font-bold ${
                              r.status === "resolvido"
                                ? "bg-green-100 text-green-700"
                                : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {r.status === "resolvido" ? "Resolvido" : "Pendente"}
                          </span>
                        </div>

                        <div className="bg-muted/40 border border-border/60 p-3 rounded-lg">
                          <p className="text-[10px] font-semibold text-muted-foreground mb-1">
                            Texto denunciado
                          </p>
                          <p className="text-sm text-foreground whitespace-pre-wrap line-clamp-6">
                            {r.comment_preview}
                          </p>
                        </div>

                        <div className="bg-destructive/5 border border-destructive/10 p-3 rounded-lg">
                          <p className="text-xs font-semibold text-destructive mb-1 flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" /> Motivo da denúncia
                          </p>
                          <p className="text-sm text-foreground">{r.reason}</p>
                        </div>

                        {r.status !== "resolvido" ? (
                          <button
                            type="button"
                            onClick={() => void handleResolveCommentReport(r.id)}
                            className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold transition-colors"
                          >
                            <CheckCircle2 className="w-4 h-4" /> Marcar resolvido
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </>
              ) : null}
            </div>
          )}
        </>
      )}

      <Dialog open={!!viewingReportChat} onOpenChange={(open) => !open && setViewingReportChat(null)}>
        <DialogContent className="sm:max-w-md h-[80vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-4 py-3 border-b flex-shrink-0 bg-muted/30">
            <DialogTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
              Auditoria de Conversa
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-4 bg-muted/10 space-y-4">
            {loadingReportedChat ? (
              <div className="flex justify-center py-10"><div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" /></div>
            ) : reportedMessages.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm">Nenhuma mensagem encontrada neste chat.</p>
            ) : (
              reportedMessages.map((msg) => {
                const isFirstSender = reportedMessages[0].sender_id === msg.sender_id;
                return (
                  <div key={msg.id} className={`flex flex-col ${isFirstSender ? "items-start" : "items-end"}`}>
                    <span className="text-[10px] text-muted-foreground mb-1 px-1 font-medium">{msg.sender_name}</span>
                    <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm ${
                      isFirstSender ? "bg-card border text-foreground rounded-tl-sm" : "bg-primary text-primary-foreground rounded-tr-sm"
                    }`}>
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    <span className="text-[9px] text-muted-foreground mt-1 px-1">
                      {new Date(msg.created_at).toLocaleString("pt-BR", { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!mediaViewer}
        onOpenChange={(o) => {
          if (!o) {
            setMediaViewer(null);
            setMediaViewerFullscreen(false);
          }
        }}
      >
        <DialogContent
          className={
            mediaViewerFullscreen
              ? "!fixed !inset-0 !left-0 !top-0 z-[80] flex h-[100dvh] max-h-none w-full max-w-none !translate-x-0 !translate-y-0 flex-col gap-0 rounded-none border-0 bg-black p-0 overflow-hidden shadow-none [&>button]:hidden"
              : "max-w-[min(100vw-1rem,28rem)] p-0 gap-0 overflow-hidden rounded-2xl [&>button]:right-2 [&>button]:top-2"
          }
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {mediaViewer ? (
            <>
              <DialogTitle className="sr-only">
                {mediaViewer.kind === "pdf" ? "Documento" : mediaViewer.kind === "video" ? "Vídeo" : "Imagem"}
              </DialogTitle>
              <div
                className={
                  mediaViewerFullscreen
                    ? "flex items-center justify-between gap-2 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] bg-black/80 text-white shrink-0"
                    : "flex items-center justify-between gap-2 border-b px-3 py-2 shrink-0 bg-background"
                }
              >
                <button
                  type="button"
                  className={mediaViewerFullscreen ? "rounded-full p-2 hover:bg-white/10" : "rounded-full p-2 hover:bg-muted"}
                  onClick={() => setMediaViewer(null)}
                  aria-label="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
                <p
                  className={
                    mediaViewerFullscreen
                      ? "flex-1 truncate text-center text-xs font-medium"
                      : "flex-1 truncate text-center text-xs font-medium text-foreground"
                  }
                >
                  {mediaViewer.name}
                </p>
                <button
                  type="button"
                  className={mediaViewerFullscreen ? "rounded-full p-2 hover:bg-white/10" : "rounded-full p-2 hover:bg-muted"}
                  onClick={() => setMediaViewerFullscreen((f) => !f)}
                  aria-label={mediaViewerFullscreen ? "Sair da tela cheia" : "Tela cheia"}
                >
                  <Maximize2 className="w-5 h-5" />
                </button>
              </div>
              <div
                className={
                  mediaViewerFullscreen
                    ? "flex min-h-0 flex-1 items-center justify-center bg-black p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
                    : "max-h-[min(70vh,520px)] overflow-auto bg-muted/30 p-2"
                }
              >
                {mediaViewer.kind === "image" ? (
                  <img
                    src={mediaViewer.url}
                    alt=""
                    className={
                      mediaViewerFullscreen
                        ? "max-h-full max-w-full object-contain"
                        : "mx-auto max-h-[min(60vh,480px)] w-auto max-w-full rounded-lg object-contain"
                    }
                  />
                ) : mediaViewer.kind === "video" ? (
                  <video
                    src={mediaViewer.url}
                    controls
                    playsInline
                    className={
                      mediaViewerFullscreen
                        ? "max-h-full max-w-full object-contain"
                        : "mx-auto max-h-[min(60vh,480px)] w-full rounded-lg object-contain"
                    }
                  />
                ) : (
                  <iframe
                    title={mediaViewer.name}
                    src={mediaViewer.url}
                    className={
                      mediaViewerFullscreen
                        ? "h-full min-h-[50vh] w-full flex-1 rounded-none bg-white"
                        : "h-[min(60vh,480px)] w-full rounded-lg border bg-white"
                    }
                  />
                )}
              </div>
              {mediaViewer.kind === "pdf" ? (
                <div
                  className={
                    mediaViewerFullscreen
                      ? "shrink-0 border-t border-white/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-black/80"
                      : "shrink-0 border-t p-3 bg-background"
                  }
                >
                  <a
                    href={mediaViewer.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={
                      mediaViewerFullscreen
                        ? "block text-center text-sm text-sky-400 underline"
                        : "block text-center text-sm text-primary underline"
                    }
                  >
                    Abrir PDF no navegador se não carregar aqui
                  </a>
                </div>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );

  return wrap("Central de Atendimento", mainContent);
};

export default SupportCentralContent;
