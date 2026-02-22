import AdminLayout from "@/components/AdminLayout";
import { HelpCircle, Send, ArrowLeft, Clock, XCircle, FileText, AlertTriangle, MessageSquare, CheckCircle2, Eye } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import AudioPlayer from "@/components/AudioPlayer";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Interfaces do Suporte
interface TicketThread {
  id: string;
  user_id: string;
  protocol: string | null;
  subject: string;
  status: string;
  created_at: string;
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

// ✅ Interfaces da Denúncia
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

interface ReportedChatMessage {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender_name?: string;
}

const AdminSupport = () => {
  // Estados do Suporte
  const [tickets, setTickets] = useState<TicketThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<TicketThread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [adminId, setAdminId] = useState<string | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // ✅ Estados das Denúncias
  const [activeTab, setActiveTab] = useState<"support" | "reports">("support");
  const [reports, setReports] = useState<ChatReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [viewingReportChat, setViewingReportChat] = useState<string | null>(null);
  const [reportedMessages, setReportedMessages] = useState<ReportedChatMessage[]>([]);
  const [loadingReportedChat, setLoadingReportedChat] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAdminId(data.user?.id || null));
  }, []);

  // Busca os Tickets de Suporte
  const fetchTickets = async () => {
    setLoading(true);
    const { data: ticketRows } = await supabase
      .from("support_tickets")
      .select("id, user_id, protocol, subject, status, created_at")
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
        full_name: p?.full_name || "Usuário",
        avatar_url: p?.avatar_url || null,
        unreadCount: 0,
        lastMessage: lastMsg?.[0]?.content || (lastMsg?.[0]?.image_urls ? "📷 Imagem" : t.subject || ""),
        lastTime: lastMsg?.[0]?.created_at || t.created_at,
      });
    }

    setTickets(result);
    setLoading(false);
  };

  // ✅ Busca as Denúncias
  const fetchReports = async () => {
    setLoadingReports(true);
    const { data: reportRows } = await supabase
      .from("chat_reports" as any)
      .select("*")
      .order("created_at", { ascending: false });

    if (!reportRows || reportRows.length === 0) {
      setReports([]);
      setLoadingReports(false);
      return;
    }

    const userIds = [...new Set(reportRows.map((r: any) => r.reporter_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, avatar_url")
      .in("user_id", userIds);
    const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));

    const enrichedReports: ChatReport[] = reportRows.map((r: any) => ({
      ...r,
      reporter_name: profileMap.get(r.reporter_id)?.full_name || "Usuário",
      reporter_avatar: profileMap.get(r.reporter_id)?.avatar_url || null,
    }));

    setReports(enrichedReports);
    setLoadingReports(false);
  };

  useEffect(() => { 
    if (activeTab === "support") fetchTickets(); 
    else fetchReports();
  }, [activeTab]);

  const openTicket = async (ticket: TicketThread) => {
    setSelected(ticket);
    const { data } = await supabase
      .from("support_messages")
      .select("*")
      .eq("ticket_id", ticket.id)
      .order("created_at");
    setMessages((data as Message[]) || []);
  };

  // ✅ Função para ler as mensagens do chat denunciado
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

  // ✅ Função para marcar a denúncia como resolvida
  const handleResolveReport = async (reportId: string) => {
    await supabase.from("chat_reports" as any).update({ status: 'resolvido' }).eq("id", reportId);
    toast({ title: "Denúncia resolvida com sucesso!" });
    fetchReports(); // Recarrega a lista
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

  const parseAttachment = (content: string) => {
    const match = content.match(/\[(IMAGE|VIDEO|FILE):(.+):(.+)\]$/);
    if (match) return { type: match[1], url: match[2], name: match[3] };
    return null;
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
              <img 
                key={i} 
                src={url} 
                alt="" 
                className="max-w-[220px] rounded-lg border border-white/10 cursor-pointer hover:opacity-90 transition-opacity" 
                onClick={() => window.open(url, '_blank')} 
              />
            ))}
          </div>
          {msg.content && <p className="whitespace-pre-wrap">{msg.content}</p>}
        </div>
      );
    }

    const audioData = parseAudio(msg.content);
    if (audioData) return <AudioPlayer src={audioData.url} duration={audioData.duration} isMine={isAdmin} />;
    const attachment = parseAttachment(msg.content);
    if (attachment) {
      if (attachment.type === "IMAGE") {
        return (
          <a href={attachment.url} target="_blank" rel="noopener noreferrer">
            <img src={attachment.url} alt={attachment.name} className="max-w-[200px] rounded-lg" />
            <p className="text-[10px] mt-1 opacity-70">{attachment.name}</p>
          </a>
        );
      }
      if (attachment.type === "VIDEO") {
        return (
          <div>
            <video src={attachment.url} controls className="max-w-[200px] rounded-lg" />
            <p className="text-[10px] mt-1 opacity-70">{attachment.name}</p>
          </div>
        );
      }
      return (
        <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 underline">
          <FileText className="w-4 h-4" />
          <span className="text-xs">{attachment.name}</span>
        </a>
      );
    }
    return <p className="whitespace-pre-wrap">{msg.content}</p>;
  };

  const threadIsClosed = selected ? (selected.status === "closed" || messages.some(m => m.content === "[CLOSED]")) : false;
  const openTickets = tickets.filter(t => t.status !== "closed");
  const pendingReports = reports.filter(r => r.status !== "resolvido");

  // SE UM TICKET ESTIVER SELECIONADO, MOSTRA O CHAT DO SUPORTE
  if (selected) {
    const initials = selected.full_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    return (
      <AdminLayout title="Atendimento">
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
            const isAdmin = msg.sender_id === adminId;
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
              <div key={msg.id} className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] px-3.5 py-2.5 rounded-2xl text-sm ${
                  isAdmin
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-amber-500/10 border border-amber-500/20 rounded-bl-md text-foreground"
                }`}>
                  {renderContent(msg, isAdmin)}
                  <p className={`text-[10px] mt-1 ${isAdmin ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                    {new Date(msg.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
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
      </AdminLayout>
    );
  }

  // TELA PRINCIPAL (ABAS DE SUPORTE E DENÚNCIAS)
  return (
    <AdminLayout title="Central de Atendimento">
      
      {/* ✅ BARRA DE ABAS */}
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
          Denúncias {pendingReports.length > 0 && <span className="bg-destructive text-white text-[10px] px-1.5 py-0.5 rounded-full">{pendingReports.length}</span>}
        </button>
      </div>

      {/* CONTEÚDO DA ABA SUPORTE */}
      {activeTab === "support" && (
        <>
          {loading ? (
            <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div>
          ) : tickets.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Nenhuma conversa de suporte.</div>
          ) : (
            <div className="space-y-3">
              {openTickets.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 mb-4">
                  <p className="text-sm font-medium text-amber-700 flex items-center gap-2">
                    <Clock className="w-4 h-4" /> {openTickets.length} chamado(s) aberto(s)
                  </p>
                </div>
              )}
              <div className="flex flex-col">
                {tickets.map((t) => {
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
                      className={`flex items-center gap-3 px-3 py-3 border-b last:border-b-0 hover:bg-muted/40 transition-colors text-left w-full ${t.status !== "closed" ? "bg-amber-500/5" : ""}`}
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
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">{t.protocol || ""}</span>
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

      {/* ✅ CONTEÚDO DA ABA DENÚNCIAS */}
      {activeTab === "reports" && (
        <>
          {loadingReports ? (
            <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-destructive border-t-transparent rounded-full" /></div>
          ) : reports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
              <CheckCircle2 className="w-10 h-10 text-green-500/50" />
              <p className="text-sm font-medium">Nenhuma denúncia registrada.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
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
            </div>
          )}
        </>
      )}

      {/* ✅ MODAL DE VISUALIZAÇÃO DO CHAT DENUNCIADO */}
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
              reportedMessages.map((msg, idx) => {
                // Alterna os lados baseado no remetente (simulando um chat)
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
                )
              })
            )}
            <div ref={bottomRef} />
          </div>
        </DialogContent>
      </Dialog>

    </AdminLayout>
  );
};

export default AdminSupport;