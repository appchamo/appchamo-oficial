import AppLayout from "@/components/AppLayout";
import {
  MessageSquare, MoreVertical, Archive, EyeOff, Eye, AlertTriangle,
  Inbox, Mic, Package, CheckCheck, Trash2, XCircle,   Search,
  CheckSquare, Square, Check, X, Pin, Tag, UserCheck, Sparkles,
} from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { subscribeThreadActivity } from "@/lib/threadActivityChannels";
import { useRefreshAtKey } from "@/contexts/RefreshContext";
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

type ThreadLabelColor = "blue" | "green" | "orange" | "red";

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
  is_pinned: boolean;
  label_color: ThreadLabelColor | null;
  label_text: string | null;
  /** Profissional (ou outra parte) entra na aba Seguindo: favorito no perfil ou seguimento em user_follows. */
  isSeguindoPro?: boolean;
  /** `following` = DM por seguir; `service` = chamado normal. */
  request_kind?: string | null;
}

const MAX_PINNED_THREADS = 3;

const sortThreadsByPinAndTime = (list: Thread[]) => {
  const byTime = (a: Thread, b: Thread) =>
    new Date(b.lastMessageTime || b.updated_at).getTime() - new Date(a.lastMessageTime || a.updated_at).getTime();
  const pinned = list.filter((t) => t.is_pinned).sort(byTime);
  const rest = list.filter((t) => !t.is_pinned).sort(byTime);
  return [...pinned, ...rest];
};

const labelColorPillClass = (c: ThreadLabelColor) =>
  ({
    blue: "border border-blue-500/70 text-blue-700 dark:text-blue-300 bg-blue-500/10",
    green: "border border-emerald-500/70 text-emerald-700 dark:text-emerald-300 bg-emerald-500/10",
    orange: "border border-orange-500/70 text-orange-800 dark:text-orange-300 bg-orange-500/10",
    red: "border border-red-500/70 text-red-700 dark:text-red-300 bg-red-500/10",
  })[c];

const labelColorSwatchClass = (c: ThreadLabelColor) =>
  ({
    blue: "border-2 border-blue-500/50 bg-blue-500/10 text-blue-800 dark:text-blue-200 hover:bg-blue-500/20",
    green: "border-2 border-emerald-500/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-500/20",
    orange: "border-2 border-orange-500/50 bg-orange-500/10 text-orange-900 dark:text-orange-200 hover:bg-orange-500/20",
    red: "border-2 border-red-500/50 bg-red-500/10 text-red-800 dark:text-red-200 hover:bg-red-500/20",
  })[c];

// Cache em memória — lista aparece instantaneamente ao voltar para a tela
let _threadsCache: Thread[] = [];

const getOptimizedAvatar = (url: string | null | undefined) => {
  if (!url) return undefined;
  if (url.includes("supabase.co/storage/v1/object/public/")) {
    return url.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/") +
      "?width=96&height=96&resize=cover&quality=62";
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
  const [showCancelados, setShowCancelados] = useState(false);
  const [chatTab, setChatTab] = useState<"geral" | "seguindo">("geral");
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
  const [threadMenuThread, setThreadMenuThread] = useState<Thread | null>(null);
  const [labelModal, setLabelModal] = useState<{
    thread: Thread;
    step: "colors" | "text";
    color: ThreadLabelColor | null;
    text: string;
  } | null>(null);
  const userIdRef = useRef<string | null>(null);
  /** Sincronizado com a sessão — evita efeito de “digitando” antes do userIdRef estar definido. */
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const longPressTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const skipNextNavRef = useRef(false);
  const [peerActivityByThread, setPeerActivityByThread] = useState<Record<string, "typing" | "recording">>({});
  const navigate = useNavigate();

  /** Mensagens pendentes (não lidas) só nas conversas da aba Seguindo — entrada ativa. */
  const seguindoPendingTotal = useMemo(() => {
    const dead = (t: Thread) => t.status === "cancelled" || t.status === "rejected";
    return threads
      .filter((t) => !dead(t) && !t.is_archived && t.isSeguindoPro)
      .reduce((sum, t) => {
        if (t.unreadCount > 0) return sum + t.unreadCount;
        if (t.manual_unread) return sum + 1;
        return sum;
      }, 0);
  }, [threads]);

  const listSlices = useMemo(() => {
    const isCancelledOrRejected = (t: Thread) => t.status === "cancelled" || t.status === "rejected";

    const threadsCancelados = sortThreadsByPinAndTime(threads.filter(isCancelledOrRejected));
    const threadsNonCancelled = sortThreadsByPinAndTime(threads.filter((t) => !isCancelledOrRejected(t)));
    /** Conversa com alguém que segues (ou favoritaste no perfil profissional). */
    const threadsSeguindoTab = sortThreadsByPinAndTime(threadsNonCancelled.filter((t) => t.isSeguindoPro));
    const threadsGeralTab = sortThreadsByPinAndTime(threadsNonCancelled.filter((t) => !t.isSeguindoPro));

    const tabPool = chatTab === "seguindo" ? threadsSeguindoTab : threadsGeralTab;
    const activeThreads = tabPool.filter((t) => !t.is_archived);
    const archivedThreads = tabPool.filter((t) => t.is_archived);

    const baseList = showCancelados ? threadsCancelados : showArchived ? archivedThreads : activeThreads;

    const normalizeSearch = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const currentList = !searchChat.trim()
      ? baseList
      : baseList.filter((t) => {
          const q = normalizeSearch(searchChat);
          return normalizeSearch(t.otherName).includes(q) || normalizeSearch(t.protocol || "").includes(q);
        });

    const canceladosListToShow = !searchChat.trim()
      ? threadsCancelados
      : threadsCancelados.filter((t) => {
          const q = normalizeSearch(searchChat);
          return normalizeSearch(t.otherName).includes(q) || normalizeSearch(t.protocol || "").includes(q);
        });

    const subscriptionWatchList = showCancelados ? canceladosListToShow : currentList;
    const subscriptionIds = [...new Set(subscriptionWatchList.slice(0, 45).map((t) => t.id))];

    return {
      threadsCancelados,
      threadsSeguindoTab,
      activeThreads,
      archivedThreads,
      currentList,
      canceladosListToShow,
      subscriptionIds,
    };
  }, [threads, chatTab, showArchived, showCancelados, searchChat]);

  const load = useCallback(async (isBackgroundUpdate = false, opts?: { widenFetch?: boolean }) => {
    if (!isBackgroundUpdate && _threadsCache.length === 0) setLoading(true);

    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      userIdRef.current = null;
      setCurrentUserId(null);
      if (!isBackgroundUpdate) setLoading(false);
      return;
    }
    userIdRef.current = user.id;
    setCurrentUserId(user.id);

    const [{ data: favRows }, { data: followRows }] = await Promise.all([
      supabase.from("professional_favorites" as any).select("professional_id").eq("user_id", user.id),
      supabase.from("user_follows" as any).select("followed_user_id").eq("follower_user_id", user.id),
    ]);
    const favoriteProIds = new Set<string>((favRows || []).map((r: any) => String(r.professional_id)));
    const followedUserIds = new Set<string>((followRows || []).map((r: any) => String(r.followed_user_id)));

    const PAGE_SIZE = 7;
    const baseLimit = (page + 1) * PAGE_SIZE;
    // Após mensagem em thread que ainda não estava na lista: busca janela maior para incluir conversa que subiu no ranking
    const limitCount = opts?.widenFetch ? Math.max(baseLimit, PAGE_SIZE * 8) : baseLimit;

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
      supabase.from("chat_read_status" as any).select("request_id, last_read_at, is_archived, is_deleted, manual_unread, is_pinned, label_color, label_text").eq("user_id", user.id).in("request_id", threadIds),
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

    const allowedColors = new Set(["blue", "green", "orange", "red"]);
    const enriched: Thread[] = unique.map((req: any) => {
      const statusData = statusMap.get(req.id) || { is_archived: false, is_deleted: false, manual_unread: false };
      if (statusData.is_deleted) return null as any;
      const isClientViewer = req.client_id === user.id;
      const targetUserId = isClientViewer ? proUserIdMap.get(req.professional_id) : req.client_id;
      const profile = targetUserId ? profileMap.get(targetUserId) : null;
      const proOwnerUserId = proUserIdMap.get(req.professional_id) ?? null;
      const otherPartyUserId = isClientViewer ? proOwnerUserId : req.client_id;
      const isSeguindoPro =
        favoriteProIds.has(String(req.professional_id)) ||
        (otherPartyUserId != null && followedUserIds.has(String(otherPartyUserId)));
      const sum = summaryByReq.get(req.id);
      const rawColor = statusData.label_color as string | null | undefined;
      const label_color: ThreadLabelColor | null =
        rawColor && allowedColors.has(rawColor) ? (rawColor as ThreadLabelColor) : null;
      const rawLabelText = statusData.label_text as string | null | undefined;
      const label_text =
        label_color && rawLabelText && String(rawLabelText).trim()
          ? String(rawLabelText).trim().slice(0, 15)
          : null;
      return {
        ...req,
        request_kind: (req as { request_kind?: string | null }).request_kind ?? "service",
        otherName: profile?.full_name || (isClientViewer ? "Profissional" : "Cliente"),
        otherAvatar: profile?.avatar_url || null,
        lastMessage: sum?.lastMessage ?? null,
        lastMessageTime: sum?.lastMessageTime || req.updated_at,
        unreadCount: sum?.unreadCount ?? 0,
        is_archived: statusData.is_archived,
        manual_unread: statusData.manual_unread,
        is_pinned: !!statusData.is_pinned,
        label_color: label_text ? label_color : null,
        label_text,
        isSeguindoPro,
      };
    }).filter((t) => t !== null) as Thread[];

    const finalThreads = sortThreadsByPinAndTime(enriched);
    _threadsCache = finalThreads;
    setThreads(finalThreads);
    if (!isBackgroundUpdate) setLoading(false);
  }, [page]);

  useRefreshAtKey("/messages", () => load(false));

  // ─────────────────────────────────────────────────────────────────────
  // Atualização incremental de thread a partir de uma mensagem nova
  // SEM fazer refetch completo — como o WhatsApp
  // ─────────────────────────────────────────────────────────────────────
  const applyNewMessage = useCallback((payload: any) => {
    const msg = payload?.new as {
      id?: string;
      request_id?: string;
      sender_id?: string;
      content?: string | null;
      created_at?: string;
      image_urls?: string[] | null;
    };
    if (!msg?.request_id || !msg.created_at) return;

    const uid = userIdRef.current;
    const preview =
      (msg.content && String(msg.content).trim()) ||
      (Array.isArray(msg.image_urls) && msg.image_urls.length > 0 ? "📷 Foto" : "Nova mensagem");

    setThreads((prev) => {
      const idx = prev.findIndex((t) => t.id === msg.request_id);
      if (idx === -1) {
        void load(true, { widenFetch: true });
        return prev;
      }

      const updated = { ...prev[idx] };
      updated.lastMessage = preview;
      updated.lastMessageTime = msg.created_at;
      updated.updated_at = msg.created_at;
      if (msg.sender_id && msg.sender_id !== uid) {
        updated.unreadCount = (updated.unreadCount || 0) + 1;
      }

      const next = [...prev];
      next.splice(idx, 1);
      const sorted = sortThreadsByPinAndTime([updated, ...next]);
      _threadsCache = sorted;
      return sorted;
    });
  }, [load]);

  useEffect(() => {
    void load();

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleFullReload = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => void load(true), 120);
    };

    let cancelled = false;
    let chMsg: ReturnType<typeof supabase.channel> | null = null;
    let chReq: ReturnType<typeof supabase.channel> | null = null;

    void (async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (cancelled) return;
      const token = sess.session?.access_token;
      if (token) await supabase.realtime.setAuth(token);
      if (cancelled) return;

      // Dois canais: menos bindings por join no hosted. Lista atualiza também via UPDATE service_requests (trigger na mensagem).
      const a = supabase
        .channel("messages-list-msg-v4", { config: { broadcast: { self: false } } })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, applyNewMessage)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_messages" }, scheduleFullReload)
        .subscribe((status, err) => {
          if (status === "SUBSCRIBED") return;
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn("[Messages] realtime (chat_messages):", status, err?.message ?? err);
          }
        });

      const b = supabase
        .channel("messages-list-req-v4", { config: { broadcast: { self: false } } })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "service_requests" }, scheduleFullReload)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "service_requests" }, scheduleFullReload)
        .subscribe((status, err) => {
          if (status === "SUBSCRIBED") return;
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn("[Messages] realtime (service_requests):", status, err?.message ?? err);
          }
        });

      if (cancelled) {
        supabase.removeChannel(a);
        supabase.removeChannel(b);
        return;
      }
      chMsg = a;
      chReq = b;
    })();

    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      if (chMsg) supabase.removeChannel(chMsg);
      if (chReq) supabase.removeChannel(chReq);
    };
  }, [load, applyNewMessage]);

  useEffect(() => {
    const uid = currentUserId;
    if (!uid) return;

    const ids = listSlices.subscriptionIds;

    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const unsubs: (() => void)[] = [];

    for (const id of ids) {
      const unsub = subscribeThreadActivity(id, (payload) => {
        const from = payload?.fromUserId;
        const kind = payload?.kind;
        if (!from || from === uid) return;
        if (kind === "idle") {
          const te = timers.get(id);
          if (te) clearTimeout(te);
          timers.delete(id);
          setPeerActivityByThread((p) => {
            const n = { ...p };
            delete n[id];
            return n;
          });
          return;
        }
        if (kind === "typing" || kind === "recording") {
          setPeerActivityByThread((p) => ({ ...p, [id]: kind }));
          const old = timers.get(id);
          if (old) clearTimeout(old);
          timers.set(
            id,
            setTimeout(() => {
              setPeerActivityByThread((p) => {
                const n = { ...p };
                delete n[id];
                return n;
              });
              timers.delete(id);
            }, 4500),
          );
        }
      });
      unsubs.push(unsub);
    }

    return () => {
      unsubs.forEach((u) => u());
      timers.forEach((t) => clearTimeout(t));
      setPeerActivityByThread({});
    };
  }, [currentUserId, listSlices.subscriptionIds]);

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

    const isCancelledOrRejected = (t: Thread) => t.status === "cancelled" || t.status === "rejected";
    const pool = threads.filter((t) => !isCancelledOrRejected(t));
    const tabThreads =
      chatTab === "seguindo" ? pool.filter((t) => t.isSeguindoPro) : pool.filter((t) => !t.isSeguindoPro);
    const targetIds = tabThreads.filter((t) => !t.is_archived).map((t) => t.id);

    if (targetIds.length === 0) return;

    const idSet = new Set(targetIds);
    setThreads((prev) => {
      const next = prev.map((t) => (idSet.has(t.id) ? { ...t, unreadCount: 0, manual_unread: false } : t));
      _threadsCache = next;
      return next;
    });

    const now = new Date().toISOString();
    await Promise.all(
      targetIds.map((request_id) =>
        supabase.from("chat_read_status" as any).upsert(
          { request_id, user_id: user.id, last_read_at: now, manual_unread: false },
          { onConflict: "request_id,user_id" },
        ),
      ),
    );
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

  const clearSearchAndBlur = useCallback(async () => {
    setSearchChat("");
    searchInputRef.current?.blur();
    if (Capacitor.isNativePlatform()) {
      try {
        await Keyboard.hide();
      } catch {
        /* ignore */
      }
    }
  }, []);

  const disarmLongPress = (id: string) => {
    const tid = longPressTimers.current.get(id);
    if (tid) {
      clearTimeout(tid);
      longPressTimers.current.delete(id);
    }
  };

  const armLongPress = (t: Thread) => {
    disarmLongPress(t.id);
    const timerId = window.setTimeout(() => {
      longPressTimers.current.delete(t.id);
      skipNextNavRef.current = true;
      setThreadMenuThread(t);
    }, 480);
    longPressTimers.current.set(t.id, timerId);
  };

  const pinnedCountExcluding = (excludeId: string) =>
    threads.filter((x) => x.is_pinned && x.id !== excludeId).length;

  const handleTogglePin = async (t: Thread, nextPinned: boolean) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (nextPinned && pinnedCountExcluding(t.id) >= MAX_PINNED_THREADS) {
      toast({
        title: "Limite de 3 conversas fixadas",
        description: "Desfixe uma conversa para fixar outra.",
        variant: "destructive",
      });
      return;
    }
    setThreads((prev) => {
      const mapped = prev.map((x) => (x.id === t.id ? { ...x, is_pinned: nextPinned } : x));
      const sorted = sortThreadsByPinAndTime(mapped);
      _threadsCache = sorted;
      return sorted;
    });
    setThreadMenuThread(null);
    const { error } = await supabase.from("chat_read_status" as any).upsert(
      { request_id: t.id, user_id: user.id, last_read_at: new Date().toISOString(), is_pinned: nextPinned },
      { onConflict: "request_id,user_id" },
    );
    if (error) {
      const msg = error.message || "";
      const isSchema = msg.includes("is_pinned") || msg.includes("schema cache");
      toast({
        title: "Não foi possível fixar",
        description: isSchema
          ? "O Supabase ainda não tem a coluna is_pinned em chat_read_status. Aplique a migração 20260328210000_chat_pin_label.sql (Dashboard → SQL ou supabase db push) e aguarde alguns segundos."
          : msg || "Tente novamente em instantes.",
        variant: "destructive",
      });
      void load(true);
    }
  };

  const handleSaveThreadLabel = async () => {
    if (!labelModal?.color) return;
    const trimmed = labelModal.text.trim().slice(0, 15);
    if (!trimmed) {
      toast({ title: "Digite o texto do rótulo", variant: "destructive" });
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const t = labelModal.thread;
    const color = labelModal.color;
    setThreads((prev) => {
      const mapped = prev.map((x) =>
        x.id === t.id ? { ...x, label_color: color, label_text: trimmed } : x,
      );
      const sorted = sortThreadsByPinAndTime(mapped);
      _threadsCache = sorted;
      return sorted;
    });
    setLabelModal(null);
    await supabase.from("chat_read_status" as any).upsert(
      {
        request_id: t.id,
        user_id: user.id,
        last_read_at: new Date().toISOString(),
        label_color: color,
        label_text: trimmed,
      },
      { onConflict: "request_id,user_id" },
    );
  };

  const handleRemoveThreadLabel = async (t: Thread) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setThreads((prev) => {
      const mapped = prev.map((x) =>
        x.id === t.id ? { ...x, label_color: null, label_text: null } : x,
      );
      const sorted = sortThreadsByPinAndTime(mapped);
      _threadsCache = sorted;
      return sorted;
    });
    setLabelModal(null);
    setThreadMenuThread(null);
    await supabase.from("chat_read_status" as any).upsert(
      {
        request_id: t.id,
        user_id: user.id,
        last_read_at: new Date().toISOString(),
        label_color: null,
        label_text: null,
      },
      { onConflict: "request_id,user_id" },
    );
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
    if (msg === "📷 Foto" || msg.startsWith("📷 ")) return <span className="flex items-center gap-1 text-muted-foreground">📷 Foto</span>;
    if (msg.includes("[PRODUCT:")) return <span className="flex items-center gap-1 text-emerald-600 font-medium"><Package className="w-3 h-3" /> Produto</span>;
    if (msg.startsWith("[COMMUNITY_POST:")) return <span className="flex items-center gap-1 text-violet-600 dark:text-violet-300 font-medium"><Sparkles className="w-3 h-3" /> Publicação</span>;
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

  const {
    threadsCancelados,
    activeThreads,
    archivedThreads,
    currentList,
    canceladosListToShow,
    threadsSeguindoTab,
  } = listSlices;

  const toggleCanceladoSelection = (id: string) => {
    setSelectedCanceladosIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ── Thread item component ──────────────────────────────────────────
  const ThreadItem = ({ t, isCancelled = false, directStyle = false }: { t: Thread; isCancelled?: boolean; directStyle?: boolean }) => {
    const initials = t.otherName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    const hasUnread = t.unreadCount > 0 || t.manual_unread;
    const isChatFinished = t.status === "completed" || t.status === "closed" || t.status === "cancelled" || t.status === "rejected";
    const isSelected = selectedCanceladosIds.has(t.id);
    const peerAct = peerActivityByThread[t.id];

    return (
      <div
        className={`flex items-center gap-3 transition-colors select-none ${
          directStyle
            ? `mx-3 mb-2 rounded-2xl border border-border/50 bg-gradient-to-b from-background via-background to-rose-500/[0.06] dark:to-amber-500/[0.08] shadow-sm px-3 py-3 active:bg-muted/40 ${
                hasUnread ? "ring-1 ring-rose-400/30" : ""
              }`
            : `px-4 py-3 border-b border-border/60 active:bg-muted/50 ${hasUnread ? "bg-primary/[0.04]" : ""}`
        } ${!directStyle && t.isSeguindoPro ? "bg-amber-500/[0.07] border-l-[3px] border-l-amber-400 pl-[13px]" : ""}`}
      >
        {isCancelled && canceladosSelectMode && (
          <button type="button" onClick={() => toggleCanceladoSelection(t.id)} className="flex-shrink-0">
            {isSelected ? <CheckSquare className="w-5 h-5 text-primary" /> : <Square className="w-5 h-5 text-muted-foreground" />}
          </button>
        )}

        <div
          onTouchStart={() => armLongPress(t)}
          onTouchEnd={() => disarmLongPress(t.id)}
          onTouchCancel={() => disarmLongPress(t.id)}
          onTouchMove={() => disarmLongPress(t.id)}
          onClick={() => {
            if (skipNextNavRef.current) {
              skipNextNavRef.current = false;
              return;
            }
            if (isCancelled && canceladosSelectMode) { toggleCanceladoSelection(t.id); return; }
            if (hasUnread) handleMarkRead(t.id);
            navigate(`/messages/${t.id}`);
          }}
          className="flex flex-1 items-center gap-3 cursor-pointer min-w-0"
        >
          <div className="relative flex-shrink-0">
            {t.otherAvatar ? (
              <img
                src={getOptimizedAvatar(t.otherAvatar)}
                alt={t.otherName}
                loading="lazy"
                className="w-[52px] h-[52px] rounded-full object-cover"
              />
            ) : (
              <div
                className={`w-[52px] h-[52px] rounded-full flex items-center justify-center text-sm font-bold ${
                  isCancelled ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary"
                }`}
              >
                {initials}
              </div>
            )}
            {t.isSeguindoPro && (
              <span
                className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-amber-400 text-white flex items-center justify-center shadow border border-white"
                title="Seguindo"
              >
                <UserCheck className="w-3 h-3 stroke-[2.5]" />
              </span>
            )}
          </div>

          {/* Texto */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-0.5 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                {t.is_pinned ? <Pin className="w-3.5 h-3.5 text-primary shrink-0" aria-hidden /> : null}
                <p
                  className={`text-[15px] truncate ${hasUnread ? "font-bold text-foreground" : "font-medium text-foreground"} ${
                    t.isSeguindoPro ? "text-amber-900 dark:text-amber-100" : ""
                  }`}
                >
                  {t.otherName}
                </p>
                {t.label_text && t.label_color ? (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 max-w-[100px] truncate ${labelColorPillClass(t.label_color)}`}>
                    {t.label_text}
                  </span>
                ) : null}
              </div>
              <span className={`text-[11px] flex-shrink-0 ${hasUnread ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                {timeLabel(t.lastMessageTime)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className={`text-[13px] truncate flex items-center gap-1 flex-1 min-w-0 ${hasUnread ? "text-foreground/80" : "text-muted-foreground"}`}>
                {isCancelled
                  ? <span>{t.status === "rejected" ? "Recusado" : "Cancelado"}</span>
                  : peerAct === "typing"
                    ? <span className="text-primary italic font-medium">digitando…</span>
                    : peerAct === "recording"
                      ? <span className="text-amber-600 dark:text-amber-400 font-medium inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />gravando áudio…</span>
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
              <DropdownMenuItem onSelect={() => handleMarkRead(t.id)} className="gap-2 cursor-pointer py-2.5">
                <Eye className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">Marcar como lida</span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleMarkUnread(t.id)} className="gap-2 cursor-pointer py-2.5">
                <EyeOff className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">Marcar como não lida</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void handleTogglePin(t, !t.is_pinned)} className="gap-2 cursor-pointer py-2.5">
                <Pin className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">{t.is_pinned ? "Desfixar" : "Fixar no topo"}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  setLabelModal({
                    thread: t,
                    step: "colors",
                    color: null,
                    text: (t.label_text || "").slice(0, 15),
                  })
                }
                className="gap-2 cursor-pointer py-2.5"
              >
                <Tag className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">Rótulo</span>
              </DropdownMenuItem>
              {isChatFinished && (
                <DropdownMenuItem onSelect={() => handleArchive(t.id, t.is_archived)} className="gap-2 cursor-pointer py-2.5">
                  <Archive className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">{t.is_archived ? "Desarquivar" : "Arquivar"}</span>
                </DropdownMenuItem>
              )}
              {showArchived && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setDeletingChatId(t.id)} className="gap-2 cursor-pointer py-2.5 text-destructive focus:text-destructive focus:bg-destructive/10">
                    <Trash2 className="w-4 h-4" />
                    <span className="text-sm">Excluir conversa</span>
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setReportingChatId(t.id)} className="gap-2 cursor-pointer py-2.5 text-amber-600 focus:text-amber-600 focus:bg-amber-50">
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
      <main className="max-w-screen-lg mx-auto pb-24">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border/60 gap-2">
          <h1 className="text-xl font-bold tracking-tight text-foreground shrink-0">Conversas</h1>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {!showCancelados && !showArchived && (chatTab === "geral" || chatTab === "seguindo") && activeThreads.some((t) => t.unreadCount > 0 || t.manual_unread) && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs font-semibold text-primary flex items-center gap-1 bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-full transition-all"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Ler tudo
              </button>
            )}
            {threadsCancelados.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setShowCancelados((v) => !v);
                  if (!showCancelados) setShowArchived(false);
                }}
                className={`text-xs font-semibold flex items-center gap-1 px-3 py-1.5 rounded-full transition-all ${
                  showCancelados
                    ? "bg-destructive/15 text-destructive border border-destructive/25"
                    : "text-muted-foreground bg-muted/50 hover:bg-muted/70 border border-transparent"
                }`}
              >
                {showCancelados ? <Inbox className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                Cancelados
                {!showCancelados && (
                  <span className="min-w-[18px] h-[18px] rounded-full bg-muted-foreground/20 text-muted-foreground text-[9px] font-bold flex items-center justify-center px-1">
                    {threadsCancelados.length}
                  </span>
                )}
              </button>
            )}
            {!showCancelados && archivedThreads.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setShowArchived(!showArchived);
                  if (!showArchived) setShowCancelados(false);
                }}
                className="text-xs font-semibold text-primary flex items-center gap-1 bg-primary/5 hover:bg-primary/10 px-3 py-1.5 rounded-full transition-all border border-primary/10"
              >
                {showArchived ? <Inbox className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                {showArchived ? "Entrada" : `Arquivados (${archivedThreads.length})`}
              </button>
            )}
          </div>
        </div>

        {/* ── Tabs ── */}
        <Tabs
          value={chatTab}
          onValueChange={(v) => {
            setChatTab(v as "geral" | "seguindo");
            setShowCancelados(false);
          }}
          className="px-4 pt-3"
        >
          <TabsList
            className={`w-full grid grid-cols-2 rounded-xl p-1 gap-1 min-h-11 items-stretch ${showCancelados ? "opacity-40 pointer-events-none" : "bg-muted/50"}`}
          >
            <TabsTrigger value="geral" className="rounded-lg text-sm font-semibold data-[state=active]:shadow-sm py-2">
              Geral
            </TabsTrigger>
            <TabsTrigger
              value="seguindo"
              className="group rounded-lg text-xs font-bold data-[state=active]:shadow-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-rose-600 data-[state=active]:to-amber-600 data-[state=active]:text-white flex flex-col gap-0.5 h-auto py-2 px-1 leading-tight"
            >
              <span className="flex items-center justify-center gap-1 w-full">
                <UserCheck className="w-3.5 h-3.5 shrink-0 text-rose-600 group-data-[state=active]:text-white" />
                <span className="tracking-wide">SEGUINDO</span>
                {seguindoPendingTotal > 0 ? (
                  <span className="min-w-[22px] h-[22px] rounded-full bg-rose-500 text-white text-[11px] font-black flex items-center justify-center px-1 shadow-sm group-data-[state=active]:bg-white group-data-[state=active]:text-rose-600">
                    {seguindoPendingTotal > 99 ? "99+" : seguindoPendingTotal}
                  </span>
                ) : null}
              </span>
              {seguindoPendingTotal > 0 ? (
                <span className="text-[9px] font-semibold text-muted-foreground group-data-[state=active]:text-white/90">
                  {seguindoPendingTotal}{" "}
                  {seguindoPendingTotal === 1 ? "mensagem nova" : "mensagens novas"}
                </span>
              ) : threadsSeguindoTab.length > 0 ? (
                <span className="text-[9px] font-medium text-muted-foreground group-data-[state=active]:text-white/85">
                  {threadsSeguindoTab.length}{" "}
                  {threadsSeguindoTab.length === 1 ? "conversa" : "conversas"}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>

          {/* ── Search ── */}
          {((!showCancelados &&
            ((chatTab === "geral" && (activeThreads.length > 0 || archivedThreads.length > 0 || hasSupportMessages)) ||
              (chatTab === "seguindo" && (activeThreads.length > 0 || archivedThreads.length > 0)))) ||
            (showCancelados && threadsCancelados.length > 0)) && (
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                value={searchChat}
                onChange={(e) => setSearchChat(e.target.value)}
                placeholder="Buscar conversa..."
                className={`w-full pl-9 py-2.5 rounded-xl border bg-muted/40 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:bg-background transition-colors ${searchChat ? "pr-10" : "pr-3"}`}
              />
              {searchChat.length > 0 && (
                <button
                  type="button"
                  aria-label="Limpar busca"
                  onClick={() => void clearSearchAndBlur()}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {/* ── TAB: Geral ── */}
          {!showCancelados ? (
            <>
          <TabsContent value="geral" className="mt-3 -mx-4">
            {!showArchived && hasSupportMessages && (
              <Link
                to="/support"
                className={`flex items-center gap-3 px-4 py-3 border-b border-border/60 active:bg-muted/60 transition-colors ${supportUnread > 0 ? "bg-amber-500/[0.05]" : ""}`}
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

          <TabsContent value="seguindo" className="mt-3 -mx-4 px-1">
            <div className="px-3 pb-2 flex items-start gap-2 text-[11px] text-muted-foreground leading-snug">
              <UserCheck className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
              <span>
                Chamadas e chats com profissionais que você <strong className="text-foreground/90">segue</strong> ou marcou como{" "}
                <strong className="text-foreground/90">favoritos</strong> no perfil deles.
              </span>
            </div>
            {searchChat.trim() && currentList.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm px-4">
                Nenhuma conversa encontrada para &quot;{searchChat}&quot;
              </div>
            ) : currentList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-rose-500/20 to-amber-500/15 flex items-center justify-center mb-4 shadow-inner border border-rose-500/10">
                  <UserCheck className="w-9 h-9 text-rose-500" />
                </div>
                <p className="font-semibold text-foreground text-base mb-1">Nenhuma conversa em Seguindo</p>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Segue um profissional no perfil ou use <strong className="text-foreground">Favoritar</strong>; depois abra CHAMAR ou Mensagem — a conversa aparece aqui.
                </p>
              </div>
            ) : (
              currentList.map((t) => <ThreadItem key={t.id} t={t} directStyle />)
            )}
            {hasMore && !showArchived && (
              <div className="flex justify-center py-4 px-4">
                <Button variant="outline" onClick={() => setPage(p => p + 1)} className="rounded-full text-xs px-6 border-rose-500/25 hover:bg-rose-500/5">
                  Carregar mais
                </Button>
              </div>
            )}
          </TabsContent>
            </>
          ) : (
            <div className="mt-3 -mx-4">
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
            </div>
          )}
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

        <Dialog open={threadMenuThread !== null} onOpenChange={(open) => !open && setThreadMenuThread(null)}>
          <DialogContent className="sm:max-w-sm rounded-2xl">
            <DialogHeader>
              <DialogTitle className="truncate pr-6">{threadMenuThread?.otherName}</DialogTitle>
              <DialogDescription>Toque longo nesta conversa — fixar, desfixar ou definir rótulo.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                className="rounded-xl justify-start gap-2 h-11"
                onClick={() => threadMenuThread && void handleTogglePin(threadMenuThread, !threadMenuThread.is_pinned)}
              >
                <Pin className="w-4 h-4" />
                {threadMenuThread?.is_pinned ? "Desfixar" : "Fixar no topo"}
              </Button>
              <Button
                variant="outline"
                className="rounded-xl justify-start gap-2 h-11"
                onClick={() => {
                  if (!threadMenuThread) return;
                  const tt = threadMenuThread;
                  setThreadMenuThread(null);
                  setLabelModal({
                    thread: tt,
                    step: "colors",
                    color: null,
                    text: (tt.label_text || "").slice(0, 15),
                  });
                }}
              >
                <Tag className="w-4 h-4" />
                Rótulo
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={labelModal !== null} onOpenChange={(open) => !open && setLabelModal(null)}>
          <DialogContent className="sm:max-w-md rounded-2xl">
            {labelModal?.step === "colors" && (
              <>
                <DialogHeader>
                  <DialogTitle>Cor do rótulo</DialogTitle>
                  <DialogDescription>Escolha uma cor para o rótulo desta conversa.</DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-3 py-2">
                  {(["blue", "green", "orange", "red"] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`rounded-2xl py-4 text-sm font-bold shadow-sm active:scale-[0.98] transition-all ${labelColorSwatchClass(c)}`}
                      onClick={() => setLabelModal((m) => (m ? { ...m, step: "text", color: c } : null))}
                    >
                      {c === "blue" ? "Azul" : c === "green" ? "Verde" : c === "orange" ? "Laranja" : "Vermelho"}
                    </button>
                  ))}
                </div>
                {labelModal.thread.label_text && labelModal.thread.label_color ? (
                  <Button
                    variant="outline"
                    className="w-full rounded-xl text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => void handleRemoveThreadLabel(labelModal.thread)}
                  >
                    Remover rótulo
                  </Button>
                ) : null}
              </>
            )}
            {labelModal?.step === "text" && labelModal.color ? (
              <>
                <DialogHeader>
                  <DialogTitle>Texto do rótulo</DialogTitle>
                  <DialogDescription>Até 15 caracteres.</DialogDescription>
                </DialogHeader>
                <input
                  type="text"
                  maxLength={15}
                  value={labelModal.text}
                  onChange={(e) =>
                    setLabelModal((m) => (m ? { ...m, text: e.target.value.slice(0, 15) } : null))
                  }
                  className="w-full px-3 py-2.5 rounded-xl border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="Ex.: VIP, Retorno…"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">{labelModal.text.trim().length}/15</p>
                <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between">
                  <Button variant="outline" className="rounded-xl w-full sm:w-auto" onClick={() => setLabelModal((m) => (m ? { ...m, step: "colors" } : null))}>
                    Voltar
                  </Button>
                  <Button className="rounded-xl w-full sm:w-auto" onClick={() => void handleSaveThreadLabel()}>
                    Salvar
                  </Button>
                </DialogFooter>
              </>
            ) : null}
          </DialogContent>
        </Dialog>
      </main>
    </AppLayout>
  );
};

export default Messages;
