import AdminLayout from "@/components/AdminLayout";
import { Search, MoreHorizontal, Ban, CheckCircle, Trash2, Shield, Eye, FileText, CreditCard } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { translateError } from "@/lib/errorMessages";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  user_type: string;
  is_blocked: boolean;
  created_at: string;
}

const AdminUsers = () => {
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [docsUser, setDocsUser] = useState<Profile | null>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [planUser, setPlanUser] = useState<Profile | null>(null);
  const [selectedPlan, setSelectedPlan] = useState("free");

  const fetchUsers = async () => {
    const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    if (error) { toast({ title: "Erro", description: translateError(error.message), variant: "destructive" }); return; }
    setUsers(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const filtered = users.filter(
    (u) => u.full_name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
  );

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
    const { error } = await supabase.functions.invoke("admin-manage", {
      body: { action: "delete_user", user_id: user?.user_id },
    });
    if (error) { toast({ title: "Erro ao deletar", description: translateError(error.message), variant: "destructive" }); return; }
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
    // Busca o plano atual do usuário antes de abrir o modal
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
    
    // Se mudou para business e o usuário for profissional, muda para empresa
    if (selectedPlan === 'business' && planUser.user_type === 'professional') {
        await supabase.from("profiles").update({ user_type: "enterprise" }).eq("user_id", planUser.user_id);
    }

    await logAction("change_plan", "user", planUser.user_id);
    toast({ title: `Plano alterado para ${selectedPlan === "free" ? "Grátis" : selectedPlan === "pro" ? "Pro" : selectedPlan === "vip" ? "Vip" : "Empresarial"}` });
    setPlanUser(null);
    fetchUsers(); // Atualiza a lista caso o tipo de usuário tenha mudado
  };

  const openDocs = async (user: Profile) => {
    setDocsUser(user);
    const { data: pro } = await supabase.from("professionals").select("id").eq("user_id", user.user_id).maybeSingle();
    if (pro) {
      const { data } = await supabase.from("professional_documents").select("*").eq("professional_id", pro.id);
      setDocs(data || []);
    } else {
      setDocs([]);
    }
  };

  return (
    <AdminLayout title="Usuários">
      <div className="flex items-center gap-2 mb-4">
        <div className="flex-1 flex items-center gap-2 border rounded-xl px-3 py-2.5 bg-card focus-within:ring-2 focus-within:ring-primary/30">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou email..."
            className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
          />
        </div>
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
                {filtered.map((user) => (
                  <tr key={user.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-medium text-foreground">{user.full_name || "—"}</td>
                    <td className="p-3 text-muted-foreground">{user.email}</td>
                    <td className="p-3">
                      <Select value={user.user_type} onValueChange={(v) => handleChangeUserType(user, v)}>
                        <SelectTrigger className="h-7 w-[130px] text-xs rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="client">Cliente</SelectItem>
                          <SelectItem value="professional">Profissional</SelectItem>
                          <SelectItem value="company">Empresa</SelectItem>
                          <SelectItem value="enterprise">Empresa (Plano)</SelectItem>
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
                          <DropdownMenuItem onClick={() => openDocs(user)}>
                            <FileText className="w-3.5 h-3.5 mr-2" /> Ver documentos
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openPlanModal(user)}>
                            <CreditCard className="w-3.5 h-3.5 mr-2" /> Alterar plano
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDeleteId(user.id)} className="text-destructive">
                            <Trash2 className="w-3.5 h-3.5 mr-2" /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
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

      {/* Documents Dialog */}
      <Dialog open={!!docsUser} onOpenChange={(o) => !o && setDocsUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Documentos — {docsUser?.full_name}</DialogTitle>
          </DialogHeader>
          {docs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum documento enviado.</p>
          ) : (
            <div className="space-y-3">
              {docs.map((d: any) => (
                <a key={d.id} href={d.file_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 border rounded-xl hover:bg-muted/50 transition-colors">
                  <FileText className="w-5 h-5 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground capitalize">{d.type}</p>
                    <p className="text-xs text-muted-foreground">Status: {d.status} · {new Date(d.created_at).toLocaleDateString("pt-BR")}</p>
                  </div>
                  <Eye className="w-4 h-4 text-muted-foreground" />
                </a>
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
    </AdminLayout>
  );
};

export default AdminUsers;