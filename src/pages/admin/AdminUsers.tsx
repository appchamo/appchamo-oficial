import AdminLayout from "@/components/AdminLayout";
import { Search, MoreHorizontal, Ban, CheckCircle, Trash2, Eye, FileText, CreditCard, Briefcase, Contact, Copy, Users as UsersIcon, Archive, Wifi, Smartphone, ShieldAlert, Loader2, AlertTriangle } from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase, SUPABASE_PUBLIC_API_KEY } from "@/integrations/supabase/client";
import { useOnlineUsers, formatRelativeFromNow } from "@/lib/presence";
import { toast } from "@/hooks/use-toast";
import { translateError } from "@/lib/errorMessages";
import { getAccessTokenForEdgeFunctions } from "@/lib/getAccessTokenForEdgeFunctions";
import { readEdgeFunctionInvokeError } from "@/lib/readEdgeFunctionInvokeError";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import UserAnalyticsModal, { type AnalyticsTarget } from "@/components/admin/UserAnalyticsModal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function maskCpf(value: string | null | undefined): string {
  if (!value) return "";
  const d = value.replace(/\D/g, "");
  if (d.length !== 11) return value;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function maskCnpj(value: string | null | undefined): string {
  if (!value) return "";
  const d = value.replace(/\D/g, "");
  if (d.length !== 14) return value;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function formatBrazilPhone(value: string | null | undefined): string {
  if (!value?.trim()) return "";
  const d = value.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return value.trim();
}

function buildProfileAddress(p: Profile): string | null {
  const line1 = [p.address_street, p.address_number].filter(Boolean).join(", ");
  const extra = [p.address_complement, p.address_neighborhood].filter(Boolean).join(" · ");
  const first = [line1, extra].filter(Boolean).join(extra ? " — " : "");
  const cityUf = [p.address_city, p.address_state].filter(Boolean).join("/");
  const cep = p.address_zip?.trim() ? `CEP ${p.address_zip.replace(/\D/g, "").replace(/^(\d{5})(\d{3})$/, "$1-$2") || p.address_zip}` : "";
  const parts = [first, cityUf, cep, p.address_country?.trim()].filter(Boolean) as string[];
  const s = parts.join(" · ");
  return s.trim() || null;
}

interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  user_type: string;
  is_blocked: boolean;
  job_posting_enabled?: boolean;
  created_at: string;
  phone?: string | null;
  cpf?: string | null;
  cnpj?: string | null;
  address_street?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
  address_neighborhood?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_zip?: string | null;
  address_country?: string | null;
  accepted_terms_version?: string | null;
  accepted_terms_at?: string | null;
  last_seen_at?: string | null;
  selfie_check_status?: string | null;
  selfie_check_reason?: string | null;
}

async function copyText(value: string | null | undefined, successTitle: string) {
  const text = (value ?? "").trim();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    toast({ title: successTitle });
  } catch {
    toast({
      title: "Não foi possível copiar",
      description: "Permita acesso à área de transferência ou copie manualmente.",
      variant: "destructive",
    });
  }
}

async function invokeAdminManageFn(body: Record<string, unknown>) {
  await supabase.auth.refreshSession().catch(() => {});
  const token = await getAccessTokenForEdgeFunctions();
  if (!token) {
    toast({ title: "Sessão expirada", description: "Faça login novamente no painel admin.", variant: "destructive" });
    return { data: null, error: new Error("Sessão expirada") };
  }
  return supabase.functions.invoke("admin-manage", {
    body,
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_PUBLIC_API_KEY,
    },
  });
}

interface DeletedUserRow {
  id: string;
  original_user_id: string;
  full_name: string | null;
  email: string | null;
  user_type: string | null;
  phone: string | null;
  cpf: string | null;
  cnpj: string | null;
  address_city: string | null;
  address_state: string | null;
  deleted_at: string;
  purge_after: string;
}

function daysRemaining(purge_after: string): number {
  const ms = new Date(purge_after).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

const DeletedUsersTab = () => {
  const [rows, setRows] = useState<DeletedUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [purgeId, setPurgeId] = useState<string | null>(null);
  const [detailsUser, setDetailsUser] = useState<DeletedUserRow | null>(null);

  const fetchDeleted = useCallback(async () => {
    setLoading(true);
    // Purga automática dos expirados antes de listar.
    try {
      await (supabase as any).rpc("admin_purge_expired_deleted_users");
    } catch {
      /* noop */
    }
    const { data, error } = await (supabase as any)
      .from("deleted_users_archive")
      .select("id, original_user_id, full_name, email, user_type, phone, cpf, cnpj, address_city, address_state, deleted_at, purge_after")
      .order("deleted_at", { ascending: false });
    if (error) {
      toast({ title: "Erro", description: translateError(error.message), variant: "destructive" });
      setLoading(false);
      return;
    }
    setRows((data as DeletedUserRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { void fetchDeleted(); }, [fetchDeleted]);

  const handlePurge = async () => {
    if (!purgeId) return;
    const { data, error } = await invokeAdminManageFn({
      action: "purge_archived_user",
      archive_id: purgeId,
    });
    const errMsg = await readEdgeFunctionInvokeError(data, error);
    if (errMsg) {
      toast({ title: "Erro", description: errMsg, variant: "destructive" });
      return;
    }
    toast({ title: "Dados apagados permanentemente" });
    setPurgeId(null);
    void fetchDeleted();
  };

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      (r.full_name || "").toLowerCase().includes(q) ||
      (r.email || "").toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <div className="flex items-center gap-2 border rounded-xl px-3 py-2.5 bg-card focus-within:ring-2 focus-within:ring-primary/30 mb-3">
        <Search className="w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou email..."
          className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
        />
      </div>

      <p className="text-xs text-muted-foreground mb-3">
        Os dados ficam arquivados por <strong>30 dias</strong> a partir da data de exclusão e são apagados automaticamente depois disso. Clique em <strong>Excluir 100%</strong> para remover manualmente antes do prazo.
      </p>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div>
      ) : (
        <div className="bg-card border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium text-muted-foreground">Nome</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Email</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Tipo</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Excluído em</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Retenção</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const days = daysRemaining(r.purge_after);
                  const safeType = r.user_type === "enterprise" ? "company" : r.user_type;
                  const typeLabel =
                    safeType === "client" ? "Cliente" :
                    safeType === "professional" ? "Profissional" :
                    safeType === "company" ? "Empresa" :
                    safeType === "sponsor" ? "Patrocinador" :
                    safeType || "—";
                  return (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-medium text-foreground">{r.full_name || "—"}</td>
                      <td className="p-3 text-muted-foreground">{r.email || "—"}</td>
                      <td className="p-3 text-xs">
                        <span className="rounded-md bg-muted px-2 py-0.5 font-medium">{typeLabel}</span>
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {new Date(r.deleted_at).toLocaleString("pt-BR")}
                      </td>
                      <td className="p-3 text-xs">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium ${
                            days <= 3
                              ? "bg-destructive/10 text-destructive"
                              : days <= 10
                                ? "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400"
                                : "bg-muted text-foreground"
                          }`}
                        >
                          {days === 0 ? "Expira hoje" : `${days} dia${days === 1 ? "" : "s"}`}
                        </span>
                      </td>
                      <td className="p-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                              <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setDetailsUser(r)}>
                              <Contact className="w-3.5 h-3.5 mr-2" /> Ver detalhes
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setPurgeId(r.id)} className="text-destructive">
                              <Trash2 className="w-3.5 h-3.5 mr-2" /> Excluir 100%
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground text-sm">Nenhum usuário excluído</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AlertDialog open={!!purgeId} onOpenChange={(o) => !o && setPurgeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar dados permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              Este snapshot será removido agora. Esta ação é irreversível.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handlePurge} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir 100%</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!detailsUser} onOpenChange={(o) => !o && setDetailsUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalhes — {detailsUser?.full_name || "Usuário excluído"}</DialogTitle>
            <DialogDescription className="sr-only">Dados arquivados do utilizador removido.</DialogDescription>
          </DialogHeader>
          {detailsUser ? (
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">E-mail</p>
                <p className="text-foreground break-all">{detailsUser.email || "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Telefone</p>
                <p className="text-foreground">{formatBrazilPhone(detailsUser.phone) || "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Cidade / UF</p>
                <p className="text-foreground">
                  {[detailsUser.address_city, detailsUser.address_state].filter(Boolean).join("/") || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">CPF / CNPJ</p>
                <div className="text-foreground space-y-0.5">
                  {detailsUser.cpf?.trim() ? <p><span className="text-muted-foreground">CPF: </span>{maskCpf(detailsUser.cpf)}</p> : null}
                  {detailsUser.cnpj?.trim() ? <p><span className="text-muted-foreground">CNPJ: </span>{maskCnpj(detailsUser.cnpj)}</p> : null}
                  {!detailsUser.cpf?.trim() && !detailsUser.cnpj?.trim() ? <p>—</p> : null}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Excluído em</p>
                <p className="text-foreground">{new Date(detailsUser.deleted_at).toLocaleString("pt-BR")}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Retenção até</p>
                <p className="text-foreground">{new Date(detailsUser.purge_after).toLocaleString("pt-BR")}</p>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};

type PresenceFilter = "all" | "online" | "today" | "week" | "inactive";

const AdminUsers = () => {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "client" | "professional" | "company">("all");
  const [presenceFilter, setPresenceFilter] = useState<PresenceFilter>("all");
  const [sortBy, setSortBy] = useState<"date_desc" | "date_asc" | "name_asc" | "name_desc" | "last_seen_desc" | "last_seen_asc">("date_desc");
  const { onlineIds } = useOnlineUsers();
  const [, forceTickRerender] = useState(0);

  // Re-renderiza a cada 30s para os textos relativos ("há X min") ficarem atualizados.
  useEffect(() => {
    const id = setInterval(() => forceTickRerender((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [docsUser, setDocsUser] = useState<Profile | null>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [planUser, setPlanUser] = useState<Profile | null>(null);
  const [selectedPlan, setSelectedPlan] = useState("free");
  const [detailsUser, setDetailsUser] = useState<Profile | null>(null);
  const [analyticsTarget, setAnalyticsTarget] = useState<AnalyticsTarget | null>(null);
  const [termsVersions, setTermsVersions] = useState<{ client: string; professional: string }>({
    client: "",
    professional: "",
  });

  const fetchUsers = async () => {
    const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    if (error) { toast({ title: "Erro", description: translateError(error.message), variant: "destructive" }); return; }
    setUsers(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("platform_settings")
        .select("key, value")
        .in("key", ["terms_version", "terms_version_professional"]);
      if (!data) return;
      const parse = (v: unknown): string =>
        v == null ? "" : typeof v === "string" ? v : JSON.stringify(v).replace(/^"|"$/g, "");
      const next = { client: "", professional: "" };
      for (const row of data) {
        const val = parse(row.value);
        if (row.key === "terms_version") next.client = val;
        if (row.key === "terms_version_professional") next.professional = val;
      }
      setTermsVersions(next);
    })();
  }, []);

  const invokeAdminManage = invokeAdminManageFn;

  const presenceCounts = useMemo(() => {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    let online = 0, today = 0, week = 0, inactive = 0;
    for (const u of users) {
      if (onlineIds.has(u.user_id)) online++;
      const last = u.last_seen_at ? new Date(u.last_seen_at).getTime() : 0;
      const diff = last ? now - last : Infinity;
      if (diff <= DAY) today++;
      if (diff <= 7 * DAY) week++;
      if (!last || diff > 30 * DAY) inactive++;
    }
    return { online, today, week, inactive, total: users.length };
  }, [users, onlineIds]);

  const filtered = users
    .filter((u) => {
      const safeType = u.user_type === "enterprise" ? "company" : u.user_type;
      if (typeFilter === "client" && safeType !== "client") return false;
      if (typeFilter === "professional" && safeType !== "professional") return false;
      if (typeFilter === "company" && safeType !== "company") return false;
      return true;
    })
    .filter((u) => {
      if (presenceFilter === "all") return true;
      const isOnline = onlineIds.has(u.user_id);
      const last = u.last_seen_at ? new Date(u.last_seen_at).getTime() : 0;
      const diff = last ? Date.now() - last : Infinity;
      const DAY = 24 * 60 * 60 * 1000;
      if (presenceFilter === "online") return isOnline;
      if (presenceFilter === "today") return isOnline || diff <= DAY;
      if (presenceFilter === "week") return isOnline || diff <= 7 * DAY;
      if (presenceFilter === "inactive") return !isOnline && (!last || diff > 30 * DAY);
      return true;
    })
    .filter((u) =>
      u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      switch (sortBy) {
        case "name_asc":  return (a.full_name || "").localeCompare(b.full_name || "", "pt-BR");
        case "name_desc": return (b.full_name || "").localeCompare(a.full_name || "", "pt-BR");
        case "date_asc":  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "date_desc": return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "last_seen_desc": {
          const ta = a.last_seen_at ? new Date(a.last_seen_at).getTime() : 0;
          const tb = b.last_seen_at ? new Date(b.last_seen_at).getTime() : 0;
          return tb - ta;
        }
        case "last_seen_asc": {
          const ta = a.last_seen_at ? new Date(a.last_seen_at).getTime() : Infinity;
          const tb = b.last_seen_at ? new Date(b.last_seen_at).getTime() : Infinity;
          return ta - tb;
        }
        default: return 0;
      }
    });

  // ----- Bloqueio (usuário / aparelho) -----
  const [blockTarget, setBlockTarget] = useState<Profile | null>(null);
  const [blockType, setBlockType] = useState<"user" | "device" | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const [blockBusy, setBlockBusy] = useState(false);

  const openBlock = (user: Profile) => { setBlockTarget(user); setBlockType(null); setBlockReason(""); };
  const closeBlock = () => { setBlockTarget(null); setBlockType(null); setBlockReason(""); };

  const confirmBlock = async () => {
    if (!blockTarget || !blockType) return;
    const reason = blockReason.trim();
    if (reason.length < 10) { toast({ title: "Descreva o motivo", description: "O motivo precisa ter pelo menos 10 caracteres.", variant: "destructive" }); return; }
    setBlockBusy(true);
    if (blockType === "user") {
      const { error } = await supabase.rpc("admin_block_user" as never, { p_user_id: blockTarget.user_id, p_reason: reason } as never);
      setBlockBusy(false);
      if (error) { toast({ title: "Erro", description: translateError(error.message), variant: "destructive" }); return; }
      await logAction("block_user", "user", blockTarget.user_id);
      toast({ title: "Usuário bloqueado" });
    } else {
      const { data, error } = await supabase.rpc("admin_block_device" as never, { p_user_id: blockTarget.user_id, p_reason: reason } as never);
      setBlockBusy(false);
      if (error) { toast({ title: "Erro", description: translateError(error.message), variant: "destructive" }); return; }
      await logAction("block_device", "user", blockTarget.user_id);
      const n = Number(data) || 0;
      toast(n > 0
        ? { title: "Aparelho bloqueado", description: `${n} aparelho(s) impedido(s) de criar novas contas.` }
        : { title: "Nenhum aparelho registrado", description: "Este usuário ainda não tem aparelho registrado para bloquear." });
    }
    closeBlock();
    fetchUsers();
  };

  const unblockUser = async (user: Profile) => {
    const { error } = await supabase.rpc("admin_unblock_user" as never, { p_user_id: user.user_id } as never);
    if (error) { toast({ title: "Erro", description: translateError(error.message), variant: "destructive" }); return; }
    await logAction("unblock_user", "user", user.user_id);
    toast({ title: "Usuário desbloqueado" });
    fetchUsers();
  };

  const handleChangeUserType = async (user: Profile, newType: string) => {
    const { error } = await supabase.from("profiles").update({ user_type: newType }).eq("id", user.id);
    if (error) { toast({ title: "Erro ao alterar tipo", description: translateError(error.message), variant: "destructive" }); return; }

    if (newType === "professional" || newType === "company") {
      const { data: existingPro } = await supabase.from("professionals").select("id").eq("user_id", user.user_id).maybeSingle();
      if (!existingPro) {
        await supabase.from("professionals").insert({
          user_id: user.user_id,
          profile_status: "approved",
          active: true,
        });
      }
    }

    await logAction("change_user_type", "user", user.user_id);
    toast({ title: `Tipo alterado para ${newType === "company" ? "Empresa" : newType === "professional" ? "Profissional" : "Cliente"}` });
    fetchUsers();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const user = users.find(u => u.id === deleteId);
    if (!user?.user_id) {
      toast({ title: "Erro ao deletar", description: "Utilizador não encontrado na lista.", variant: "destructive" });
      return;
    }
    const { data, error } = await invokeAdminManage({
      action: "delete_user",
      user_id: user.user_id,
    });
    const errMsg = await readEdgeFunctionInvokeError(data, error);
    if (errMsg) {
      toast({ title: "Erro ao deletar", description: errMsg, variant: "destructive" });
      return;
    }
    await logAction("delete_user", "user", user?.user_id || "");
    toast({ title: "Usuário removido!" });
    setDeleteId(null);
    fetchUsers();
  };

  const logAction = async (action: string, target_type: string, target_id: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase.from("admin_logs").insert({
        admin_user_id: session.user.id, action, target_type, target_id,
      });
    }
  };

  const openPlanModal = async (user: Profile) => {
    setPlanUser(user);
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("plan_id")
      .eq("user_id", user.user_id)
      .maybeSingle();
    
    setSelectedPlan(sub?.plan_id || "free");
  };

  const handleChangePlan = async () => {
    if (!planUser) return;
    const { data: sub } = await supabase.from("subscriptions").select("id").eq("user_id", planUser.user_id).maybeSingle();
    // cancel_at_period_end=false evita que o cron expire_cancelled_subscriptions reverta o plano pra free.
    if (sub) {
      const { error: updErr } = await supabase.from("subscriptions")
        .update({ plan_id: selectedPlan, status: "active", cancel_at_period_end: false })
        .eq("id", sub.id);
      if (updErr) { toast({ title: "Não foi possível alterar o plano", description: updErr.message, variant: "destructive" }); return; }
    } else {
      const { error: insErr } = await supabase.from("subscriptions")
        .insert({ user_id: planUser.user_id, plan_id: selectedPlan, status: "active", cancel_at_period_end: false });
      if (insErr) { toast({ title: "Não foi possível alterar o plano", description: insErr.message, variant: "destructive" }); return; }
    }
    
    // Corrigido para usar "company" ao invés de "enterprise"
    if (selectedPlan === 'business' && planUser.user_type === 'professional') {
        await supabase.from("profiles").update({ user_type: "company" }).eq("user_id", planUser.user_id);
    }

    await logAction("change_plan", "user", planUser.user_id);
    toast({ title: `Plano alterado para ${selectedPlan === "free" ? "Grátis" : selectedPlan === "pro" ? "Pro" : selectedPlan === "vip" ? "Vip" : "Empresarial"}` });
    setPlanUser(null);
    fetchUsers(); 
  };

  const toggleJobPosting = async (user: Profile) => {
    const newValue = !user.job_posting_enabled;
    const { error } = await supabase.from("profiles").update({ job_posting_enabled: newValue }).eq("id", user.id);
    if (error) {
      toast({ title: "Erro ao atualizar", description: translateError(error.message), variant: "destructive" });
      return;
    }
    if (newValue) {
      const { data: existingPro } = await supabase.from("professionals").select("id").eq("user_id", user.user_id).maybeSingle();
      if (!existingPro) {
        await supabase.from("professionals").insert({
          user_id: user.user_id,
          profile_status: "approved",
          active: true,
        });
      }
    }
    await logAction(newValue ? "enable_job_posting" : "disable_job_posting", "user", user.user_id);
    toast({ title: newValue ? "Vaga de emprego liberada para este usuário" : "Vaga de emprego removida" });
    fetchUsers();
  };

  const openDocs = async (user: Profile) => {
    setDocsUser(user);
    setDocsLoading(true);
    setDocs([]);
    const { data: pro } = await supabase.from("professionals").select("id").eq("user_id", user.user_id).maybeSingle();
    if (pro) {
      const { data: list } = await supabase.from("professional_documents").select("*").eq("professional_id", pro.id);
      const items = list || [];
      const token = await getAccessTokenForEdgeFunctions();
      const authHeaders = token ? { Authorization: `Bearer ${token}` } : undefined;
      if (!token) {
        toast({ title: "Sessão expirada", description: "Faça login novamente no painel admin.", variant: "destructive" });
      }
      const withUrls = await Promise.all(
        items.map(async (d: any) => {
          try {
            const { data, error } = await supabase.functions.invoke("admin-manage", {
              body: { action: "sign_document_url", filePath: d.file_url },
              headers: authHeaders,
            });
            if (error) console.warn("sign_document_url error:", error?.message, "path:", d.file_url);
            return { ...d, viewUrl: data?.signedUrl ?? null, notFound: data?.notFound ?? false };
          } catch (e) {
            console.warn("sign_document_url exception:", e);
            return { ...d, viewUrl: null, notFound: true };
          }
        })
      );
      setDocs(withUrls);
    }
    setDocsLoading(false);
  };

  return (
    <AdminLayout title="Usuários">
      <Tabs defaultValue="active">
        <TabsList className="mb-4 flex flex-wrap w-full gap-1 h-auto min-h-10">
          <TabsTrigger value="active" className="shrink-0">
            <UsersIcon className="w-3.5 h-3.5 mr-1" />
            Ativos
          </TabsTrigger>
          <TabsTrigger value="blocked" className="shrink-0">
            <Ban className="w-3.5 h-3.5 mr-1" />
            Bloqueados
          </TabsTrigger>
          <TabsTrigger value="deleted" className="shrink-0">
            <Archive className="w-3.5 h-3.5 mr-1" />
            Excluídos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="blocked">
          <BlockedTab />
        </TabsContent>

        <TabsContent value="deleted">
          <DeletedUsersTab />
        </TabsContent>

        <TabsContent value="active">
      {/* Chips de presença */}
      <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1">
        {([
          { key: "all", label: "Todos", count: presenceCounts.total, dot: null },
          { key: "online", label: "Online agora", count: presenceCounts.online, dot: "bg-emerald-500" },
          { key: "today", label: "Ativos hoje", count: presenceCounts.today, dot: "bg-blue-500" },
          { key: "week", label: "Últimos 7 dias", count: presenceCounts.week, dot: "bg-violet-500" },
          { key: "inactive", label: "Inativos +30 dias", count: presenceCounts.inactive, dot: "bg-muted-foreground/40" },
        ] as Array<{ key: PresenceFilter; label: string; count: number; dot: string | null }>).map((chip) => {
          const active = presenceFilter === chip.key;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => setPresenceFilter(chip.key)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-foreground hover:bg-muted"
              }`}
            >
              {chip.dot && <span className={`w-2 h-2 rounded-full ${chip.dot} ${chip.key === "online" && active ? "animate-pulse" : ""}`} />}
              {chip.key === "online" && !chip.dot ? <Wifi className="w-3 h-3" /> : null}
              <span>{chip.label}</span>
              <span className={`ml-0.5 px-1.5 rounded-md text-[10px] tabular-nums ${active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground"}`}>
                {chip.count.toLocaleString("pt-BR")}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-4">
        <div className="flex-1 flex items-center gap-2 border rounded-xl px-3 py-2.5 bg-card focus-within:ring-2 focus-within:ring-primary/30">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou email..."
            className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
          className="border rounded-xl px-3 py-2.5 text-sm bg-card outline-none focus:ring-2 focus:ring-primary/30 text-foreground cursor-pointer min-w-[10rem]"
        >
          <option value="all">Tipo: todos</option>
          <option value="client">Tipo: cliente</option>
          <option value="professional">Tipo: profissional</option>
          <option value="company">Tipo: empresa</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="border rounded-xl px-3 py-2.5 text-sm bg-card outline-none focus:ring-2 focus:ring-primary/30 text-foreground cursor-pointer"
        >
          <option value="date_desc">Data ↓ (mais recente)</option>
          <option value="date_asc">Data ↑ (mais antigo)</option>
          <option value="name_asc">Nome A → Z</option>
          <option value="name_desc">Nome Z → A</option>
          <option value="last_seen_desc">Última atividade ↓</option>
          <option value="last_seen_asc">Última atividade ↑</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div>
      ) : (
        <div className="bg-card border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium text-muted-foreground">Nome</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Email</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Tipo</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">
                    <button
                      type="button"
                      onClick={() => setSortBy((prev) => (prev === "last_seen_desc" ? "last_seen_asc" : "last_seen_desc"))}
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
                      title="Ordenar por atividade"
                    >
                      Atividade
                      {sortBy === "last_seen_desc" && <span>↓</span>}
                      {sortBy === "last_seen_asc" && <span>↑</span>}
                    </button>
                  </th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Criado em</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => {
                  // Trava de segurança: converte enterprise do teste anterior para company visualmente
                  const safeUserType = user.user_type === 'enterprise' ? 'company' : user.user_type;
                  const isOnline = onlineIds.has(user.user_id);
                  const lastSeenRel = formatRelativeFromNow(user.last_seen_at ?? null);
                  const lastSeenAbs = user.last_seen_at
                    ? new Date(user.last_seen_at).toLocaleString("pt-BR")
                    : null;

                  const selfieFlag = user.selfie_check_status === "review" || user.selfie_check_status === "reject";
                  return (
                    <tr key={user.id} className={`border-b last:border-0 transition-colors ${selfieFlag ? "bg-destructive/5 hover:bg-destructive/10" : "hover:bg-muted/30"}`}>
                      <td className="p-3 font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              isOnline ? "bg-emerald-500 animate-pulse shadow-[0_0_0_3px_hsl(var(--background))]" : "bg-muted-foreground/30"
                            }`}
                            title={isOnline ? "Online agora" : "Offline"}
                          />
                          {selfieFlag && (
                            <span
                              className="relative inline-flex shrink-0"
                              title={`Selfie/documento com problema: ${user.selfie_check_reason || "verificar"}`}
                            >
                              <AlertTriangle className="w-4 h-4 text-destructive" />
                              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-destructive ring-2 ring-background" />
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => setAnalyticsTarget({ user_id: user.user_id, full_name: user.full_name, email: user.email })}
                            className="text-left hover:text-primary hover:underline transition-colors"
                            title="Ver analytics do usuário"
                          >
                            {user.full_name || "—"}
                          </button>
                        </div>
                        {selfieFlag && (
                          <p className="text-[10px] text-destructive font-semibold mt-0.5 ml-4">
                            ⚠ Selfie/documento: {user.selfie_check_reason || "revisar qualidade"}
                          </p>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground">{user.email}</td>
                      <td className="p-3">
                        <Select value={safeUserType} onValueChange={(v) => handleChangeUserType(user, v)}>
                          <SelectTrigger className="h-7 w-[130px] text-xs rounded-lg">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="client">Cliente</SelectItem>
                            <SelectItem value="professional">Profissional</SelectItem>
                            <SelectItem value="company">Empresa</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-3 text-xs whitespace-nowrap" title={lastSeenAbs ?? "Nunca abriu o app desde o registo desta funcionalidade"}>
                        {isOnline ? (
                          <span className="inline-flex items-center gap-1.5 text-emerald-600 font-bold">
                            <Wifi className="w-3 h-3" /> Online
                          </span>
                        ) : lastSeenRel ? (
                          <span className="text-muted-foreground">{lastSeenRel}</span>
                        ) : (
                          <span className="text-muted-foreground/60 italic">Nunca</span>
                        )}
                      </td>
                      <td className="p-3">
                        {user.is_blocked ? (
                          <span className="inline-flex items-center gap-1 text-destructive text-xs"><Ban className="w-3 h-3" /> Bloqueado</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: "hsl(var(--success))" }}><CheckCircle className="w-3 h-3" /> Ativo</span>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground text-xs whitespace-nowrap">
                        {new Date(user.created_at).toLocaleDateString("pt-BR")}
                        <span className="ml-1.5 opacity-70">
                          {new Date(user.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </td>
                      <td className="p-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                              <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {user.is_blocked ? (
                              <DropdownMenuItem onClick={() => unblockUser(user)}>
                                <CheckCircle className="w-3.5 h-3.5 mr-2" /> Desbloquear
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => openBlock(user)} className="text-destructive">
                                <Ban className="w-3.5 h-3.5 mr-2" /> Bloquear
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => setDetailsUser(user)}>
                              <Contact className="w-3.5 h-3.5 mr-2" /> Ver detalhes
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openDocs(user)}>
                              <FileText className="w-3.5 h-3.5 mr-2" /> Ver documentos
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openPlanModal(user)}>
                              <CreditCard className="w-3.5 h-3.5 mr-2" /> Alterar plano
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toggleJobPosting(user)}>
                              <Briefcase className="w-3.5 h-3.5 mr-2" />
                              {user.job_posting_enabled ? "Remover vaga de emprego" : "Liberar vaga de emprego"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setDeleteId(user.id)} className="text-destructive">
                              <Trash2 className="w-3.5 h-3.5 mr-2" /> Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="p-8 text-center text-muted-foreground text-sm">Nenhum usuário encontrado</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
            <AlertDialogDescription>O usuário e todos os dados associados serão removidos permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!detailsUser} onOpenChange={(o) => !o && setDetailsUser(null)}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes — {detailsUser?.full_name || "Usuário"}</DialogTitle>
            <DialogDescription className="sr-only">
              Telefone, endereço e documento do utilizador selecionado.
            </DialogDescription>
          </DialogHeader>
          {detailsUser ? (
            <div className="space-y-4 text-sm">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">E-mail</p>
                <div className="mt-0.5 flex items-start justify-between gap-2">
                  <p className="text-foreground break-all min-w-0 flex-1">{detailsUser.email || "—"}</p>
                  {detailsUser.email?.trim() ? (
                    <button
                      type="button"
                      onClick={() => copyText(detailsUser.email, "E-mail copiado")}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-primary/35 bg-primary/8 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-primary hover:bg-primary/15 transition-colors"
                    >
                      <Copy className="w-3 h-3" aria-hidden />
                      Copiar
                    </button>
                  ) : null}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Telefone</p>
                <div className="mt-0.5 flex items-start justify-between gap-2">
                  <p className="text-foreground min-w-0 flex-1">
                    {formatBrazilPhone(detailsUser.phone ?? null) || "—"}
                  </p>
                  {detailsUser.phone?.trim() ? (
                    <button
                      type="button"
                      onClick={() =>
                        copyText(
                          formatBrazilPhone(detailsUser.phone) || detailsUser.phone!.replace(/\s/g, ""),
                          "Telefone copiado"
                        )
                      }
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-primary/35 bg-primary/8 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-primary hover:bg-primary/15 transition-colors"
                    >
                      <Copy className="w-3 h-3" aria-hidden />
                      Copiar
                    </button>
                  ) : null}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Última atividade</p>
                <div className="mt-0.5">
                  {onlineIds.has(detailsUser.user_id) ? (
                    <span className="inline-flex items-center gap-1.5 text-emerald-600 font-bold text-sm">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      Online agora
                    </span>
                  ) : detailsUser.last_seen_at ? (
                    <p className="text-foreground">
                      {formatRelativeFromNow(detailsUser.last_seen_at)}
                      <span className="text-xs text-muted-foreground ml-2">
                        ({new Date(detailsUser.last_seen_at).toLocaleString("pt-BR")})
                      </span>
                    </p>
                  ) : (
                    <p className="text-muted-foreground italic text-xs">Nunca abriu o app desde que esta funcionalidade foi ativada.</p>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Endereço</p>
                <p className="text-foreground mt-0.5 whitespace-pre-wrap">
                  {buildProfileAddress(detailsUser) || "Não informado"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">CPF / CNPJ</p>
                <div className="text-foreground mt-0.5 space-y-1">
                  {detailsUser.cpf?.trim() ? (
                    <p>
                      <span className="text-muted-foreground">CPF: </span>
                      {maskCpf(detailsUser.cpf)}
                    </p>
                  ) : null}
                  {detailsUser.cnpj?.trim() ? (
                    <p>
                      <span className="text-muted-foreground">CNPJ: </span>
                      {maskCnpj(detailsUser.cnpj)}
                    </p>
                  ) : null}
                  {!detailsUser.cpf?.trim() && !detailsUser.cnpj?.trim() ? <p>—</p> : null}
                </div>
              </div>

              {/* Aceite dos Termos */}
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Aceite dos termos
                </p>
                {(() => {
                  const isPro =
                    detailsUser.user_type === "professional" || detailsUser.user_type === "company";
                  const currentVersion = isPro
                    ? termsVersions.professional
                    : termsVersions.client;
                  const acceptedVersion = (detailsUser.accepted_terms_version || "").trim();
                  const acceptedAt = detailsUser.accepted_terms_at || "";
                  if (!acceptedVersion) {
                    return (
                      <p className="text-foreground mt-0.5">
                        <span className="inline-flex items-center rounded-md bg-destructive/10 text-destructive text-[11px] font-bold uppercase tracking-wide px-2 py-0.5">
                          Nunca aceitou
                        </span>
                      </p>
                    );
                  }
                  const upToDate =
                    !!currentVersion && acceptedVersion === currentVersion;
                  return (
                    <div className="text-foreground mt-0.5 space-y-1">
                      <p className="flex items-center gap-2 flex-wrap">
                        <span className="text-muted-foreground">Status:</span>
                        {upToDate ? (
                          <span className="inline-flex items-center rounded-md bg-emerald-500/10 text-emerald-600 text-[11px] font-bold uppercase tracking-wide px-2 py-0.5">
                            Atualizado
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-md bg-amber-500/10 text-amber-600 text-[11px] font-bold uppercase tracking-wide px-2 py-0.5">
                            Versão desatualizada
                          </span>
                        )}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Versão aceita: </span>
                        {acceptedVersion}
                        {currentVersion && !upToDate ? (
                          <span className="text-muted-foreground"> (atual: {currentVersion})</span>
                        ) : null}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Data/hora: </span>
                        {acceptedAt
                          ? new Date(acceptedAt).toLocaleString("pt-BR")
                          : "—"}
                      </p>
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Documents Dialog */}
      <Dialog open={!!docsUser} onOpenChange={(o) => !o && setDocsUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Documentos — {docsUser?.full_name}</DialogTitle>
          </DialogHeader>
          {docsLoading ? (
            <div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" /></div>
          ) : docs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum documento enviado.</p>
          ) : (
            <div className="space-y-3">
              {docs.map((d: any) => (
                d.notFound ? (
                  <div key={d.id} className="flex items-center gap-3 p-3 border border-destructive/30 rounded-xl bg-destructive/5">
                    <FileText className="w-5 h-5 text-destructive flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground capitalize">{d.type}</p>
                      <p className="text-xs text-destructive">Arquivo não encontrado — peça reenvio</p>
                    </div>
                  </div>
                ) : (
                  <a
                    key={d.id}
                    href={d.viewUrl ?? "#"}
                    onClick={!d.viewUrl ? (e) => { e.preventDefault(); } : undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 border rounded-xl hover:bg-muted/50 transition-colors"
                  >
                    <FileText className="w-5 h-5 text-primary flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground capitalize">{d.type}</p>
                      <p className="text-xs text-muted-foreground">Status: {d.status} · {new Date(d.created_at).toLocaleDateString("pt-BR")}</p>
                    </div>
                    <Eye className="w-4 h-4 text-muted-foreground" />
                  </a>
                )
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Plan Change Dialog */}
      <Dialog open={!!planUser} onOpenChange={(o) => !o && setPlanUser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Alterar plano — {planUser?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={selectedPlan} onValueChange={setSelectedPlan}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="free">Grátis</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="vip">Vip</SelectItem>
                <SelectItem value="business">Empresarial</SelectItem>
              </SelectContent>
            </Select>
            <button onClick={handleChangePlan} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors">
              Salvar plano
            </button>
          </div>
        </DialogContent>
      </Dialog>
        </TabsContent>
      </Tabs>

      <UserAnalyticsModal target={analyticsTarget} onClose={() => setAnalyticsTarget(null)} />

      {/* Modal de bloqueio (usuário / aparelho) */}
      <Dialog open={!!blockTarget} onOpenChange={(o) => !o && closeBlock()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Bloquear {blockTarget?.full_name || "usuário"}</DialogTitle>
          </DialogHeader>
          {blockType === null ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">Escolha o tipo de bloqueio:</p>
              <button
                type="button"
                onClick={() => setBlockType("user")}
                className="flex items-start gap-3 rounded-xl border p-3 text-left hover:bg-muted transition-colors"
              >
                <Ban className="w-5 h-5 text-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Bloqueio de usuário</p>
                  <p className="text-xs text-muted-foreground">Impede esta conta de usar o app.</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setBlockType("device")}
                className="flex items-start gap-3 rounded-xl border-2 border-destructive/40 bg-destructive/5 p-3 text-left hover:bg-destructive/10 transition-colors"
              >
                <Smartphone className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-destructive">Bloqueio de aparelho</p>
                  <p className="text-xs text-destructive/80">Bloqueio pesado — impede o aparelho de criar novas contas.</p>
                </div>
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {blockType === "device" && (
                <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                  <p className="leading-snug">
                    Este aparelho ficará <b>impossibilitado de criar novas contas</b> no Chamô.
                    Você pode desfazer isso depois na aba <b>Bloqueados</b>.
                  </p>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-muted-foreground">Motivo do bloqueio (mínimo 10 caracteres)</label>
                <textarea
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  rows={3}
                  placeholder="Ex: Conta fake usada para aplicar golpe em clientes."
                  className="w-full border rounded-xl px-3 py-2 text-sm bg-background mt-1 outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
                <p className={`text-[10px] mt-0.5 ${blockReason.trim().length < 10 ? "text-destructive" : "text-muted-foreground"}`}>
                  {blockReason.trim().length}/10
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setBlockType(null)}
                  className="flex-1 py-2.5 rounded-xl border text-sm font-medium hover:bg-muted transition-colors"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={confirmBlock}
                  disabled={blockBusy || blockReason.trim().length < 10}
                  className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-bold disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                >
                  {blockBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                  Bloquear
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

interface BlockedUserRow { user_id: string; full_name: string | null; email: string | null; blocked_reason: string | null; blocked_at: string | null; }
interface BlockedDeviceRow { device_id: string; reason: string | null; source_user_id: string | null; created_at: string; ownerName?: string | null; }

function BlockedTab() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<BlockedUserRow[]>([]);
  const [devices, setDevices] = useState<BlockedDeviceRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: u }, { data: d }] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, email, blocked_reason, blocked_at").eq("is_blocked", true).order("blocked_at", { ascending: false }),
      supabase.from("blocked_devices" as never).select("device_id, reason, source_user_id, created_at").eq("active", true).order("created_at", { ascending: false }),
    ]);
    const devRows = ((d as unknown) as BlockedDeviceRow[]) || [];
    const ownerIds = [...new Set(devRows.map((r) => r.source_user_id).filter(Boolean))] as string[];
    let nameById: Record<string, string> = {};
    if (ownerIds.length) {
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", ownerIds);
      nameById = Object.fromEntries(((profs as { user_id: string; full_name: string | null }[]) || []).map((p) => [p.user_id, p.full_name || "—"]));
    }
    setUsers(((u as unknown) as BlockedUserRow[]) || []);
    setDevices(devRows.map((r) => ({ ...r, ownerName: r.source_user_id ? nameById[r.source_user_id] : null })));
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const unblockUser = async (userId: string) => {
    setBusy("u:" + userId);
    const { error } = await supabase.rpc("admin_unblock_user" as never, { p_user_id: userId } as never);
    setBusy(null);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Usuário desbloqueado" });
    void load();
  };
  const unblockDevice = async (deviceId: string) => {
    setBusy("d:" + deviceId);
    const { error } = await supabase.rpc("admin_unblock_device" as never, { p_device_id: deviceId } as never);
    setBusy(null);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Aparelho desbloqueado" });
    void load();
  };

  if (loading) return <div className="flex justify-center py-12 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  const fmt = (s: string | null) => (s ? new Date(s).toLocaleString("pt-BR") : "—");

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-bold text-foreground mb-2 flex items-center gap-1.5"><Ban className="w-4 h-4 text-destructive" /> Usuários bloqueados ({users.length})</h3>
        {users.length === 0 ? (
          <p className="text-xs text-muted-foreground py-3">Nenhum usuário bloqueado.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {users.map((u) => (
              <div key={u.user_id} className="flex items-start gap-3 rounded-xl border p-3 bg-card">
                <Ban className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{u.full_name || "—"}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  <p className="text-xs text-foreground mt-1"><span className="font-medium">Motivo:</span> {u.blocked_reason || "—"}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Bloqueado em {fmt(u.blocked_at)}</p>
                </div>
                <button onClick={() => unblockUser(u.user_id)} disabled={busy === "u:" + u.user_id}
                  className="shrink-0 px-3 py-1.5 rounded-lg border text-xs font-semibold hover:bg-muted transition-colors disabled:opacity-60 inline-flex items-center gap-1.5">
                  {busy === "u:" + u.user_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />} Desbloquear
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-sm font-bold text-foreground mb-2 flex items-center gap-1.5"><Smartphone className="w-4 h-4 text-destructive" /> Aparelhos bloqueados ({devices.length})</h3>
        {devices.length === 0 ? (
          <p className="text-xs text-muted-foreground py-3">Nenhum aparelho bloqueado.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {devices.map((d) => (
              <div key={d.device_id} className="flex items-start gap-3 rounded-xl border-2 border-destructive/30 p-3 bg-destructive/5">
                <Smartphone className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{d.ownerName || "Aparelho"}</p>
                  <p className="text-[10px] text-muted-foreground font-mono truncate">{d.device_id}</p>
                  <p className="text-xs text-foreground mt-1"><span className="font-medium">Motivo:</span> {d.reason || "—"}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Bloqueado em {fmt(d.created_at)}</p>
                </div>
                <button onClick={() => unblockDevice(d.device_id)} disabled={busy === "d:" + d.device_id}
                  className="shrink-0 px-3 py-1.5 rounded-lg border text-xs font-semibold hover:bg-muted transition-colors disabled:opacity-60 inline-flex items-center gap-1.5">
                  {busy === "d:" + d.device_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />} Desbloquear
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default AdminUsers;