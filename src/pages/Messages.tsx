import AppLayout from "@/components/AppLayout";
import { MessageSquare, MoreVertical, Archive, Trash2, EyeOff, AlertTriangle, Inbox } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

interface Thread {
  id: string;
  professional_id: string;
  status: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  otherName: string;
  otherAvatar: string | null;
  lastMessage: string | null;
  lastMessageTime: string | null;
  unreadCount: number;
  // ✅ Novos campos de status
  is_archived: boolean;
  manual_unread: boolean;
}

const Messages = () => {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [supportUnread, setSupportUnread] = useState(0);
  const [supportLastMsg, setSupportLastMsg] = useState<string | null>(null);
  const [supportLastTime, setSupportLastTime] = useState<string | null>(null);
  const [hasSupportMessages, setHasSupportMessages] = useState(false);
  const [showArchived, setShowArchived] = useState(false); // ✅ Controle da visão de arquivados
  const navigate = useNavigate();

  const [reportingChatId, setReportingChatId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    // Load support thread info (mantido)
    const { data: supportMsgs, count: totalSupport } = await supabase
      .from("support_messages")
      .select("*", { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);
    
    if (totalSupport && totalSupport > 0 && supportMsgs && supportMsgs.length > 0) {
      setHasSupportMessages(true);
      setSupportLastMsg((supportMsgs[0] as any).content);
      setSupportLastTime((supportMsgs[0] as any).created_at);
      const { data: readStatus } = await supabase.from("support_read_status" as any).select("last_read_at").eq("user_id", user.id).eq("thread_user_id", user.id).maybeSingle() as { data: { last_read_at: string } | null };
      if (readStatus) {
        const { count } = await supabase.from("support_messages").select("*", { count: "exact", head: true }).eq("user_id", user.id).neq("sender_id", user.id).gt("created_at", readStatus.last_read_at);
        setSupportUnread(count || 0);
      } else {
        const { count } = await supabase.from("support_messages").select("*", { count: "exact", head: true }).eq("user_id", user.id).neq("sender_id", user.id);
        setSupportUnread(count || 0);
      }
    }

    const { data: requests } = await supabase.from("service_requests").select("*").eq("client_id", user.id).order("updated_at", { ascending: false });
    const { data: proData } = await supabase.from("professionals").select("id").eq("user_id", user.id);
    let proRequests: any[] = [];
    if (proData && proData.length > 0) {
      const proIds = proData.map(p => p.id);
      const { data: pr } = await supabase.from("service_requests").select("*").in("professional_id", proIds).order("updated_at", { ascending: false });
      proRequests = pr || [];
    }

    const allReqs = [...(requests || []), ...proRequests];
    const unique = Array.from(new Map(allReqs.map(r => [r.id, r])).values());
    const threadIds = unique.map(r => r.id);

    // ✅ Busca status estendidos (arquivado, deletado, não lido manual)
    const { data: readStatuses } = await supabase
      .from("chat_read_status" as any)
      .select("request_id, last_read_at, is_archived, is_deleted, manual_unread")
      .eq("user_id", user.id)
      .in("request_id", threadIds) as { data: any[] | null };
    
    const statusMap = new Map((readStatuses || []).map(rs => [rs.request_id, rs]));

    const enriched: Thread[] = await Promise.all(unique.map(async (req: any) => {
      const statusData = statusMap.get(req.id) || { is_archived: false, is_deleted: false, manual_unread: false };
      
      if (statusData.is_deleted) return null as any; // Se deletado, ignora

      const isClient = req.client_id === user.id;
      let otherName = "Usuário";
      let otherAvatar: string | null = null;

      if (isClient) {
        const { data: pro } = await supabase.from("professionals").select("user_id").eq("id", req.professional_id).maybeSingle();
        if (pro) {
          const { data: profile } = await supabase.from("profiles_public" as any).select("full_name, avatar_url").eq("user_id", pro.user_id).maybeSingle() as { data: { full_name: string; avatar_url: string | null } | null };
          if (profile) { otherName = profile.full_name || "Profissional"; otherAvatar = profile.avatar_url; }
        }
      } else {
        const { data: profile } = await supabase.from("profiles_public" as any).select("full_name, avatar_url").eq("user_id", req.client_id).maybeSingle() as { data: { full_name: string; avatar_url: string | null } | null };
        if (profile) { otherName = profile.full_name || "Cliente"; otherAvatar = profile.avatar_url; }
      }

      const { data: lastMsg } = await supabase.from("chat_messages").select("content, created_at").eq("request_id", req.id).order("created_at", { ascending: false }).limit(1).maybeSingle();

      const lastRead = statusData.last_read_at;
      let unreadCount = 0;
      if (lastRead) {
        const { count } = await supabase.from("chat_messages").select("*", { count: "exact", head: true }).eq("request_id", req.id).neq("sender_id", user.id).gt("created_at", lastRead);
        unreadCount = count || 0;
      } else {
        const { count } = await supabase.from("chat_messages").select("*", { count: "exact", head: true }).eq("request_id", req.id).neq("sender_id", user.id);
        unreadCount = count || 0;
      }

      return {
        ...req,
        otherName,
        otherAvatar,
        lastMessage: lastMsg?.content || null,
        lastMessageTime: lastMsg?.created_at || req.updated_at,
        unreadCount,
        is_archived: statusData.is_archived,
        manual_unread: statusData.manual_unread
      };
    }));

    const finalThreads = enriched.filter(t => t !== null).sort((a, b) => new Date(b.lastMessageTime || b.updated_at).getTime() - new Date(a.lastMessageTime || a.updated_at).getTime());
    setThreads(finalThreads);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // ✅ FUNÇÕES REAIS DOS BOTÕES
  const handleArchive = async (chatId: string, current: boolean) => {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("chat_read_status" as any).update({ is_archived: !current }).eq("user_id", user?.id).eq("request_id", chatId);
    load();
  };

  const handleDelete = async (chatId: string) => {
    if (!confirm("Excluir esta conversa para você?")) return;
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("chat_read_status" as any).update({ is_deleted: true }).eq("user_id", user?.id).eq("request_id", chatId);
    load();
  };

  const handleMarkUnread = async (chatId: string, current: boolean) => {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("chat_read_status" as any).update({ manual_unread: !current }).eq("user_id", user?.id).eq("request_id", chatId);
    load();
  };

  const handleReportSubmit = async () => {
    if (!reportingChatId || !reportReason.trim()) return;
    setIsSubmittingReport(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      const { error } = await supabase.from('chat_reports' as any).insert({ reporter_id: user.id, chat_id: reportingChatId, reason: reportReason.trim() });
      if (error) throw error;
      setReportingChatId(null);
      setReportReason("");
      alert("Denúncia enviada com sucesso!");
    } catch (error) {
      alert("Erro ao enviar denúncia.");
    } finally { setIsSubmittingReport(false); }
  };

  const timeLabel = (dateStr: string | null) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    if (days === 1) return "Ontem";
    if (days < 7) return date.toLocaleDateString("pt-BR", { weekday: "short" });
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  };

  if (loading) return <AppLayout><main className="max-w-screen-lg mx-auto px-4 py-10 text-center text-muted-foreground">Carregando...</main></AppLayout>;

  // ✅ Filtra threads baseado se estamos vendo a pasta de arquivados ou não
  const activeThreads = threads.filter(t => !t.is_archived);
  const archivedThreads = threads.filter(t => t.is_archived);
  const currentList = showArchived ? archivedThreads : activeThreads;

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-foreground">
            {showArchived ? "Arquivados" : "Mensagens"}
          </h1>
          {archivedThreads.length > 0 && (
            <button 
              onClick={() => setShowArchived(!showArchived)}
              className="text-xs font-bold text-primary flex items-center gap-1 bg-primary/5 px-3 py-1.5 rounded-full transition-all"
            >
              {showArchived ? <Inbox className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
              {showArchived ? "Ver entrada" : `Arquivados (${archivedThreads.length})`}
            </button>
          )}
        </div>
        
        {!showArchived && (
          <Link to="/support"
            className={`flex items-center gap-3 px-2 py-3 border-b hover:bg-amber-500/5 transition-colors rounded-lg ${supportUnread > 0 ? "bg-amber-500/10" : ""}`}>
            <div className="relative flex-shrink-0">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-500/30 to-amber-600/10 flex items-center justify-center border-2 border-amber-500/30 shadow-sm">
                <MessageSquare className="w-6 h-6 text-amber-600" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className={`text-sm truncate ${supportUnread > 0 ? "font-bold text-foreground" : "font-semibold text-foreground"}`}>🛟 Suporte Chamô</p>
                {supportLastTime && <span className="text-[11px] text-muted-foreground">{timeLabel(supportLastTime)}</span>}
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs truncate text-muted-foreground">{supportLastMsg || "Fale com o suporte"}</p>
                {supportUnread > 0 && <span className="min-w-[20px] h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center px-1.5">{supportUnread}</span>}
              </div>
            </div>
          </Link>
        )}

        <div className="flex flex-col">
          {currentList.map((t) => {
            const initials = t.otherName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
            const hasUnread = t.unreadCount > 0 || t.manual_unread;

            return (
              <div key={t.id} className={`flex items-center gap-3 px-2 py-3 border-b last:border-b-0 hover:bg-muted/40 transition-colors rounded-lg ${hasUnread ? "bg-primary/5" : ""}`}>
                <div 
                  onClick={() => {
                    // ✅ Se abrir conversa marcada como não lida, remove a marcação
                    if (t.manual_unread) handleMarkUnread(t.id, true);
                    navigate(`/messages/${t.id}`);
                  }}
                  className="flex flex-1 items-center gap-3 cursor-pointer min-w-0"
                >
                  <div className="relative flex-shrink-0">
                    {t.otherAvatar ? (
                      <img src={t.otherAvatar} alt={t.otherName} className="w-14 h-14 rounded-full object-cover border-2 border-background shadow-sm" />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary border-2 border-background shadow-sm">
                        {initials}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${hasUnread ? "font-bold text-foreground" : "font-semibold text-foreground"}`}>{t.otherName}</p>
                    <p className={`text-xs truncate mt-0.5 ${hasUnread ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                      {t.lastMessage || "Nova conversa"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="text-[11px] text-muted-foreground">
                    {timeLabel(t.lastMessageTime)}
                  </span>
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="p-1 hover:bg-muted rounded-full transition-colors text-muted-foreground">
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 rounded-xl shadow-lg border-muted">
                      <DropdownMenuItem onClick={() => handleMarkUnread(t.id, t.manual_unread)} className="gap-2 cursor-pointer py-2">
                        <EyeOff className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium text-sm">{t.manual_unread ? "Marcar como lida" : "Marcar como não lida"}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleArchive(t.id, t.is_archived)} className="gap-2 cursor-pointer py-2">
                        <Archive className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium text-sm">{t.is_archived ? "Desarquivar" : "Arquivar conversa"}</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleDelete(t.id)} className="gap-2 cursor-pointer py-2 text-red-600 focus:text-red-600 focus:bg-red-50">
                        <Trash2 className="w-4 h-4" />
                        <span className="font-medium text-sm">Excluir conversa</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => setReportingChatId(t.id)} 
                        className="gap-2 cursor-pointer py-2 text-amber-600 focus:text-amber-600 focus:bg-amber-50"
                      >
                        <AlertTriangle className="w-4 h-4" />
                        <span className="font-medium text-sm">Denunciar conversa</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>

        <Dialog open={!!reportingChatId} onOpenChange={(open) => !open && setReportingChatId(null)}>
          <DialogContent className="sm:max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-600">
                <AlertTriangle className="w-5 h-5" /> Denunciar Conversa
              </DialogTitle>
              <DialogDescription>
                Descreva o motivo da denúncia para análise do suporte.
              </DialogDescription>
            </DialogHeader>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              className="w-full min-h-[120px] p-3 rounded-xl border border-muted bg-background text-sm outline-none focus:border-amber-500"
              placeholder="Descreva o motivo..."
            />
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setReportingChatId(null)} className="rounded-xl">Cancelar</Button>
              <Button onClick={handleReportSubmit} disabled={isSubmittingReport} className="rounded-xl bg-amber-600 text-white">
                {isSubmittingReport ? "Enviando..." : "Enviar Denúncia"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </AppLayout>
  );
};

export default Messages;