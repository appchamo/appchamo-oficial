import AdminLayout from "@/components/AdminLayout";
import { Search, MoreHorizontal, Ban, CheckCircle, Trash2, Eye, FileText, CreditCard, Briefcase, Contact, Copy, Users as UsersIcon, Archive } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { supabase, SUPABASE_PUBLIC_API_KEY } from "@/integrations/supabase/client";
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

const AdminUsers = () => {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "client" | "professional" | "company">("all");
  const [sortBy, setSortBy] = useState<"date_desc" | "date_asc" | "name_asc" | "name_desc">("date_desc");
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [docsUser, setDocsUser] = useState<Profile | null>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [planUser, setPlanUser] = useState<Profile | null>(null);
  const [selectedPlan, setSelectedPlan] = useState("free");
  const [detailsUser, setDetailsUser] = useState<Profile | null>(null);

  const fetchUsers = async () => {
    const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    if (error) { toast({ title: "Erro", description: translateError(error.message), variant: "destructive" }); return; }
    setUsers(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const invokeAdminManage = invokeAdminManageFn;

  const filtered = users
    .filter((u) => {
      const safeType = u.user_type === "enterprise" ? "company" : u.user_type;
      if (typeFilter === "client" && safeType !== "client") return false;
      if (typeFilter === "professional" && safeType !== "professional") return false;
      if (typeFilter === "company" && safeType !== "company") return false;
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
        default: return 0;
      }
    });

  const toggleBlock = async (user: Profile) => {
    const { error } = await supabase.from("profiles").update({ is_blocked: !user.is_blocked }).eq("id", user.id);
    if (error) { toast({ title: "Erro", description: translateError(error.message), variant: "destructive" }); return; }
    await logAction(user.is_blocked ? "unblock_user" : "block_user", "user", user.user_id);
    toast({ title: user.is_blocked ? "Usuário desbloqueado" : "Usuário bloqueado" });
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
    if (sub) {
      await supabase.from("subscriptions").update({ plan_id: selectedPlan, status: "active" }).eq("id", sub.id);
    } else {
      await supabase.from("subscriptions").insert({ user_id: planUser.user_id, plan_id: selectedPlan, status: "active" });
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
          <TabsTrigger value="deleted" className="shrink-0">
            <Archive className="w-3.5 h-3.5 mr-1" />
            Excluídos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="deleted">
          <DeletedUsersTab />
        </TabsContent>

        <TabsContent value="active">
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
                  <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Criado em</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => {
                  // Trava de segurança: converte enterprise do teste anterior para company visualmente
                  const safeUserType = user.user_type === 'enterprise' ? 'company' : user.user_type;

                  return (
                    <tr key={user.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-medium text-foreground">{user.full_name || "—"}</td>
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
                      <td className="p-3">
                        {user.is_blocked ? (
                          <span className="inline-flex items-center gap-1 text-destructive text-xs"><Ban className="w-3 h-3" /> Bloqueado</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: "hsl(var(--success))" }}><CheckCircle className="w-3 h-3" /> Ativo</span>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">{new Date(user.created_at).toLocaleDateString("pt-BR")}</td>
                      <td className="p-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                              <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => toggleBlock(user)}>
                              {user.is_blocked ? <><CheckCircle className="w-3.5 h-3.5 mr-2" /> Desbloquear</> : <><Ban className="w-3.5 h-3.5 mr-2" /> Bloquear</>}
                            </DropdownMenuItem>
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
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground text-sm">Nenhum usuário encontrado</td></tr>
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
        <DialogContent className="max-w-md">
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
    </AdminLayout>
  );
};

export default AdminUsers;