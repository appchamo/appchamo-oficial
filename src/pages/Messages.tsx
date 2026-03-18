import AppLayout from "@/components/AppLayout";
import { MessageSquare, MoreVertical, Archive, EyeOff, Eye, AlertTriangle, Inbox, Mic, Package, CheckCheck, Trash2, XCircle, Search, CheckSquare, Square } from "lucide-react"; 
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface Thread {
  id: string;
  professional_id: string;
  status: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  protocol: string | null;
  otherName: string;
  otherAvatar: string | null;
  lastMessage: string | null;
  lastMessageTime: string | null;
  unreadCount: number;
  is_archived: boolean;
  manual_unread: boolean;
}

// 🚀 OTIMIZAÇÃO: Função de compressão de avatar na nuvem
const getOptimizedAvatar = (url: string | null | undefined) => {
  if (!url) return undefined;
  if (url.includes("supabase.co/storage/v1/object/public/")) {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}width=150&height=150&quality=75&resize=cover`;
  }
  return url;
};

const Messages = () => {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [supportUnread, setSupportUnread] = useState(0);
  const [supportLastMsg, setSupportLastMsg] = useState<string | null>(null);
  const [supportLastTime, setSupportLastTime] = useState<string | null>(null);
  const [hasSupportMessages, setHasSupportMessages] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [chatTab, setChatTab] = useState<"geral" | "cancelados">("geral");
  const navigate = useNavigate();

  // 🚀 OTIMIZAÇÃO: Estados de paginação
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const [searchChat, setSearchChat] = useState("");
  const [reportingChatId, setReportingChatId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [canceladosSelectMode, setCanceladosSelectMode] = useState(false);
  const [selectedCanceladosIds, setSelectedCanceladosIds] = useState<Set<string>>(new Set());
  const [deletingBatchIds, setDeletingBatchIds] = useState<string[] | null>(null);

  const load = useCallback(async (isBackgroundUpdate = false) => {
    // Só mostra o loading pesado se for a primeira vez que a tela abre
    if (!isBackgroundUpdate && threads.length === 0) setLoading(true); 
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { if (!isBackgroundUpdate) setLoading(false); return; }

    const PAGE_SIZE = 7;
    const limitCount = (page + 1) * PAGE_SIZE;

    // --- Suporte ---
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

    // 🚀 OTIMIZAÇÃO: Busca única com limite (Acabou o N+1 da morte)
    const { data: proData } = await supabase.from("professionals").select("id").eq("user_id", user.id);
    const proIds = proData?.map(p => p.id) || [];

    let allReqs = [];
    if (proIds.length > 0) {
      const { data } = await supabase
        .from("service_requests")
        .select("*")
        .or(`client_id.eq.${user.id},professional_id.in.(${proIds.join(',')})`)
        .order("updated_at", { ascending: false })
        .limit(limitCount);
      allReqs = data || [];
    } else {
      const { data } = await supabase
        .from("service_requests")
        .select("*")
        .eq("client_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(limitCount);
      allReqs = data || [];
    }

    setHasMore(allReqs.length === limitCount);

    const unique = Array.from(new Map(allReqs.map(r => [r.id, r])).values());
    const threadIds = unique.map(r => r.id);

    if (threadIds.length === 0) {
      setThreads([]);
      if (!isBackgroundUpdate) setLoading(false);
      return;
    }

    const { data: readStatuses } = await supabase
      .from("chat_read_status" as any)
      .select("request_id, last_read_at, is_archived, is_deleted, manual_unread")
      .eq("user_id", user.id)
      .in("request_id", threadIds) as { data: any[] | null };
    
    const statusMap = new Map((readStatuses || []).map(rs => [rs.request_id, rs]));

    const proIdsUniq = unique.map(r => r.professional_id);
    const { data: allPros } = await supabase.from("professionals").select("id, user_id").in("id", proIdsUniq);
    const proUserIdMap = new Map((allPros || []).map(p => [p.id, p.user_id]));

    const usersToFetch = unique.map(req => {
      return req.client_id === user.id ? proUserIdMap.get(req.professional_id) : req.client_id;
    }).filter(Boolean) as string[];

    const { data: allProfiles } = await supabase.from("profiles_public" as any).select("user_id, full_name, avatar_url").in("user_id", usersToFetch);
    const profileMap = new Map((allProfiles || []).map(p => [p.user_id, p]));

    /** 1 RPC em vez de até 3×N requests por thread (última msg + não lidas) */
    type Sum = { lastMessage: string | null; lastMessageTime: string | null; unreadCount: number };
    const summaryByReq = new Map<string, Sum>();
    const { data: sums, error: rpcErr } = await supabase.rpc("get_chat_thread_summaries", {
      _request_ids: threadIds,
      _user_id: user.id,
    });
    if (!rpcErr && Array.isArray(sums)) {
      for (const row of sums as {
        request_id: string;
        last_message: string | null;
        last_message_at: string | null;
        unread_count: number | string;
      }[]) {
        summaryByReq.set(row.request_id, {
          lastMessage: row.last_message ?? null,
          lastMessageTime: row.last_message_at ?? null,
          unreadCount: Number(row.unread_count) || 0,
        });
      }
    } else {
      for (const req of unique) {
        const st = statusMap.get(req.id) || {};
        const { data: lastMsg } = await supabase
          .from("chat_messages")
          .select("content, created_at")
          .eq("request_id", req.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        let unreadCount = 0;
        if (st.last_read_at) {
          const { count } = await supabase
            .from("chat_messages")
            .select("*", { count: "exact", head: true })
            .eq("request_id", req.id)
            .neq("sender_id", user.id)
            .gt("created_at", st.last_read_at);
          unreadCount = count || 0;
        } else {
          const { count } = await supabase
            .from("chat_messages")
            .select("*", { count: "exact", head: true })
            .eq("request_id", req.id)
            .neq("sender_id", user.id);
          unreadCount = count || 0;
        }
        summaryByReq.set(req.id, {
          lastMessage: lastMsg?.content ?? null,
          lastMessageTime: lastMsg?.created_at ?? null,
          unreadCount,
        });
      }
    }

    const enriched: Thread[] = unique
      .map((req: any) => {
        const statusData = statusMap.get(req.id) || { is_archived: false, is_deleted: false, manual_unread: false };
        if (statusData.is_deleted) return null as any;
        const isClient = req.client_id === user.id;
        const targetUserId = isClient ? proUserIdMap.get(req.professional_id) : req.client_id;
        const profile = targetUserId ? profileMap.get(targetUserId) : null;
        const sum = summaryByReq.get(req.id);
        return {
          ...req,
          otherName: profile?.full_name || (isClient ? "Profissional" : "Cliente"),
          otherAvatar: profile?.avatar_url || null,
          lastMessage: sum?.lastMessage ?? null,
          lastMessageTime: sum?.lastMessageTime || req.updated_at,
          unreadCount: sum?.unreadCount ?? 0,
          is_archived: statusData.is_archived,
          manual_unread: statusData.manual_unread,
        };
      })
      .filter((t) => t !== null) as Thread[];

    const finalThreads = enriched.sort(
      (a, b) =>
        new Date(b.lastMessageTime || b.updated_at).getTime() -
        new Date(a.lastMessageTime || a.updated_at).getTime()
    );
    setThreads(finalThreads);
    if (!isBackgroundUpdate) setLoading(false);
  }, [page]); // Adicionado `page` como dependência para carregar mais quando mudar

  useEffect(() => { 
    load(); 

    const channel = supabase.channel('messages-list-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, () => {
        setTimeout(() => load(true), 500);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_read_status' }, () => {
        setTimeout(() => load(true), 500);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_requests' }, () => {
        setTimeout(() => load(true), 500);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const handleArchive = async (chatId: string, current: boolean) => {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("chat_read_status" as any).update({ is_archived: !current }).eq("user_id", user?.id).eq("request_id", chatId);
    load(true);
  };

  /** Marca uma conversa como lida (atualiza last_read_at e remove manual_unread). O badge do Chat na barra atualiza via realtime. */
  const handleMarkRead = async (chatId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("chat_read_status" as any).upsert(
      { request_id: chatId, user_id: user.id, last_read_at: new Date().toISOString(), manual_unread: false },
      { onConflict: "request_id,user_id" }
    );
    load(true);
  };

  /** Marca uma conversa como não lida (manual_unread = true). */
  const handleMarkUnread = async (chatId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("chat_read_status" as any).update({ manual_unread: true }).eq("user_id", user?.id).eq("request_id", chatId);
    load(true);
  };

  /** Marca todas as conversas como lidas. Atualiza o badge do Chat na barra inferior. */
  const handleMarkAllRead = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: proData } = await supabase.from("professionals").select("id").eq("user_id", user.id);
    const proIds = proData?.map(p => p.id) || [];
    let reqIds: string[] = [];
    if (proIds.length > 0) {
      const { data: reqs } = await supabase.from("service_requests").select("id").or(`client_id.eq.${user.id},professional_id.in.(${proIds.join(",")})`);
      reqIds = (reqs || []).map((r: { id: string }) => r.id);
    } else {
      const { data: reqs } = await supabase.from("service_requests").select("id").eq("client_id", user.id);
      reqIds = (reqs || []).map((r: { id: string }) => r.id);
    }
    const now = new Date().toISOString();
    await Promise.all(
      reqIds.map((request_id) =>
        supabase.from("chat_read_status" as any).upsert(
          { request_id, user_id: user.id, last_read_at: now, manual_unread: false },
          { onConflict: "request_id,user_id" }
        )
      )
    );
    load(true);
  };

  /** Exclui a conversa para o usuário (some da lista). Só disponível em arquivados. */
  const handleDeleteConversation = async (chatId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setIsDeleting(true);
    try {
      await supabase.from("chat_read_status" as any).upsert(
        { request_id: chatId, user_id: user.id, last_read_at: new Date().toISOString(), is_deleted: true },
        { onConflict: "request_id,user_id" }
      );
      setDeletingChatId(null);
      load(true);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBatchDeleteConfirm = async () => {
    if (!deletingBatchIds?.length) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setIsDeleting(true);
    try {
      for (const chatId of deletingBatchIds) {
        await supabase.from("chat_read_status" as any).upsert(
          { request_id: chatId, user_id: user.id, last_read_at: new Date().toISOString(), is_deleted: true },
          { onConflict: "request_id,user_id" }
        );
      }
      setDeletingBatchIds(null);
      setSelectedCanceladosIds(new Set());
      setCanceladosSelectMode(false);
      load(true);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleReportSubmit = async () => {
    if (!reportingChatId || reportReason.trim().length < 20) return;
    setIsSubmittingReport(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      const { error } = await supabase.from('chat_reports' as any).insert({ reporter_id: user.id, chat_id: reportingChatId, reason: reportReason.trim() });
      if (error) throw error;
      const { data: supportProfile } = await supabase.from("profiles").select("user_id").eq("email", "suporte@appchamo.com").maybeSingle();
      if (supportProfile?.user_id) {
        await supabase.from("notifications").insert({
          user_id: supportProfile.user_id,
          title: "Nova denúncia de chat",
          message: "Uma conversa foi denunciada. Abra a Central de Atendimento para revisar.",
          type: "support",
          link: "/suporte-desk",
        });
      }
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

  const renderLastMessage = (msg: string | null) => {
    if (!msg) return "Nova conversa";
    
    if (msg.startsWith("[AUDIO:")) {
      return (
        <span className="flex items-center gap-1 text-primary">
          <Mic className="w-3.5 h-3.5" /> Mensagem de áudio
        </span>
      );
    }

    if (msg.includes("[PRODUCT:")) {
      return (
        <span className="flex items-center gap-1 text-emerald-600 font-medium">
          <Package className="w-3.5 h-3.5" /> Interesse em Produto
        </span>
      );
    }

    return msg;
  };

  // 🚀 OTIMIZAÇÃO: Skeleton Screen elegante para percepção de velocidade
  if (loading && threads.length === 0) {
    return (
      <AppLayout>
        <main className="max-w-screen-lg mx-auto px-4 py-5">
          <div className="h-6 bg-muted rounded-full w-32 mb-6 animate-pulse"></div>
          <div className="flex flex-col gap-2">
            {[1, 2, 3, 4, 5, 6, 7].map(i => (
              <div key={i} className="flex gap-3 items-center px-2 py-3 border-b animate-pulse">
                <div className="w-14 h-14 rounded-full bg-muted flex-shrink-0"></div>
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-4 bg-muted rounded-md w-1/2"></div>
                  <div className="h-3 bg-muted rounded-md w-3/4"></div>
                </div>
              </div>
            ))}
          </div>
        </main>
      </AppLayout>
    );
  }

  const isCancelledOrRejected = (t: Thread) => t.status === "cancelled" || t.status === "rejected";
  const threadsGeral = threads.filter((t) => !isCancelledOrRejected(t));
  const threadsCancelados = threads.filter(isCancelledOrRejected).sort((a, b) => new Date(b.lastMessageTime || b.updated_at).getTime() - new Date(a.lastMessageTime || a.updated_at).getTime());

  const activeThreads = threadsGeral.filter((t) => !t.is_archived);
  const archivedThreads = threadsGeral.filter((t) => t.is_archived);
  const baseList = chatTab === "cancelados" ? threadsCancelados : showArchived ? archivedThreads : activeThreads;

  const normalizeSearch = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/\u0300-\u036f/g, "");
  const currentList = !searchChat.trim()
    ? baseList
    : baseList.filter((t) => {
        const q = normalizeSearch(searchChat);
        const name = normalizeSearch(t.otherName);
        const protocol = normalizeSearch(t.protocol || "");
        return name.includes(q) || protocol.includes(q);
      });

  const canceladosListToShow = !searchChat.trim()
    ? threadsCancelados
    : threadsCancelados.filter((t) => {
        const q = normalizeSearch(searchChat);
        const name = normalizeSearch(t.otherName);
        const protocol = normalizeSearch(t.protocol || "");
        return name.includes(q) || protocol.includes(q);
      });

  const toggleCanceladoSelection = (id: string) => {
    setSelectedCanceladosIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllCancelados = () => setSelectedCanceladosIds(new Set(canceladosListToShow.map((t) => t.id)));
  const deselectAllCancelados = () => setSelectedCanceladosIds(new Set());

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5">
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <h1 className="text-xl font-bold text-foreground">Mensagens</h1>
          <div className="flex items-center gap-2">
            {chatTab === "geral" && !showArchived && activeThreads.some((t) => t.unreadCount > 0 || t.manual_unread) && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs font-bold text-primary flex items-center gap-1.5 bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-full transition-all"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Marcar todas como lidas
              </button>
            )}
            {chatTab === "geral" && archivedThreads.length > 0 && (
              <button
                onClick={() => setShowArchived(!showArchived)}
                className="text-xs font-bold text-primary flex items-center gap-1 bg-primary/5 px-3 py-1.5 rounded-full transition-all"
              >
                {showArchived ? <Inbox className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                {showArchived ? "Ver entrada" : `Arquivados (${archivedThreads.length})`}
              </button>
            )}
          </div>
        </div>

        <Tabs value={chatTab} onValueChange={(v) => setChatTab(v as "geral" | "cancelados")} className="mb-4">
          <TabsList className="w-full grid grid-cols-2 rounded-xl h-11 p-1 bg-muted/60">
            <TabsTrigger value="geral" className="rounded-lg font-semibold data-[state=active]:shadow-sm">
              Geral
            </TabsTrigger>
            <TabsTrigger value="cancelados" className="rounded-lg font-semibold data-[state=active]:shadow-sm flex items-center gap-1.5">
              Cancelados
              {threadsCancelados.length > 0 && (
                <span className="min-w-[20px] h-5 rounded-full bg-muted-foreground/20 text-muted-foreground text-[10px] font-bold flex items-center justify-center px-1.5">
                  {threadsCancelados.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {(activeThreads.length > 0 || archivedThreads.length > 0) && chatTab === "geral" && (
            <div className="relative mt-3 mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchChat}
                onChange={(e) => setSearchChat(e.target.value)}
                placeholder="Buscar por nome ou protocolo..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          )}
          {(threadsCancelados.length > 0) && chatTab === "cancelados" && (
            <div className="relative mt-3 mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchChat}
                onChange={(e) => setSearchChat(e.target.value)}
                placeholder="Buscar por nome ou protocolo..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          )}

          <TabsContent value="geral" className="mt-3">
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
                <div className="text-xs truncate text-muted-foreground">
                  {renderLastMessage(supportLastMsg || "Fale com o suporte")}
                </div>
                {supportUnread > 0 && <span className="min-w-[20px] h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center px-1.5">{supportUnread}</span>}
              </div>
            </div>
          </Link>
        )}

        <div className="flex flex-col">
          {searchChat.trim() && currentList.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Nenhum resultado para &quot;{searchChat}&quot;</div>
          ) : currentList.map((t) => {
            const initials = t.otherName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
            const hasUnread = t.unreadCount > 0 || t.manual_unread;
            const isChatFinished = t.status === "completed" || t.status === "closed" || t.status === "cancelled" || t.status === "rejected";

            return (
              <div key={t.id} className={`flex items-center gap-3 px-2 py-3 border-b last:border-b-0 hover:bg-muted/40 transition-colors rounded-lg ${hasUnread ? "bg-primary/5" : ""}`}>
                <div 
                  onClick={() => {
                    if (hasUnread) handleMarkRead(t.id);
                    navigate(`/messages/${t.id}`);
                  }}
                  className="flex flex-1 items-center gap-3 cursor-pointer min-w-0"
                >
                  <div className="relative flex-shrink-0">
                    {t.otherAvatar ? (
                      // ✨ OTIMIZAÇÃO: Imagem otimizada aplicada aqui com Lazy Loading nativo
                      <img src={getOptimizedAvatar(t.otherAvatar)} alt={t.otherName} loading="lazy" className="w-14 h-14 rounded-full object-cover border-2 border-background shadow-sm" />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary border-2 border-background shadow-sm">
                        {initials}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${hasUnread ? "font-bold text-foreground" : "font-semibold text-foreground"}`}>{t.otherName}</p>
                    <div className={`text-xs truncate mt-0.5 flex items-center gap-1 ${hasUnread ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                      {renderLastMessage(t.lastMessage)}
                    </div>
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
                    <DropdownMenuContent align="end" className="w-52 rounded-xl shadow-lg border-muted">
                      <DropdownMenuItem onClick={() => handleMarkRead(t.id)} className="gap-2 cursor-pointer py-2">
                        <Eye className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium text-sm">Marcar como lida</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleMarkUnread(t.id)} className="gap-2 cursor-pointer py-2">
                        <EyeOff className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium text-sm">Marcar como não lida</span>
                      </DropdownMenuItem>
                      
                      {isChatFinished && (
                        <DropdownMenuItem onClick={() => handleArchive(t.id, t.is_archived)} className="gap-2 cursor-pointer py-2">
                          <Archive className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium text-sm">{t.is_archived ? "Desarquivar" : "Arquivar conversa"}</span>
                        </DropdownMenuItem>
                      )}

                      {showArchived && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeletingChatId(t.id)}
                            className="gap-2 cursor-pointer py-2 text-destructive focus:text-destructive focus:bg-destructive/10"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span className="font-medium text-sm">Excluir conversa</span>
                          </DropdownMenuItem>
                        </>
                      )}
                      
                      <DropdownMenuSeparator />
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
          }) }
        </div>
        
        {/* 🚀 OTIMIZAÇÃO: Botão para carregar mais mensagens caso o usuário queira descer */}
        {hasMore && !showArchived && (
          <div className="flex justify-center mt-6 mb-4">
             <Button variant="outline" onClick={() => setPage(p => p + 1)} className="rounded-full text-xs px-6 py-2 border-primary/20 hover:bg-primary/5">
                Carregar mais conversas
             </Button>
          </div>
        )}
          </TabsContent>

          <TabsContent value="cancelados" className="mt-3">
            {threadsCancelados.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {!canceladosSelectMode ? (
                  <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setCanceladosSelectMode(true)}>
                    Selecionar
                  </Button>
                ) : (
                  <>
                    <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => { setCanceladosSelectMode(false); setSelectedCanceladosIds(new Set()); }}>
                      Cancelar
                    </Button>
                    <Button variant="outline" size="sm" className="rounded-xl" onClick={selectAllCancelados}>
                      Selecionar todas
                    </Button>
                    <Button variant="outline" size="sm" className="rounded-xl" onClick={deselectAllCancelados}>
                      Desmarcar todas
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="rounded-xl"
                      disabled={selectedCanceladosIds.size === 0}
                      onClick={() => setDeletingBatchIds(Array.from(selectedCanceladosIds))}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" />
                      Excluir selecionadas {selectedCanceladosIds.size > 0 ? `(${selectedCanceladosIds.size})` : ""}
                    </Button>
                  </>
                )}
              </div>
            )}
            <div className="flex flex-col">
              {threadsCancelados.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                  <XCircle className="w-12 h-12 mb-3 opacity-50" />
                  <p className="text-sm font-medium">Nenhuma conversa cancelada</p>
                  <p className="text-xs mt-1">Chamados cancelados por você ou recusados pelo profissional aparecem aqui.</p>
                </div>
              ) : searchChat.trim() && canceladosListToShow.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">Nenhum resultado para &quot;{searchChat}&quot;</div>
              ) : (
                canceladosListToShow.map((t) => {
                  const initials = t.otherName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
                  const hasUnread = t.unreadCount > 0 || t.manual_unread;
                  const isSelected = selectedCanceladosIds.has(t.id);
                  return (
                    <div key={t.id} className={`flex items-center gap-3 px-2 py-3 border-b last:border-b-0 hover:bg-muted/40 transition-colors rounded-lg ${hasUnread ? "bg-primary/5" : ""}`}>
                      {canceladosSelectMode && (
                        <button type="button" onClick={() => toggleCanceladoSelection(t.id)} className="flex-shrink-0 p-1 rounded-lg hover:bg-muted">
                          {isSelected ? <CheckSquare className="w-5 h-5 text-primary" /> : <Square className="w-5 h-5 text-muted-foreground" />}
                        </button>
                      )}
                      <div
                        onClick={() => {
                          if (canceladosSelectMode) toggleCanceladoSelection(t.id);
                          else {
                            if (hasUnread) handleMarkRead(t.id);
                            navigate(`/messages/${t.id}`);
                          }
                        }}
                        className="flex flex-1 items-center gap-3 cursor-pointer min-w-0"
                      >
                        <div className="relative flex-shrink-0">
                          {t.otherAvatar ? (
                            <img src={getOptimizedAvatar(t.otherAvatar)} alt={t.otherName} loading="lazy" className="w-14 h-14 rounded-full object-cover border-2 border-background shadow-sm" />
                          ) : (
                            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground border-2 border-background shadow-sm">
                              {initials}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate font-semibold text-foreground">{t.otherName}</p>
                          <div className="text-xs truncate mt-0.5 text-muted-foreground flex items-center gap-1">
                            {t.status === "rejected" ? "Recusado pelo profissional" : "Cancelado"}
                          </div>
                        </div>
                      </div>
                      {!canceladosSelectMode && (
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span className="text-[11px] text-muted-foreground">{timeLabel(t.lastMessageTime)}</span>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="p-1 hover:bg-muted rounded-full transition-colors text-muted-foreground">
                                <MoreVertical className="w-4 h-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52 rounded-xl shadow-lg border-muted">
                              <DropdownMenuItem onClick={() => handleArchive(t.id, t.is_archived)} className="gap-2 cursor-pointer py-2">
                                <Archive className="w-4 h-4 text-muted-foreground" />
                                <span className="font-medium text-sm">{t.is_archived ? "Desarquivar" : "Arquivar conversa"}</span>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setReportingChatId(t.id)} className="gap-2 cursor-pointer py-2 text-amber-600 focus:text-amber-600 focus:bg-amber-50">
                                <AlertTriangle className="w-4 h-4" />
                                <span className="font-medium text-sm">Denunciar conversa</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </TabsContent>
        </Tabs>

        <Dialog open={!!reportingChatId} onOpenChange={(open) => { if (!open) { setReportingChatId(null); setReportReason(""); } }}>
          <DialogContent className="sm:max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-600">
                <AlertTriangle className="w-5 h-5" /> Denunciar Conversa
              </DialogTitle>
              <DialogDescription>
                Descreva o motivo da denúncia para análise do suporte. Mínimo 20 caracteres.
              </DialogDescription>
            </DialogHeader>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              className="w-full min-h-[120px] p-3 rounded-xl border border-muted bg-background text-sm outline-none focus:border-amber-500"
              placeholder="Descreva o motivo da denúncia (mínimo 20 caracteres)..."
            />
            <p className="text-xs text-muted-foreground">{reportReason.trim().length}/20 caracteres (mínimo)</p>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => { setReportingChatId(null); setReportReason(""); }} className="rounded-xl">Cancelar</Button>
              <Button
                onClick={handleReportSubmit}
                disabled={isSubmittingReport || reportReason.trim().length < 20}
                className="rounded-xl bg-amber-600 text-white"
              >
                {isSubmittingReport ? "Enviando..." : "Enviar Denúncia"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!deletingChatId} onOpenChange={(open) => !open && setDeletingChatId(null)}>
          <DialogContent className="sm:max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="w-5 h-5" /> Excluir conversa
              </DialogTitle>
              <DialogDescription>
                Tem certeza que deseja excluir essa conversa? Você perderá histórico, comprovante ou qualquer conversa desse serviço.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setDeletingChatId(null)} className="rounded-xl">Cancelar</Button>
              <Button
                variant="destructive"
                onClick={() => deletingChatId && handleDeleteConversation(deletingChatId)}
                disabled={isDeleting}
                className="rounded-xl"
              >
                {isDeleting ? "Excluindo..." : "Excluir"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={deletingBatchIds !== null && deletingBatchIds.length > 0} onOpenChange={(open) => !open && setDeletingBatchIds(null)}>
          <DialogContent className="sm:max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="w-5 h-5" /> Excluir conversas
              </DialogTitle>
              <DialogDescription>
                Tem certeza que deseja excluir {deletingBatchIds?.length || 0} conversa(s)? Você perderá o histórico e comprovantes desses serviços.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setDeletingBatchIds(null)} className="rounded-xl">Cancelar</Button>
              <Button variant="destructive" onClick={handleBatchDeleteConfirm} disabled={isDeleting} className="rounded-xl">
                {isDeleting ? "Excluindo..." : "Excluir todas"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </AppLayout>
  );
};

export default Messages;