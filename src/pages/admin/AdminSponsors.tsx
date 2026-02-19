import AdminLayout from "@/components/AdminLayout";
import { Plus, ExternalLink, MoreHorizontal, Eye, Pencil, Trash2, Power, GripVertical } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { translateError } from "@/lib/errorMessages";
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

interface Sponsor {
  id: string;
  name: string;
  niche: string | null;
  link_url: string;
  logo_url: string | null;
  active: boolean;
  clicks: number;
  sort_order: number;
}

const AdminSponsors = () => {
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Sponsor | null>(null);
  const [form, setForm] = useState({ name: "", niche: "", link_url: "", logo_url: "" });

  const fetchSponsors = async () => {
    const { data, error } = await supabase.from("sponsors").select("*").order("sort_order");
    if (error) { toast({ title: "Erro ao carregar", description: translateError(error.message), variant: "destructive" }); return; }
    setSponsors(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchSponsors(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", niche: "", link_url: "", logo_url: "" });
    setDialogOpen(true);
  };

  const openEdit = (s: Sponsor) => {
    setEditing(s);
    setForm({ name: s.name, niche: s.niche || "", link_url: s.link_url, logo_url: s.logo_url || "" });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: "Nome é obrigatório", variant: "destructive" }); return; }
    if (editing) {
      const { error } = await supabase.from("sponsors").update({
        name: form.name, niche: form.niche || null, link_url: form.link_url, logo_url: form.logo_url || null,
      }).eq("id", editing.id);
      if (error) { toast({ title: "Erro ao atualizar", description: translateError(error.message), variant: "destructive" }); return; }
      await logAction("update_sponsor", "sponsor", editing.id, { name: form.name });
      toast({ title: "Patrocinador atualizado!" });
    } else {
      const maxOrder = sponsors.length > 0 ? Math.max(...sponsors.map(s => s.sort_order)) + 1 : 1;
      const { error } = await supabase.from("sponsors").insert({
        name: form.name, niche: form.niche || null, link_url: form.link_url, logo_url: form.logo_url || null, sort_order: maxOrder,
      });
      if (error) { toast({ title: "Erro ao criar", description: translateError(error.message), variant: "destructive" }); return; }
      await logAction("create_sponsor", "sponsor", null, { name: form.name });
      toast({ title: "Patrocinador criado!" });
    }
    setDialogOpen(false);
    fetchSponsors();
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

  const logAction = async (action: string, target_type: string, target_id: string | null, details?: any) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase.from("admin_logs").insert({
        admin_user_id: session.user.id, action, target_type, target_id, details: details || null,
      });
    }
  };

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
                {s.logo_url ? (
                  <img src={s.logo_url} alt={s.name} className="w-full h-full object-contain p-1" />
                ) : (
                  <span className="text-sm font-bold text-muted-foreground">{s.name.slice(0, 2).toUpperCase()}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm text-foreground">{s.name}</p>
                  {!s.active && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground">Inativo</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{s.niche || "Sem nicho"}</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Eye className="w-3 h-3" /> {s.clicks} cliques
                  </span>
                  <a href={s.link_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-primary hover:underline">
                    <ExternalLink className="w-3 h-3" /> Link
                  </a>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                    <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => openEdit(s)}><Pencil className="w-3.5 h-3.5 mr-2" /> Editar</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => toggleActive(s)}><Power className="w-3.5 h-3.5 mr-2" /> {s.active ? "Desativar" : "Ativar"}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setDeleteId(s.id)} className="text-destructive"><Trash2 className="w-3.5 h-3.5 mr-2" /> Excluir</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar patrocinador" : "Novo patrocinador"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Logo</label>
              <ImageCropUpload
                aspect={1}
                shape="round"
                bucketPath="sponsors"
                currentImage={form.logo_url || null}
                onUpload={(url) => setForm((f) => ({ ...f, logo_url: url }))}
                label="Upload logo"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Nome *</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Nicho</label>
              <input value={form.niche} onChange={(e) => setForm((f) => ({ ...f, niche: e.target.value }))}
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Link URL</label>
              <input value={form.link_url} onChange={(e) => setForm((f) => ({ ...f, link_url: e.target.value }))}
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" placeholder="https://..." />
            </div>
            <button onClick={handleSave} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
              {editing ? "Salvar alterações" : "Criar patrocinador"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir patrocinador?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
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
