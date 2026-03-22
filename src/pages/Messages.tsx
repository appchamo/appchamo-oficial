import AppLayout from "@/components/AppLayout";
import {
  MessageSquare, MoreVertical, Archive, EyeOff, Eye, AlertTriangle,
  Inbox, Mic, Package, CheckCheck, Trash2, XCircle, Search,
  CheckSquare, Square, Check,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
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

// Cache em memória — lista aparece instantaneamente ao voltar para a tela
let _threadsCache: Thread[] = [];

const getOptimizedAvatar = (url: string | null | undefined) => {
  if (!url) return undefined;
  if (url.includes("supabase.co/storage/v1/object/public/")) {
    return url.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/") +
      "?width=96&height=96&resize=cover&quality=70";
  }
  return url;
};

const Messages = () => {
  const [threads, setThreads] = useState<Thread[]>(_threadsCache);
  const [loading, setLoading] = useState(_threadsCache.length === 0);
  const [supportUnread, setSupportUnread] = useState(0);
  const [supportLastMsg, setSupportLastMsg] = useState<string | null>(null);
  const [supportLastTime, setSupportLastTime] = useState<string | null>(null);
  const [hasSupportMessages, setHasSupportMessages] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [chatTab, setChatTab] = useState<"geral" | "cancelados">("geral");
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
  const userIdRef = useRef<string | null>(null);
  const navigate = useNavigate();

  const load = useCallback(async (isBackgroundUpdate = false) => {
    if (!isBackgroundUpdate && _threadsCache.length === 0) setLoading(true);

    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) { if (!isBackgroundUpdate) setLoading(false); return; }
    userIdRef.current = user.id;

    const PAGE_SIZE = 7;
    const limitCount = (page + 1) * PAGE_SIZE;

    const [
      { data: supportMsgs, count: totalSupport },
      { data: proData },
    ] = await Promise.all([
      supabase.from("support_messages").select("*", { count: "exact" }).eq("user_id", user.id).order("created_at", { ascending: false }).limit(1),
      supabase.from("professionals").select("id").eq("user_id", user.id),
    ]);

    if (totalSupport && totalSupport > 0 && supportMsgs && supportMsgs.length > 0) {
      setHasSupportMessages(true);
      setSupportLastMsg((supportMsgs[0] as any).content);
      setSupportLastTime((supportMsgs[0] as any).created_at);
      supabase.from("support_read_status" as any).select("last_read_at").eq("user_id", user.id).eq("thread_user_id", user.id).maybeSingle().then(({ data: readStatus }: { data: { last_read_at: string } | null }) => {
        const q = supabase.from("support_messages").select("*", { count: "exact", head: true }).eq("user_id", user.id).neq("sender_id", user.id);
        (readStatus ? q.gt("created_at", readStatus.last_read_at) : q).then(({ count }) => setSupportUnread(count || 0));
      });
    }

    const proIds = proData?.map((p: any) => p.id) || [];
    const reqQuery = proIds.length > 0
      ? supabase.from("service_requests").select("*").or(`client_id.eq.${user.id},professional_id.in.(${proIds.join(",")})`).order("updated_at", { ascending: false }).limit(limitCount)
      : supabase.from("service_requests").select("*").eq("client_id", user.id).order("updated_at", { ascending: false }).limit(limitCount);

    const { data: allReqsRaw } = await reqQuery;
    const allReqs = allReqsRaw || [];
    setHasMore(allReqs.length === limitCount);

    const unique = Array.from(new Map(allReqs.map((r: any) => [r.id, r])).values()) as any[];
    const threadIds = unique.map((r: any) => r.id);

    if (threadIds.length === 0) {
      _threadsCache = [];
      setThreads([]);
      if (!isBackgroundUpdate) setLoading(false);
      return;
    }

    const proIdsUniq = [...new Set(unique.map((r: any) => r.professional_id))] as string[];
    const [{ data: readStatuses }, { data: allPros }] = await Promise.all([
      supabase.from("chat_read_status" as any).select("request_id, last_read_at, is_archived, is_deleted, manual_unread").eq("user_id", user.id).in("request_id", threadIds),
      supabase.from("professionals").select("id, user_id").in("id", proIdsUniq),
    ]);

    const statusMap = new Map(((readStatuses || []) as any[]).map(rs => [rs.request_id, rs]));
    const proUserIdMap = new Map(((allPros || []) as any[]).map(p => [p.id, p.user_id]));
    const usersToFetch = [...new Set(unique.map((req: any) => req.client_id === user.id ? proUserIdMap.get(req.professional_id) : req.client_id).filter(Boolean))] as string[];

    const [profilesResult, sumsResult] = await Promise.all([
      supabase.from("profiles_public" as any).select("user_id, full_name, avatar_url").in("user_id", usersToFetch),
      supabase.rpc("get_chat_thread_summaries", { _request_ids: threadIds, _user_id: user.id }),
    ]);

    const profileMap = new Map(((profilesResult.data || []) as any[]).map(p => [p.user_id, p]));

    type Sum = { lastMessage: string | null; lastMessageTime: string | null; unreadCount: number };
    const summaryByReq = new Map<string, Sum>();

    if (!sumsResult.error && Array.isArray(sumsResult.data)) {
      for (const row of sumsResult.data as any[]) {
        summaryByReq.set(row.request_id, {
          lastMessage: row.last_message ?? null,
          lastMessageTime: row.last_message_at ?? null,
          unreadCount: Number(row.unread_count) || 0,
        });
      }
    } else {
      await Promise.all(unique.map(async (req: any) => {
        const st = statusMap.get(req.id) || {};
        const [lastMsgRes, unreadRes] = await Promise.all([
          supabase.from("chat_messages").select("content, created_at").eq("request_id", req.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
          st.last_read_at
            ? supabase.from("chat_messages").select("*", { count: "exact", head: true }).eq("request_id", req.id).neq("sender_id", user.id).gt("created_at", st.last_read_at)
            : supabase.from("chat_messages").select("*", { count: "exact", head: true }).eq("request_id", req.id).neq("sender_id", user.id),
        ]);
        summaryByReq.set(req.id, {
          lastMessage: lastMsgRes.data?.content ?? null,
          lastMessageTime: lastMsgRes.data?.created_at ?? null,
          unreadCount: unreadRes.count || 0,
        });
      }));
    }

    const enriched: Thread[] = unique.map((req: any) => {
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
    }).filter((t) => t !== null) as Thread[];

    const finalThreads = enriched.sort(
      (a, b) => new Date(b.lastMessageTime || b.updated_at).getTime() - new Date(a.lastMessageTime || a.updated_at).getTime()
    );
    _threadsCache = finalThreads;
    setThreads(finalThreads);
    if (!isBackgroundUpdate) setLoading(false);
  }, [page]);

  // ─────────────────────────────────────────────────────────────────────
  // Atualização incremental de thread a partir de uma mensagem nova
  // SEM fazer refetch completo — como o WhatsApp
  // ─────────────────────────────────────────────────────────────────────
  const applyNewMessage = useCallback((payload: any) => {
    const msg = payload.new as { id: string; request_id: string; sender_id: string; content: string; created_at: string };
    const uid = userIdRef.current;

    setThreads((prev) => {
      const idx = prev.findIndex((t) => t.id === msg.request_id);
      if (idx === -1) {
        // Thread nova — faz um refetch leve em background
        load(true);
        return prev;
      }

      const updated = { ...prev[idx] };
      updated.lastMessage = msg.content;
      updated.lastMessageTime = msg.created_at;
      // Incrementa não-lidos só se a mensagem não for minha
      if (msg.sender_id !== uid) {
        updated.unreadCount = (updated.unreadCount || 0) + 1;
      }

      const next = [...prev];
      next.splice(idx, 1);
      return [updated, ...next]; // move para o topo
    });

    // Atualiza cache também
    _threadsCache = _threadsCache.map((t) => {
      if (t.id !== msg.request_id) return t;
      return {
        ...t,
        lastMessage: msg.content,
        lastMessageTime: msg.created_at,
        unreadCount: msg.sender_id !== userIdRef.current ? (t.unreadCount || 0) + 1 : t.unreadCount,
      };
    }).sort((a, b) =>
      new Date(b.lastMessageTime || b.updated_at).getTime() - new Date(a.lastMessageTime || a.updated_at).getTime()
    );
  }, [load]);

  useEffect(() => {
    load();

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleFullReload = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => load(true), 300);
    };

    const channel = supabase.channel("messages-list-realtime-v2")
      // Mensagens novas → atualização incremental INSTANTÂNEA
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, applyNewMessage)
      // Demais eventos → refetch com debounce curto
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_messages" }, scheduleFullReload)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_read_status" }, scheduleFullReload)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "service_requests" }, scheduleFullReload)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "service_requests" }, scheduleFullReload)
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [load, applyNewMessage]);

  const handleArchive = async (chatId: string, current: boolean) => {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("chat_read_status" as any).update({ is_archived: !current }).eq("user_id", user?.id).eq("request_id", chatId);
    load(true);
  };

  const handleMarkRead = async (chatId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    // Atualização otimista — imediata na UI
    setThreads((prev) => prev.map((t) => t.id === chatId ? { ...t, unreadCount: 0, manual_unread: false } : t));
    await supabase.from("chat_read_status" as any).upsert(
      { request_id: chatId, user_id: user.id, last_read_at: new Date().toISOString(), manual_unread: false },
      { onConflict: "request_id,user_id" }
    );
  };

  const handleMarkUnread = async (chatId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    setThreads((prev) => prev.map((t) => t.id === chatId ? { ...t, manual_unread: true } : t));
    await supabase.from("chat_read_status" as any).update({ manual_unread: true }).eq("user_id", user?.id).eq("request_id", chatId);
  };

  const handleMarkAllRead = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setThreads((prev) => prev.map((t) => ({ ...t, unreadCount: 0, manual_unread: false })));
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
    await Promise.all(reqIds.map((request_id) =>
      supabase.from("chat_read_status" as any).upsert(
        { request_id, user_id: user.id, last_read_at: now, manual_unread: false },
        { onConflict: "request_id,user_id" }
      )
    ));
  };

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
      setThreads((prev) => prev.filter((t) => t.id !== chatId));
    } finally { setIsDeleting(false); }
  };

  const handleBatchDeleteConfirm = async () => {
    if (!deletingBatchIds?.length) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setIsDeleting(true);
    try {
      await Promise.all(deletingBatchIds.map((chatId) =>
        supabase.from("chat_read_status" as any).upsert(
          { request_id: chatId, user_id: user.id, last_read_at: new Date().toISOString(), is_deleted: true },
          { onConflict: "request_id,user_id" }
        )
      ));
      setThreads((prev) => prev.filter((t) => !deletingBatchIds.includes(t.id)));
      setDeletingBatchIds(null);
      setSelectedCanceladosIds(new Set());
      setCanceladosSelectMode(false);
    } finally { setIsDeleting(false); }
  };

  const handleReportSubmit = async () => {
    if (!reportingChatId || reportReason.trim().length < 20) return;
    setIsSubmittingReport(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      const { error } = await supabase.from("chat_reports" as any).insert({ reporter_id: user.id, chat_id: reportingChatId, reason: reportReason.trim() });
      if (error) throw error;
      const [{ data: supportProfile2 }, { data: adminProfile2 }] = await Promise.all([
        supabase.from("profiles").select("user_id").eq("email", "suporte@appchamo.com").maybeSingle(),
        supabase.from("profiles").select("user_id").eq("email", "admin@appchamo.com").maybeSingle(),
      ]);
      const notifs: any[] = [];
      if (supportProfile2?.user_id) notifs.push({ user_id: supportProfile2.user_id, title: "🚨 Nova denúncia de chat", message: "Uma conversa foi denunciada. Revisar na Central.", type: "support", link: "/suporte-desk" });
      if (adminProfile2?.user_id) notifs.push({ user_id: adminProfile2.user_id, title: "🚨 Nova Denúncia", message: "Uma conversa foi denunciada por um usuário.", type: "report", link: "/suporte-desk" });
      if (notifs.length > 0) await supabase.from("notifications").insert(notifs as any);
      setReportingChatId(null);
      setReportReason("");
      toast({ title: "Denúncia enviada com sucesso!" });
    } catch { toast({ title: "Erro ao enviar denúncia.", variant: "destructive" }); }
    finally { setIsSubmittingReport(false); }
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
    if (!msg) return <span className="text-muted-foreground/70">Nova conversa</span>;
    if (msg.startsWith("[AUDIO:")) return <span className="flex items-center gap-1 text-muted-foreground"><Mic className="w-3 h-3" /> Áudio</span>;
    if (msg.includes("[PRODUCT:")) return <span className="flex items-center gap-1 text-emerald-600 font-medium"><Package className="w-3 h-3" /> Produto</span>;
    return <span className="truncate">{msg}</span>;
  };

  if (loading && threads.length === 0) {
    return (
      <AppLayout>
        <main className="max-w-screen-lg mx-auto">
          <div className="px-4 py-4 border-b">
            <div className="h-6 bg-muted rounded-full w-32 animate-pulse" />
          </div>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex gap-3 items-center px-4 py-3.5 border-b animate-pulse">
              <div className="w-12 h-12 rounded-full bg-muted flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="flex justify-between">
                  <div className="h-3.5 bg-muted rounded w-28" />
                  <div className="h-3 bg-muted rounded w-10" />
                </div>
                <div className="h-3 bg-muted rounded w-44" />
              </div>
            </div>
          ))}
        </main>
      </AppLayout>
    );
  }

  const isCancelledOrRejected = (t: Thread) => t.status === "cancelled" || t.status === "rejected";
  const threadsGeral = threads.filter((t) => !isCancelledOrRejected(t));
  const threadsCancelados = threads.filter(isCancelledOrRejected).sort((a, b) =>
    new Date(b.lastMessageTime || b.updated_at).getTime() - new Date(a.lastMessageTime || a.updated_at).getTime()
  );
  const activeThreads = threadsGeral.filter((t) => !t.is_archived);
  const archivedThreads = threadsGeral.filter((t) => t.is_archived);
  const baseList = chatTab === "cancelados" ? threadsCancelados : showArchived ? archivedThreads : activeThreads;

  const normalizeSearch = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const currentList = !searchChat.trim() ? baseList : baseList.filter((t) => {
    const q = normalizeSearch(searchChat);
    return normalizeSearch(t.otherName).includes(q) || normalizeSearch(t.protocol || "").includes(q);
  });

  const canceladosListToShow = !searchChat.trim() ? threadsCancelados : threadsCancelados.filter((t) => {
    const q = normalizeSearch(searchChat);
    return normalizeSearch(t.otherName).includes(q) || normalizeSearch(t.protocol || "").includes(q);
  });

  const toggleCanceladoSelection = (id: string) => {
    setSelectedCanceladosIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ── Thread item component ──────────────────────────────────────────
  const ThreadItem = ({ t, isCancelled = false }: { t: Thread; isCancelled?: boolean }) => {
    const initials = t.otherName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    const hasUnread = t.unreadCount > 0 || t.manual_unread;
    const isChatFinished = t.status === "completed" || t.status === "closed" || t.status === "cancelled" || t.status === "rejected";
    const isSelected = selectedCanceladosIds.has(t.id);

    return (
      <div className={`flex items-center gap-3 px-4 py-3 border-b border-border/50 last:border-b-0 active:bg-muted/60 transition-colors ${hasUnread ? "bg-primary/[0.04]" : ""}`}>
        {isCancelled && canceladosSelectMode && (
          <button type="button" onClick={() => toggleCanceladoSelection(t.id)} className="flex-shrink-0">
            {isSelected ? <CheckSquare className="w-5 h-5 text-primary" /> : <Square className="w-5 h-5 text-muted-foreground" />}
          </button>
        )}

        <div
          onClick={() => {
            if (isCancelled && canceladosSelectMode) { toggleCanceladoSelection(t.id); return; }
            if (hasUnread) handleMarkRead(t.id);
            navigate(`/messages/${t.id}`);
          }}
          className="flex flex-1 items-center gap-3 cursor-pointer min-w-0"
        >
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            {t.otherAvatar ? (
              <img
                src={getOptimizedAvatar(t.otherAvatar)}
                alt={t.otherName}
                loading="lazy"
                className="w-[52px] h-[52px] rounded-full object-cover"
              />
            ) : (
              <div className={`w-[52px] h-[52px] rounded-full flex items-center justify-center text-sm font-bold ${isCancelled ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary"}`}>
                {initials}
              </div>
            )}
          </div>

          {/* Texto */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <p className={`text-[15px] truncate ${hasUnread ? "font-bold text-foreground" : "font-medium text-foreground"}`}>
                {t.otherName}
              </p>
              <span className={`text-[11px] flex-shrink-0 ${hasUnread ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                {timeLabel(t.lastMessageTime)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className={`text-[13px] truncate flex items-center gap-1 flex-1 min-w-0 ${hasUnread ? "text-foreground/80" : "text-muted-foreground"}`}>
                {isCancelled
                  ? <span>{t.status === "rejected" ? "Recusado" : "Cancelado"}</span>
                  : renderLastMessage(t.lastMessage)}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {hasUnread && (
                  <span className="min-w-[20px] h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center px-1.5 leading-none">
                    {t.unreadCount > 0 ? (t.unreadCount > 99 ? "99+" : t.unreadCount) : ""}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Menu */}
        {(!isCancelled || !canceladosSelectMode) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1.5 hover:bg-muted rounded-full transition-colors text-muted-foreground flex-shrink-0">
                <MoreVertical className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 rounded-xl shadow-lg">
              <DropdownMenuItem onClick={() => handleMarkRead(t.id)} className="gap-2 cursor-pointer py-2.5">
                <Eye className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">Marcar como lida</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleMarkUnread(t.id)} className="gap-2 cursor-pointer py-2.5">
                <EyeOff className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">Marcar como não lida</span>
              </DropdownMenuItem>
              {isChatFinished && (
                <DropdownMenuItem onClick={() => handleArchive(t.id, t.is_archived)} className="gap-2 cursor-pointer py-2.5">
                  <Archive className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">{t.is_archived ? "Desarquivar" : "Arquivar"}</span>
                </DropdownMenuItem>
              )}
              {showArchived && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setDeletingChatId(t.id)} className="gap-2 cursor-pointer py-2.5 text-destructive focus:text-destructive focus:bg-destructive/10">
                    <Trash2 className="w-4 h-4" />
                    <span className="text-sm">Excluir conversa</span>
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setReportingChatId(t.id)} className="gap-2 cursor-pointer py-2.5 text-amber-600 focus:text-amber-600 focus:bg-amber-50">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm">Denunciar</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    );
  };

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border/60">
          <h1 className="text-xl font-bold text-foreground">Conversas</h1>
          <div className="flex items-center gap-2">
            {chatTab === "geral" && !showArchived && activeThreads.some((t) => t.unreadCount > 0 || t.manual_unread) && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs font-semibold text-primary flex items-center gap-1 bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-full transition-all"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Ler tudo
              </button>
            )}
            {chatTab === "geral" && archivedThreads.length > 0 && (
              <button
                onClick={() => setShowArchived(!showArchived)}
                className="text-xs font-semibold text-primary flex items-center gap-1 bg-primary/5 hover:bg-primary/10 px-3 py-1.5 rounded-full transition-all"
              >
                {showArchived ? <Inbox className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                {showArchived ? "Entrada" : `Arquivados (${archivedThreads.length})`}
              </button>
            )}
          </div>
        </div>

        {/* ── Tabs ── */}
        <Tabs value={chatTab} onValueChange={(v) => setChatTab(v as "geral" | "cancelados")} className="px-4 pt-3">
          <TabsList className="w-full grid grid-cols-2 rounded-xl h-10 p-1 bg-muted/50">
            <TabsTrigger value="geral" className="rounded-lg text-sm font-semibold data-[state=active]:shadow-sm">
              Geral
            </TabsTrigger>
            <TabsTrigger value="cancelados" className="rounded-lg text-sm font-semibold data-[state=active]:shadow-sm flex items-center gap-1.5">
              Cancelados
              {threadsCancelados.length > 0 && (
                <span className="min-w-[18px] h-[18px] rounded-full bg-muted-foreground/20 text-muted-foreground text-[9px] font-bold flex items-center justify-center px-1">
                  {threadsCancelados.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Search ── */}
          {((chatTab === "geral" && (activeThreads.length > 0 || archivedThreads.length > 0)) ||
            (chatTab === "cancelados" && threadsCancelados.length > 0)) && (
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchChat}
                onChange={(e) => setSearchChat(e.target.value)}
                placeholder="Buscar conversa..."
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border bg-muted/40 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:bg-background transition-colors"
              />
            </div>
          )}

          {/* ── TAB: Geral ── */}
          <TabsContent value="geral" className="mt-3 -mx-4">
            {!showArchived && hasSupportMessages && (
              <Link
                to="/support"
                className={`flex items-center gap-3 px-4 py-3 border-b border-border/50 active:bg-muted/60 transition-colors ${supportUnread > 0 ? "bg-amber-500/[0.05]" : ""}`}
              >
                <div className="w-[52px] h-[52px] rounded-full bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                  <MessageSquare className="w-6 h-6 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <p className={`text-[15px] truncate ${supportUnread > 0 ? "font-bold text-foreground" : "font-medium text-foreground"}`}>
                      🛟 Suporte Chamô
                    </p>
                    {supportLastTime && (
                      <span className={`text-[11px] flex-shrink-0 ${supportUnread > 0 ? "text-amber-500 font-semibold" : "text-muted-foreground"}`}>
                        {timeLabel(supportLastTime)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] truncate text-muted-foreground">
                      {supportLastMsg || "Fale com o suporte"}
                    </p>
                    {supportUnread > 0 && (
                      <span className="min-w-[20px] h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center px-1.5">
                        {supportUnread}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            )}

            {searchChat.trim() && currentList.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm px-4">
                Nenhuma conversa encontrada para &quot;{searchChat}&quot;
              </div>
            ) : currentList.length === 0 && !hasSupportMessages ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
                  <MessageSquare className="w-8 h-8 text-muted-foreground/50" />
                </div>
                <p className="font-semibold text-foreground text-base mb-1">Nenhuma conversa ainda</p>
                <p className="text-sm text-muted-foreground">Quando contratar um profissional, a conversa aparece aqui.</p>
              </div>
            ) : (
              currentList.map((t) => <ThreadItem key={t.id} t={t} />)
            )}

            {hasMore && !showArchived && (
              <div className="flex justify-center py-4 px-4">
                <Button variant="outline" onClick={() => setPage(p => p + 1)} className="rounded-full text-xs px-6 border-primary/20 hover:bg-primary/5">
                  Carregar mais
                </Button>
              </div>
            )}
          </TabsContent>

          {/* ── TAB: Cancelados ── */}
          <TabsContent value="cancelados" className="mt-3 -mx-4">
            {threadsCancelados.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-3 px-4">
                {!canceladosSelectMode ? (
                  <Button variant="outline" size="sm" className="rounded-xl h-8 text-xs" onClick={() => setCanceladosSelectMode(true)}>
                    Selecionar
                  </Button>
                ) : (
                  <>
                    <Button variant="ghost" size="sm" className="rounded-xl h-8 text-xs" onClick={() => { setCanceladosSelectMode(false); setSelectedCanceladosIds(new Set()); }}>
                      Cancelar
                    </Button>
                    <Button variant="outline" size="sm" className="rounded-xl h-8 text-xs" onClick={() => setSelectedCanceladosIds(new Set(canceladosListToShow.map((t) => t.id)))}>
                      Todas
                    </Button>
                    <Button variant="destructive" size="sm" className="rounded-xl h-8 text-xs" disabled={selectedCanceladosIds.size === 0} onClick={() => setDeletingBatchIds(Array.from(selectedCanceladosIds))}>
                      <Trash2 className="w-3 h-3 mr-1" />
                      Excluir {selectedCanceladosIds.size > 0 ? `(${selectedCanceladosIds.size})` : ""}
                    </Button>
                  </>
                )}
              </div>
            )}

            {threadsCancelados.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <XCircle className="w-12 h-12 mb-3 text-muted-foreground/30" />
                <p className="text-sm font-medium text-foreground">Nenhuma conversa cancelada</p>
                <p className="text-xs mt-1 text-muted-foreground">Chamados cancelados ou recusados aparecem aqui.</p>
              </div>
            ) : searchChat.trim() && canceladosListToShow.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm px-4">Nenhum resultado</div>
            ) : (
              canceladosListToShow.map((t) => <ThreadItem key={t.id} t={t} isCancelled />)
            )}
          </TabsContent>
        </Tabs>

        {/* ── Dialogs ── */}
        <Dialog open={!!reportingChatId} onOpenChange={(open) => { if (!open) { setReportingChatId(null); setReportReason(""); } }}>
          <DialogContent className="sm:max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-amber-600"><AlertTriangle className="w-5 h-5" /> Denunciar Conversa</DialogTitle>
              <DialogDescription>Descreva o motivo da denúncia (mínimo 20 caracteres).</DialogDescription>
            </DialogHeader>
            <textarea value={reportReason} onChange={(e) => setReportReason(e.target.value)} className="w-full min-h-[120px] p-3 rounded-xl border bg-background text-sm outline-none focus:border-amber-500" placeholder="Motivo da denúncia..." />
            <p className="text-xs text-muted-foreground">{reportReason.trim().length}/20</p>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => { setReportingChatId(null); setReportReason(""); }} className="rounded-xl">Cancelar</Button>
              <Button onClick={handleReportSubmit} disabled={isSubmittingReport || reportReason.trim().length < 20} className="rounded-xl bg-amber-600 text-white">
                {isSubmittingReport ? "Enviando..." : "Enviar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!deletingChatId} onOpenChange={(open) => !open && setDeletingChatId(null)}>
          <DialogContent className="sm:max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive"><Trash2 className="w-5 h-5" /> Excluir conversa</DialogTitle>
              <DialogDescription>Tem certeza? Você perderá o histórico desta conversa.</DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setDeletingChatId(null)} className="rounded-xl">Cancelar</Button>
              <Button variant="destructive" onClick={() => deletingChatId && handleDeleteConversation(deletingChatId)} disabled={isDeleting} className="rounded-xl">
                {isDeleting ? "Excluindo..." : "Excluir"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={deletingBatchIds !== null && deletingBatchIds.length > 0} onOpenChange={(open) => !open && setDeletingBatchIds(null)}>
          <DialogContent className="sm:max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive"><Trash2 className="w-5 h-5" /> Excluir conversas</DialogTitle>
              <DialogDescription>Excluir {deletingBatchIds?.length || 0} conversa(s)? Esta ação não pode ser desfeita.</DialogDescription>
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
