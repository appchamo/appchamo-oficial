import AdminLayout from "@/components/AdminLayout";
import { Plus, ExternalLink, MoreHorizontal, Eye, EyeOff, Pencil, Trash2, Power, MapPin, Package } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { translateError } from "@/lib/errorMessages";
import { ESTADOS_BR, fetchCitiesByState } from "@/lib/brazilLocations";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ImageCropUpload from "@/components/ImageCropUpload";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type LocationScope = "nationwide" | "state" | "city";
type WeeklyPlan = "free" | "pack_14" | "pack_28";

interface Sponsor {
  id: string;
  name: string;
  niche: string | null;
  link_url: string;
  logo_url: string | null;
  active: boolean;
  clicks: number;
  sort_order: number;
  location_scope: string | null;
  location_state: string | null;
  location_city: string | null;
  user_id: string | null;
  weekly_plan: WeeklyPlan;
}

const PLAN_LABELS: Record<WeeklyPlan, string> = {
  free: "Grátis (4/sem)",
  pack_14: "Pacote 14/sem",
  pack_28: "Pacote 28/sem",
};

const emptyForm = () => ({
  name: "",
  niche: "",
  link_url: "",
  logo_url: "",
  location_scope: "nationwide" as LocationScope,
  location_state: "",
  location_city: "",
  weekly_plan: "free" as WeeklyPlan,
  // acesso (só no cadastro)
  access_email: "",
  access_password: "",
});

const AdminSponsors = () => {
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Sponsor | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [cities, setCities] = useState<string[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);

  const fetchSponsors = async () => {
    const { data, error } = await supabase.from("sponsors").select("*").order("sort_order");
    if (error) { toast({ title: "Erro ao carregar", description: translateError(error.message), variant: "destructive" }); return; }
    setSponsors((data || []) as Sponsor[]);
    setLoading(false);
  };

  useEffect(() => { fetchSponsors(); }, []);

  useEffect(() => {
    if ((form.location_scope !== "state" && form.location_scope !== "city") || !form.location_state) {
      setCities([]); return;
    }
    setLoadingCities(true);
    fetchCitiesByState(form.location_state).then((list) => {
      setCities(list);
      setLoadingCities(false);
      if (form.location_city && !list.includes(form.location_city)) setForm((f) => ({ ...f, location_city: "" }));
    }).catch(() => setLoadingCities(false));
  }, [form.location_scope, form.location_state]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setCities([]);
    setDialogOpen(true);
  };

  const openEdit = (s: Sponsor) => {
    setEditing(s);
    setShowPassword(false);
    const scope = (s.location_scope === "state" || s.location_scope === "city" ? s.location_scope : "nationwide") as LocationScope;
    setForm({
      ...emptyForm(),
      name: s.name, niche: s.niche || "", link_url: s.link_url, logo_url: s.logo_url || "",
      location_scope: scope, location_state: s.location_state || "", location_city: s.location_city || "",
      weekly_plan: s.weekly_plan || "free",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: "Nome é obrigatório", variant: "destructive" }); return; }
    if (form.location_scope === "state" && !form.location_state) { toast({ title: "Selecione o estado", variant: "destructive" }); return; }
    if (form.location_scope === "city" && (!form.location_state || !form.location_city)) { toast({ title: "Selecione o estado e a cidade", variant: "destructive" }); return; }

    // Validação do acesso
    if (!editing) {
      if (!form.access_email.trim()) { toast({ title: "Email de acesso é obrigatório", variant: "destructive" }); return; }
      if (!form.access_password.trim() || form.access_password.length < 6) { toast({ title: "Senha deve ter ao menos 6 caracteres", variant: "destructive" }); return; }
    }
    if (editing && form.access_password.trim() && form.access_password.length < 6) {
      toast({ title: "Senha deve ter ao menos 6 caracteres", variant: "destructive" }); return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name, niche: form.niche || null, link_url: form.link_url, logo_url: form.logo_url || null,
        location_scope: form.location_scope,
        location_state: form.location_scope === "state" || form.location_scope === "city" ? form.location_state || null : null,
        location_city: form.location_scope === "city" ? form.location_city || null : null,
        weekly_plan: form.weekly_plan,
      };

      if (editing) {
        const { error } = await supabase.from("sponsors").update(payload).eq("id", editing.id);
        if (error) throw new Error(translateError(error.message));

        // Se preencheu email ou senha, redefine o acesso
        if (form.access_email.trim() || form.access_password.trim()) {
          const { data: accData, error: accErr } = await supabase.functions.invoke("admin-manage", {
            body: {
              action: "create_sponsor_user",
              email: form.access_email.trim() || undefined,
              password: form.access_password.trim() || undefined,
              sponsorId: editing.id,
            },
          });
          if (accErr || !accData?.success) throw new Error(accErr?.message || accData?.error || "Erro ao atualizar acesso");
        }

        await logAction("update_sponsor", "sponsor", editing.id, { name: form.name });
        toast({ title: "Patrocinador atualizado!" });
      } else {
        // 1. Cria o sponsor
        const maxOrder = sponsors.length > 0 ? Math.max(...sponsors.map(s => s.sort_order)) + 1 : 1;
        const { data: newSponsor, error: insertErr } = await supabase
          .from("sponsors")
          .insert({ ...payload, sort_order: maxOrder })
          .select("id")
          .single();
        if (insertErr || !newSponsor) throw new Error(translateError(insertErr?.message || "Erro ao criar patrocinador"));

        // 2. Cria a conta de acesso via Edge Function
        const { data: accData, error: accErr } = await supabase.functions.invoke("admin-manage", {
          body: {
            action: "create_sponsor_user",
            email: form.access_email.trim(),
            password: form.access_password,
            sponsorId: newSponsor.id,
          },
        });
        if (accErr || !accData?.success) {
          // Rollback: remove sponsor criado
          await supabase.from("sponsors").delete().eq("id", newSponsor.id);
          throw new Error(accErr?.message || accData?.error || "Erro ao criar acesso");
        }

        await logAction("create_sponsor", "sponsor", newSponsor.id, { name: form.name, email: form.access_email });
        toast({ title: "Patrocinador criado!", description: `Acesso: ${form.access_email}` });
      }

      setDialogOpen(false);
      fetchSponsors();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("sponsors").delete().eq("id", deleteId);
    if (error) { toast({ title: "Erro ao deletar", description: translateError(error.message), variant: "destructive" }); return; }
    await logAction("delete_sponsor", "sponsor", deleteId);
    toast({ title: "Patrocinador removido!" });
    setDeleteId(null);
    fetchSponsors();
  };

  const toggleActive = async (s: Sponsor) => {
    const { error } = await supabase.from("sponsors").update({ active: !s.active }).eq("id", s.id);
    if (error) { toast({ title: "Erro", description: translateError(error.message), variant: "destructive" }); return; }
    await logAction(s.active ? "deactivate_sponsor" : "activate_sponsor", "sponsor", s.id);
    toast({ title: s.active ? "Desativado" : "Ativado" });
    fetchSponsors();
  };

  const handleResetAccess = async (s: Sponsor) => {
    const email = prompt("Novo email de acesso:");
    if (!email) return;
    const password = prompt("Nova senha (mín. 6 caracteres):");
    if (!password || password.length < 6) { toast({ title: "Senha inválida", variant: "destructive" }); return; }
    const { data, error } = await supabase.functions.invoke("admin-manage", {
      body: { action: "create_sponsor_user", email: email.trim(), password, sponsorId: s.id },
    });
    if (error || !data?.success) { toast({ title: "Erro", description: error?.message || data?.error, variant: "destructive" }); return; }
    toast({ title: "Acesso redefinido!", description: email });
    fetchSponsors();
  };

  const logAction = async (action: string, target_type: string, target_id: string | null, details?: any) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase.from("admin_logs").insert({ admin_user_id: session.user.id, action, target_type, target_id, details: details || null });
    }
  };

  const f = (key: keyof ReturnType<typeof emptyForm>, val: string) => setForm((prev) => ({ ...prev, [key]: val }));

  return (
    <AdminLayout title="Patrocinadores">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{sponsors.length} patrocinadores</p>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" /> Adicionar
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {sponsors.map((s) => (
            <div key={s.id} className="bg-card border rounded-xl p-4 flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
                {s.logo_url ? <img src={s.logo_url} alt={s.name} className="w-full h-full object-contain p-1" /> : <span className="text-sm font-bold text-muted-foreground">{s.name.slice(0, 2).toUpperCase()}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm text-foreground">{s.name}</p>
                  {!s.active && <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground">Inativo</span>}
                  {s.user_id && <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700">Com acesso</span>}
                </div>
                <p className="text-xs text-muted-foreground">{s.niche || "Sem nicho"}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {!s.location_scope || s.location_scope === "nationwide" ? "Todo o Brasil" : s.location_scope === "state" ? s.location_state || "—" : [s.location_city, s.location_state].filter(Boolean).join(" - ")}
                  </p>
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><Package className="w-3 h-3" /> {PLAN_LABELS[s.weekly_plan] || "Grátis"}</span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><Eye className="w-3 h-3" /> {s.clicks} cliques</span>
                  {s.link_url && <a href={s.link_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-primary hover:underline"><ExternalLink className="w-3 h-3" /> Link</a>}
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-1.5 rounded-lg hover:bg-muted transition-colors"><MoreHorizontal className="w-4 h-4 text-muted-foreground" /></button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => openEdit(s)}><Pencil className="w-3.5 h-3.5 mr-2" /> Editar</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleResetAccess(s)}><Eye className="w-3.5 h-3.5 mr-2" /> Redefinir acesso</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => toggleActive(s)}><Power className="w-3.5 h-3.5 mr-2" /> {s.active ? "Desativar" : "Ativar"}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setDeleteId(s.id)} className="text-destructive"><Trash2 className="w-3.5 h-3.5 mr-2" /> Excluir</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!saving) setDialogOpen(o); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar patrocinador" : "Novo patrocinador"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Logo */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Logo</label>
              <ImageCropUpload aspect={1} shape="round" bucketPath="sponsors" currentImage={form.logo_url || null} onUpload={(url) => f("logo_url", url)} label="Upload logo" />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Nome *</label>
              <input value={form.name} onChange={(e) => f("name", e.target.value)} className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Nicho / Segmento</label>
              <input value={form.niche} onChange={(e) => f("niche", e.target.value)} placeholder="Ex: Barbearia, Pizzaria..." className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Link externo (site, Instagram...)</label>
              <input value={form.link_url} onChange={(e) => f("link_url", e.target.value)} className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" placeholder="https://..." />
            </div>

            {/* Plano semanal */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Plano de novidades</label>
              <div className="flex flex-col gap-2">
                {(["free", "pack_14", "pack_28"] as WeeklyPlan[]).map((plan) => (
                  <label key={plan} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="weekly_plan" checked={form.weekly_plan === plan} onChange={() => setForm((prev) => ({ ...prev, weekly_plan: plan }))} />
                    <span className="text-sm">{PLAN_LABELS[plan]}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Localização */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Onde aparece</label>
              <div className="flex flex-col gap-2">
                {([["nationwide", "Todo o Brasil"], ["state", "Apenas um Estado"], ["city", "Apenas uma Cidade"]] as [LocationScope, string][]).map(([val, label]) => (
                  <label key={val} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="location_scope" checked={form.location_scope === val}
                      onChange={() => setForm((p) => ({ ...p, location_scope: val, location_state: "", location_city: "" }))} />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
            </div>
            {(form.location_scope === "state" || form.location_scope === "city") && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Estado</label>
                <select value={form.location_state} onChange={(e) => setForm((p) => ({ ...p, location_state: e.target.value, location_city: "" }))} className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="">Selecione</option>
                  {ESTADOS_BR.map((st) => <option key={st.sigla} value={st.sigla}>{st.nome} ({st.sigla})</option>)}
                </select>
              </div>
            )}
            {form.location_scope === "city" && form.location_state && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Cidade</label>
                <select value={form.location_city} onChange={(e) => setForm((p) => ({ ...p, location_city: e.target.value }))} disabled={loadingCities} className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="">{loadingCities ? "Carregando..." : "Selecione"}</option>
                  {cities.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}

            {/* Acesso do patrocinador */}
            <div className="border-t pt-4 space-y-3">
              <p className="text-xs font-semibold text-foreground">Acesso do patrocinador</p>
              {editing ? (
                <p className="text-[11px] text-muted-foreground -mt-2">Preencha para redefinir o acesso. Deixe em branco para manter o atual.</p>
              ) : (
                <p className="text-[11px] text-muted-foreground -mt-2">O patrocinador vai usar esse email e senha para entrar no app.</p>
              )}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Email {!editing && "*"}</label>
                <input type="email" value={form.access_email} onChange={(e) => f("access_email", e.target.value)}
                  placeholder={editing ? "Deixe vazio para manter" : "email@empresa.com"}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Senha {!editing && "*"}</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={form.access_password}
                    onChange={(e) => f("access_password", e.target.value)}
                    placeholder={editing ? "Deixe vazio para manter" : "Mínimo 6 caracteres"}
                    className="w-full border rounded-xl px-3 py-2.5 pr-10 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <button type="button" onClick={() => setShowPassword((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <button onClick={handleSave} disabled={saving} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60">
              {saving ? "Salvando..." : editing ? "Salvar alterações" : "Criar patrocinador"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Excluir patrocinador?</AlertDialogTitle><AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default AdminSponsors;
