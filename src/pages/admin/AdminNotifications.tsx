import AdminLayout from "@/components/AdminLayout";
import {
  Bell,
  Send,
  Users,
  Briefcase,
  Building2,
  User,
  CheckCheck,
  Search,
  Eye,
  EyeOff,
  Trash2,
  Wifi,
  Clock,
  UserCheck,
  CheckSquare,
  Square,
  X,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { toast } from "@/hooks/use-toast";
import { NOTIFICATION_MENU_DESTINATIONS } from "@/lib/appNotificationDestinations";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type TargetType =
  | "all"
  | "clients"
  | "professionals"
  | "companies"
  | "pending_pros"
  | "category"
  | "individual"
  | "selected";

type PickableUser = {
  user_id: string;
  full_name: string;
  email: string;
  user_type: string | null;
};

interface AdminNotif {
  id: string;
  title: string;
  message: string | null;
  type: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

/** Notificação de qualquer usuário (visualização do admin com auditoria). */
interface UserNotif {
  id: string;
  title: string;
  message: string | null;
  type: string;
  link: string | null;
  read: boolean;
  created_at: string;
  read_at: string | null;
  deleted_at: string | null;
}

const formatDateTimeBR = (iso: string | null): string => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/** Sempre incluir no broadcast “Todos os usuários” (conta de painel). */
const ADMIN_PANEL_EMAIL = "admin@appchamo.com";

const AdminNotifications = () => {
  const { adminUser } = useAdminAuth();
  const [myNotifications, setMyNotifications] = useState<AdminNotif[]>([]);
  const [loadingMine, setLoadingMine] = useState(true);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState<TargetType>("all");
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [sending, setSending] = useState(false);
  const [destinationPath, setDestinationPath] = useState("");
  const [sentCount, setSentCount] = useState<number | null>(null);
  const [markingAllRead, setMarkingAllRead] = useState(false);

  // Individual user search
  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState<{ user_id: string; full_name: string; email: string }[]>([]);
  const [selectedUser, setSelectedUser] = useState<{ user_id: string; full_name: string } | null>(null);
  const [searching, setSearching] = useState(false);

  // Multi-select users (modal)
  const [selectOpen, setSelectOpen] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<PickableUser[]>([]);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerTypeFilter, setPickerTypeFilter] = useState<"all" | "client" | "professional" | "company" | "pending_pros">("all");
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerResults, setPickerResults] = useState<PickableUser[]>([]);
  const [pickerPendingIds, setPickerPendingIds] = useState<Set<string>>(new Set());

  // Painel "Notificações por usuário" (auditoria + Realtime)
  const [auditSearch, setAuditSearch] = useState("");
  const [auditResults, setAuditResults] =
    useState<{ user_id: string; full_name: string; email: string }[]>([]);
  const [auditSearching, setAuditSearching] = useState(false);
  const [auditUser, setAuditUser] =
    useState<{ user_id: string; full_name: string; email: string } | null>(null);
  const [auditNotifs, setAuditNotifs] = useState<UserNotif[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditLive, setAuditLive] = useState(false);
  const auditSearchTimer = useRef<number | null>(null);

  useEffect(() => {
    supabase.from("categories").select("id, name").eq("active", true).order("name").then(({ data }) => {
      setCategories(data || []);
    });
  }, []);

  useEffect(() => {
    if (!adminUser?.id) return;
    setLoadingMine(true);
    supabase
      .from("notifications")
      .select("id, title, message, type, link, read, created_at")
      .eq("user_id", adminUser.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setMyNotifications((data as AdminNotif[]) || []);
      })
      .finally(() => setLoadingMine(false));
  }, [adminUser?.id]);

  const markAsRead = async (id: string) => {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    setMyNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const unreadMineCount = myNotifications.filter((n) => !n.read).length;

  const markAllMineAsRead = async () => {
    if (!adminUser?.id || unreadMineCount === 0) return;
    setMarkingAllRead(true);
    try {
      const { error } = await supabase
        .from("notifications")
        .update({ read: true })
        .eq("user_id", adminUser.id)
        .eq("read", false);
      if (error) throw error;
      setMyNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      toast({ title: "Todas as notificações foram marcadas como lidas." });
    } catch (e: unknown) {
      toast({
        title: "Não foi possível marcar todas como lidas",
        description: e instanceof Error ? e.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setMarkingAllRead(false);
    }
  };

  const searchUsers = async (query: string) => {
    setUserSearch(query);
    if (query.length < 2) { setUserResults([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from("profiles")
      .select("user_id, full_name, email")
      .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
      .limit(10);
    setUserResults(data || []);
    setSearching(false);
  };

  /** Carrega IDs de profissionais com `profile_status = 'pending'` (em análise). */
  const fetchPendingProUserIds = useCallback(async (): Promise<Set<string>> => {
    const { data, error } = await supabase
      .from("professionals")
      .select("user_id")
      .eq("profile_status", "pending");
    if (error) {
      toast({ title: "Erro ao listar profissionais em análise", description: error.message, variant: "destructive" });
      return new Set();
    }
    return new Set((data || []).map((r) => r.user_id).filter(Boolean) as string[]);
  }, []);

  // ── Modal "Selecionar usuários" ───────────────────────────────────────────
  const pickerSelectedIds = useMemo(() => new Set(selectedUsers.map((u) => u.user_id)), [selectedUsers]);

  const runPickerQuery = useCallback(
    async (query: string, typeFilter: typeof pickerTypeFilter) => {
      setPickerLoading(true);
      try {
        let pendingIds: Set<string> = pickerPendingIds;
        if (typeFilter === "pending_pros" && pendingIds.size === 0) {
          pendingIds = await fetchPendingProUserIds();
          setPickerPendingIds(pendingIds);
        }

        let q = supabase
          .from("profiles")
          .select("user_id, full_name, email, user_type")
          .order("full_name", { ascending: true, nullsFirst: false })
          .limit(50);

        const trimmed = query.trim();
        if (trimmed.length >= 2) {
          q = q.or(`full_name.ilike.%${trimmed}%,email.ilike.%${trimmed}%`);
        }
        if (typeFilter === "client" || typeFilter === "professional" || typeFilter === "company") {
          q = q.eq("user_type", typeFilter);
        }
        if (typeFilter === "pending_pros") {
          const ids = Array.from(pendingIds);
          if (ids.length === 0) {
            setPickerResults([]);
            setPickerLoading(false);
            return;
          }
          q = q.in("user_id", ids);
        }

        const { data, error } = await q;
        if (error) throw error;
        setPickerResults((data || []) as PickableUser[]);
      } catch (e: any) {
        toast({ title: "Erro na busca", description: e?.message, variant: "destructive" });
        setPickerResults([]);
      }
      setPickerLoading(false);
    },
    [fetchPendingProUserIds, pickerPendingIds],
  );

  // Busca debounced quando o modal está aberto
  useEffect(() => {
    if (!selectOpen) return;
    const id = window.setTimeout(() => {
      void runPickerQuery(pickerSearch, pickerTypeFilter);
    }, 300);
    return () => window.clearTimeout(id);
  }, [selectOpen, pickerSearch, pickerTypeFilter, runPickerQuery]);

  const togglePickerUser = (user: PickableUser) => {
    setSelectedUsers((prev) => {
      const exists = prev.some((u) => u.user_id === user.user_id);
      if (exists) return prev.filter((u) => u.user_id !== user.user_id);
      return [...prev, user];
    });
  };

  const selectAllCurrentResults = () => {
    setSelectedUsers((prev) => {
      const map = new Map(prev.map((u) => [u.user_id, u]));
      for (const u of pickerResults) {
        if (!map.has(u.user_id)) map.set(u.user_id, u);
      }
      return [...map.values()];
    });
  };

  const clearAllSelected = () => setSelectedUsers([]);

  // ── Painel "Notificações por usuário" ──────────────────────────────────────
  // Busca debounced (350ms) por nome/email
  const handleAuditSearch = (value: string) => {
    setAuditSearch(value);
    if (auditSearchTimer.current) window.clearTimeout(auditSearchTimer.current);
    if (value.trim().length < 2) {
      setAuditResults([]);
      setAuditSearching(false);
      return;
    }
    setAuditSearching(true);
    auditSearchTimer.current = window.setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .or(`full_name.ilike.%${value}%,email.ilike.%${value}%`)
        .limit(10);
      setAuditResults(data || []);
      setAuditSearching(false);
    }, 350);
  };

  const loadAuditNotifs = useCallback(async (uid: string) => {
    setAuditLoading(true);
    const { data, error } = await supabase
      .from("notifications")
      .select("id, title, message, type, link, read, created_at, read_at, deleted_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      toast({
        title: "Erro ao carregar notificações",
        description: error.message,
        variant: "destructive",
      });
    }
    setAuditNotifs((data as UserNotif[]) || []);
    setAuditLoading(false);
  }, []);

  // Carrega ao selecionar e mantém Realtime aberto enquanto user_id estiver setado
  useEffect(() => {
    if (!auditUser?.user_id) {
      setAuditNotifs([]);
      setAuditLive(false);
      return;
    }
    void loadAuditNotifs(auditUser.user_id);

    const channel = supabase
      .channel(`admin-audit-notifs-${auditUser.user_id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${auditUser.user_id}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as UserNotif;
            setAuditNotifs((prev) => [row, ...prev.filter((n) => n.id !== row.id)]);
          } else if (payload.eventType === "UPDATE") {
            const row = payload.new as UserNotif;
            setAuditNotifs((prev) => prev.map((n) => (n.id === row.id ? row : n)));
          } else if (payload.eventType === "DELETE") {
            const row = payload.old as { id?: string };
            if (row.id) setAuditNotifs((prev) => prev.filter((n) => n.id !== row.id));
          }
        },
      )
      .subscribe((status) => {
        setAuditLive(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
      setAuditLive(false);
    };
  }, [auditUser?.user_id, loadAuditNotifs]);

  const auditCounts = {
    total: auditNotifs.length,
    unread: auditNotifs.filter((n) => !n.read && !n.deleted_at).length,
    read: auditNotifs.filter((n) => n.read && !n.deleted_at).length,
    deleted: auditNotifs.filter((n) => !!n.deleted_at).length,
  };

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) {
      toast({ title: "Preencha título e mensagem", variant: "destructive" });
      return;
    }
    if (target === "category" && !categoryId) {
      toast({ title: "Selecione uma categoria", variant: "destructive" });
      return;
    }
    if (target === "individual" && !selectedUser) {
      toast({ title: "Selecione um usuário", variant: "destructive" });
      return;
    }
    if (target === "selected" && selectedUsers.length === 0) {
      toast({ title: "Selecione pelo menos um usuário", variant: "destructive" });
      return;
    }

    setSending(true);
    setSentCount(null);

    try {
      let userIds: string[] = [];

      if (target === "individual" && selectedUser) {
        userIds = [selectedUser.user_id];
      } else if (target === "selected") {
        userIds = selectedUsers.map((u) => u.user_id);
      } else if (target === "pending_pros") {
        const ids = await fetchPendingProUserIds();
        userIds = [...ids];
      } else if (target === "all") {
        const { data } = await supabase.from("profiles").select("user_id");
        const ids = new Set((data || []).map((p) => p.user_id).filter(Boolean) as string[]);
        const { data: adminProf } = await supabase
          .from("profiles")
          .select("user_id")
          .ilike("email", ADMIN_PANEL_EMAIL)
          .maybeSingle();
        const adminUid = (adminProf as { user_id?: string } | null)?.user_id;
        if (adminUid) ids.add(adminUid);
        // Conta principal do painel: garante envio mesmo se o perfil não estiver na lista (ex.: corrida RLS) ou sem linha em profiles.
        if (adminUser?.id && adminUser.email?.toLowerCase().trim() === ADMIN_PANEL_EMAIL) {
          ids.add(adminUser.id);
        }
        userIds = [...ids];
      } else if (target === "clients") {
        const { data } = await supabase.from("profiles").select("user_id").eq("user_type", "client");
        userIds = (data || []).map(p => p.user_id);
      } else if (target === "professionals") {
        const { data } = await supabase.from("profiles").select("user_id").eq("user_type", "professional");
        userIds = (data || []).map(p => p.user_id);
      } else if (target === "companies") {
        const { data } = await supabase.from("profiles").select("user_id").eq("user_type", "company");
        userIds = (data || []).map(p => p.user_id);
      } else if (target === "category") {
        const { data: pros } = await supabase.from("professionals").select("user_id").eq("category_id", categoryId);
        userIds = (pros || []).map(p => p.user_id);
      }

      if (userIds.length === 0) {
        toast({ title: "Nenhum usuário encontrado para o filtro selecionado", variant: "destructive" });
        setSending(false);
        return;
      }

      const batchSize = 100;
      for (let i = 0; i < userIds.length; i += batchSize) {
        const link = destinationPath.trim() || null;
        const batch = userIds.slice(i, i + batchSize).map((uid) => ({
          user_id: uid,
          title: title.trim(),
          message: message.trim(),
          type: "info",
          ...(link ? { link } : {}),
        }));
        await supabase.from("notifications").insert(batch);
      }

      setSentCount(userIds.length);
      toast({ title: `Notificação enviada para ${userIds.length} usuário(s)!` });
      setTitle("");
      setMessage("");
      setDestinationPath("");
      setSelectedUser(null);
      setUserSearch("");
      setSelectedUsers([]);
    } catch (e: any) {
      toast({ title: "Erro ao enviar", description: e.message, variant: "destructive" });
    }
    setSending(false);
  };

  const targets: { value: TargetType; label: string; icon: any; desc: string }[] = [
    { value: "all", label: "Todos", icon: Users, desc: "Todos os usuários" },
    { value: "individual", label: "Individual", icon: User, desc: "Um usuário específico" },
    { value: "clients", label: "Clientes", icon: Users, desc: "Apenas clientes" },
    { value: "professionals", label: "Profissionais", icon: Briefcase, desc: "Apenas profissionais" },
    { value: "companies", label: "Empresas", icon: Building2, desc: "Apenas empresas" },
    { value: "pending_pros", label: "Em análise", icon: Clock, desc: "Profissionais aguardando aprovação" },
    { value: "category", label: "Categoria", icon: Briefcase, desc: "Por categoria" },
    { value: "selected", label: "Selecionar", icon: UserCheck, desc: "Escolher múltiplos usuários" },
  ];

  return (
    <AdminLayout title="Notificações">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <div className="space-y-5 min-w-0">
        <div className="bg-card border rounded-xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" /> Suas notificações
            </h2>
            {!loadingMine && myNotifications.length > 0 && unreadMineCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllMineAsRead()}
                disabled={markingAllRead}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
              >
                {markingAllRead ? (
                  <span className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                ) : (
                  <CheckCheck className="w-3.5 h-3.5 text-primary" />
                )}
                Marcar todas como lidas
              </button>
            )}
          </div>
          {loadingMine ? (
            <p className="text-xs text-muted-foreground">Carregando...</p>
          ) : myNotifications.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma notificação.</p>
          ) : (
            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {myNotifications.map((n) => (
                <li key={n.id}>
                  {n.link ? (
                    <Link
                      to={n.link}
                      onClick={() => markAsRead(n.id)}
                      className={`block rounded-xl border p-3 transition-colors hover:bg-muted/50 ${!n.read ? "bg-primary/5 border-primary/20" : "border-border"}`}
                    >
                      <p className="text-xs font-semibold text-foreground">{n.title}</p>
                      {n.message && <p className="text-[11px] text-muted-foreground mt-0.5">{n.message}</p>}
                      <p className="text-[10px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString("pt-BR")}</p>
                    </Link>
                  ) : (
                    <div
                      className={`rounded-xl border p-3 ${!n.read ? "bg-primary/5 border-primary/20" : "border-border"}`}
                      onClick={() => markAsRead(n.id)}
                    >
                      <p className="text-xs font-semibold text-foreground">{n.title}</p>
                      {n.message && <p className="text-[11px] text-muted-foreground mt-0.5">{n.message}</p>}
                      <p className="text-[10px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString("pt-BR")}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-card border rounded-xl p-5">
          <h2 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
            <Send className="w-4 h-4 text-primary" /> Enviar notificação manual
          </h2>

          <div className="space-y-4">
            {/* Target selection */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">Enviar para:</label>
              <div className="grid grid-cols-2 gap-2">
                {targets.map(t => (
                  <button
                    key={t.value}
                    onClick={() => {
                      setTarget(t.value);
                      setSelectedUser(null);
                      setUserSearch("");
                      if (t.value === "selected") {
                        setSelectOpen(true);
                      }
                    }}
                    className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-colors text-left ${
                      target === t.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                    }`}
                  >
                    <t.icon className="w-4 h-4 text-primary flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground">{t.label}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{t.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Category selector */}
            {target === "category" && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Categoria:</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">Selecione...</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Em análise (pending_pros) */}
            {target === "pending_pros" && (
              <div className="flex items-start gap-2 border rounded-xl p-3 bg-amber-500/5 border-amber-500/30">
                <Clock className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  A notificação será enviada para <strong>todos os profissionais com cadastro em análise</strong>
                  (<code className="text-[10px]">professionals.profile_status = pending</code>). O número real é calculado no momento do envio.
                </p>
              </div>
            )}

            {/* Usuários selecionados (multi) */}
            {target === "selected" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-foreground">
                    {selectedUsers.length === 0
                      ? "Nenhum usuário selecionado"
                      : `${selectedUsers.length} usuário${selectedUsers.length === 1 ? "" : "s"} selecionado${selectedUsers.length === 1 ? "" : "s"}`}
                  </p>
                  <button
                    type="button"
                    onClick={() => setSelectOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/10 transition-colors"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    {selectedUsers.length === 0 ? "Selecionar usuários" : "Editar seleção"}
                  </button>
                </div>

                {selectedUsers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 rounded-xl border bg-muted/30 p-2 max-h-32 overflow-y-auto">
                    {selectedUsers.map((u) => (
                      <span
                        key={u.user_id}
                        className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-medium text-primary pl-2 pr-1 py-0.5"
                      >
                        <span className="max-w-[14ch] truncate">{u.full_name || u.email}</span>
                        <button
                          type="button"
                          onClick={() => togglePickerUser(u)}
                          className="rounded-full hover:bg-primary/20 p-0.5"
                          aria-label={`Remover ${u.full_name}`}
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Individual user search */}
            {target === "individual" && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Buscar usuário:</label>
                {selectedUser ? (
                  <div className="flex items-center gap-2 border rounded-xl px-3 py-2.5 bg-primary/5 border-primary/30">
                    <User className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium text-foreground flex-1">{selectedUser.full_name}</span>
                    <button onClick={() => { setSelectedUser(null); setUserSearch(""); }} className="text-xs text-destructive hover:underline">Remover</button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      value={userSearch}
                      onChange={(e) => searchUsers(e.target.value)}
                      placeholder="Nome ou email do usuário..."
                      className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    {userResults.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-card border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                        {userResults.map(u => (
                          <button
                            key={u.user_id}
                            onClick={() => { setSelectedUser({ user_id: u.user_id, full_name: u.full_name }); setUserResults([]); }}
                            className="w-full text-left px-3 py-2 hover:bg-muted transition-colors border-b last:border-0"
                          >
                            <p className="text-sm font-medium text-foreground">{u.full_name}</p>
                            <p className="text-[10px] text-muted-foreground">{u.email}</p>
                          </button>
                        ))}
                      </div>
                    )}
                    {searching && <p className="text-[10px] text-muted-foreground mt-1">Buscando...</p>}
                  </div>
                )}
              </div>
            )}

            {/* Title */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Título *</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Feliz Natal!"
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Message */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Mensagem *</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Escreva a mensagem da notificação..."
                rows={3}
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Página de destino</label>
              <p className="text-[10px] text-muted-foreground mb-1.5">
                Ao tocar na notificação no app, o utilizador é enviado para esta página (mesmas rotas do menu lateral).
              </p>
              <select
                value={destinationPath}
                onChange={(e) => setDestinationPath(e.target.value)}
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Só mensagem (sem abrir página)</option>
                {NOTIFICATION_MENU_DESTINATIONS.map((d) => (
                  <option key={d.path} value={d.path}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleSend}
              disabled={sending}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {sending ? (
                <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {sending ? "Enviando..." : "Enviar notificação"}
            </button>

            {sentCount !== null && (
              <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 text-center">
                <p className="text-sm font-medium text-primary">✅ Enviado para {sentCount} usuário(s)</p>
              </div>
            )}
          </div>
        </div>
        </div>

        {/* Coluna direita (desktop) — preenche o espaço branco da página. */}
        <div className="space-y-5 min-w-0">
          <div className="bg-card border rounded-xl p-5">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Search className="w-4 h-4 text-primary" /> Notificações por usuário
              </h2>
              {auditUser && (
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 ${
                    auditLive
                      ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                      : "bg-muted text-muted-foreground border border-border"
                  }`}
                  title={auditLive ? "Atualização em tempo real ativa" : "Conectando…"}
                >
                  <Wifi className="w-3 h-3" />
                  {auditLive ? "Ao vivo" : "Conectando…"}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mb-3">
              Pesquise por nome ou e-mail para ver tudo o que esse usuário recebeu — não vista,
              vista (com data) ou excluída por ele. Atualiza em tempo real.
            </p>

            {!auditUser ? (
              <div className="relative">
                <input
                  value={auditSearch}
                  onChange={(e) => handleAuditSearch(e.target.value)}
                  placeholder="Nome ou e-mail do usuário…"
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
                />
                {auditSearch.trim().length >= 2 && (
                  <div className="mt-1 bg-card border rounded-xl shadow-sm max-h-56 overflow-y-auto">
                    {auditSearching ? (
                      <p className="p-3 text-[11px] text-muted-foreground">Buscando…</p>
                    ) : auditResults.length === 0 ? (
                      <p className="p-3 text-[11px] text-muted-foreground">Nenhum usuário encontrado.</p>
                    ) : (
                      auditResults.map((u) => (
                        <button
                          key={u.user_id}
                          type="button"
                          onClick={() => {
                            setAuditUser(u);
                            setAuditSearch("");
                            setAuditResults([]);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-muted transition-colors border-b last:border-0"
                        >
                          <p className="text-sm font-medium text-foreground">{u.full_name || "Sem nome"}</p>
                          <p className="text-[10px] text-muted-foreground">{u.email}</p>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 border rounded-xl px-3 py-2.5 bg-primary/5 border-primary/30 mb-3">
                  <User className="w-4 h-4 text-primary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {auditUser.full_name || "Sem nome"}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">{auditUser.email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAuditUser(null)}
                    className="text-xs text-destructive hover:underline shrink-0"
                  >
                    Trocar
                  </button>
                </div>

                {/* Resumo */}
                <div className="grid grid-cols-4 gap-2 mb-3">
                  <div className="rounded-lg border bg-muted/30 px-2 py-1.5 text-center">
                    <p className="text-[9px] uppercase tracking-wide text-muted-foreground">Total</p>
                    <p className="text-sm font-bold text-foreground">{auditCounts.total}</p>
                  </div>
                  <div className="rounded-lg border border-primary/20 bg-primary/5 px-2 py-1.5 text-center">
                    <p className="text-[9px] uppercase tracking-wide text-primary">Não vista</p>
                    <p className="text-sm font-bold text-primary">{auditCounts.unread}</p>
                  </div>
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2 py-1.5 text-center">
                    <p className="text-[9px] uppercase tracking-wide text-emerald-600">Vista</p>
                    <p className="text-sm font-bold text-emerald-600">{auditCounts.read}</p>
                  </div>
                  <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-2 py-1.5 text-center">
                    <p className="text-[9px] uppercase tracking-wide text-destructive">Excluída</p>
                    <p className="text-sm font-bold text-destructive">{auditCounts.deleted}</p>
                  </div>
                </div>

                {auditLoading ? (
                  <p className="text-xs text-muted-foreground py-6 text-center">Carregando…</p>
                ) : auditNotifs.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-6 text-center">
                    Esse usuário ainda não recebeu nenhuma notificação.
                  </p>
                ) : (
                  <ul className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                    {auditNotifs.map((n) => {
                      const isDeleted = !!n.deleted_at;
                      const isRead = n.read && !isDeleted;
                      const isUnread = !n.read && !isDeleted;
                      const statusBadge = isDeleted ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 bg-destructive/10 text-destructive border border-destructive/20">
                          <Trash2 className="w-3 h-3" /> Excluída em {formatDateTimeBR(n.deleted_at)}
                        </span>
                      ) : isRead ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                          <Eye className="w-3 h-3" /> Vista em {formatDateTimeBR(n.read_at)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 bg-primary/10 text-primary border border-primary/20">
                          <EyeOff className="w-3 h-3" /> Ainda não vista
                        </span>
                      );

                      return (
                        <li
                          key={n.id}
                          className={`rounded-xl border p-3 transition-colors ${
                            isDeleted
                              ? "border-destructive/15 bg-destructive/[0.03] opacity-80"
                              : isUnread
                                ? "border-primary/20 bg-primary/5"
                                : "border-border"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <p
                              className={`text-xs font-semibold truncate ${
                                isDeleted ? "text-muted-foreground line-through" : "text-foreground"
                              }`}
                            >
                              {n.title}
                            </p>
                            {statusBadge}
                          </div>
                          {n.message && (
                            <p
                              className={`text-[11px] mt-0.5 ${
                                isDeleted ? "text-muted-foreground line-through" : "text-muted-foreground"
                              }`}
                            >
                              {n.message}
                            </p>
                          )}
                          <div className="flex items-center justify-between gap-2 mt-1.5">
                            <p className="text-[10px] text-muted-foreground">
                              Recebida em {formatDateTimeBR(n.created_at)}
                            </p>
                            <span className="text-[9px] uppercase tracking-wide text-muted-foreground/70 font-semibold">
                              {n.type}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ─── Modal: Selecionar usuários (multi) ──────────────────────────── */}
      <Dialog open={selectOpen} onOpenChange={setSelectOpen}>
        <DialogContent className="max-w-xl p-0 overflow-hidden">
          <DialogHeader className="p-5 pb-3 border-b">
            <DialogTitle className="flex items-center gap-2 text-base">
              <UserCheck className="w-5 h-5 text-primary" /> Selecionar usuários
            </DialogTitle>
            <DialogDescription className="text-xs">
              Marque os usuários que devem receber a notificação. Use a lupa para filtrar por nome ou e-mail.
            </DialogDescription>
          </DialogHeader>

          <div className="px-5 pt-3 pb-2 space-y-2 border-b">
            <div className="flex items-center gap-2 border rounded-xl px-3 py-2 bg-background focus-within:ring-2 focus-within:ring-primary/30">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input
                autoFocus
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder="Buscar por nome ou e-mail..."
                className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
              />
              {pickerSearch && (
                <button
                  type="button"
                  onClick={() => setPickerSearch("")}
                  className="p-1 rounded hover:bg-muted"
                  aria-label="Limpar busca"
                >
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto">
              {([
                { key: "all", label: "Todos" },
                { key: "client", label: "Clientes" },
                { key: "professional", label: "Profissionais" },
                { key: "company", label: "Empresas" },
                { key: "pending_pros", label: "Em análise" },
              ] as const).map((f) => {
                const active = pickerTypeFilter === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setPickerTypeFilter(f.key)}
                    className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors border ${
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-foreground border-border hover:bg-muted"
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="max-h-[360px] overflow-y-auto px-2 py-2">
            {pickerLoading ? (
              <div className="flex justify-center py-10">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : pickerResults.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-10">
                {pickerSearch.trim().length > 0 ? "Nenhum usuário encontrado." : "Digite para buscar ou use os filtros acima."}
              </p>
            ) : (
              <ul>
                {pickerResults.map((u) => {
                  const picked = pickerSelectedIds.has(u.user_id);
                  const isPending = pickerPendingIds.has(u.user_id);
                  const typeLabel =
                    u.user_type === "client"
                      ? "Cliente"
                      : u.user_type === "professional"
                      ? "Profissional"
                      : u.user_type === "company"
                      ? "Empresa"
                      : u.user_type === "sponsor"
                      ? "Patrocinador"
                      : u.user_type || "—";
                  return (
                    <li key={u.user_id}>
                      <button
                        type="button"
                        onClick={() => togglePickerUser(u)}
                        className={`w-full flex items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors ${
                          picked ? "bg-primary/5" : "hover:bg-muted/60"
                        }`}
                      >
                        {picked ? (
                          <CheckSquare className="w-4 h-4 text-primary flex-shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">{u.full_name || "Sem nome"}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{u.email}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isPending && pickerTypeFilter !== "pending_pros" && (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-600 border border-amber-500/20">
                              <Clock className="w-2.5 h-2.5" /> Em análise
                            </span>
                          )}
                          <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">
                            {typeLabel}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 justify-between border-t bg-muted/30 px-5 py-3">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground">{selectedUsers.length}</span>
              selecionado{selectedUsers.length === 1 ? "" : "s"}
              {selectedUsers.length > 0 && (
                <button
                  type="button"
                  onClick={clearAllSelected}
                  className="text-destructive hover:underline ml-1"
                >
                  Limpar
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {pickerResults.length > 0 && (
                <button
                  type="button"
                  onClick={selectAllCurrentResults}
                  className="px-3 py-1.5 rounded-lg border text-[11px] font-semibold hover:bg-muted transition-colors"
                >
                  Selecionar todos ({pickerResults.length})
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-[12px] font-bold hover:bg-primary/90 transition-colors"
              >
                Confirmar
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminNotifications;
