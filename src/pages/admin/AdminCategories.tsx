import AdminLayout from "@/components/AdminLayout";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Save, X, ChevronDown, Upload, Image } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const availableIcons = [
  "Hammer", "Home", "Scissors", "HeartPulse", "Car", "Monitor",
  "Camera", "BriefcaseBusiness", "Tractor", "Truck", "PawPrint", "Briefcase",
  "Wrench", "Paintbrush", "Zap", "Droplets", "ShieldCheck", "BookOpen",
  "Dumbbell", "UtensilsCrossed", "Baby", "Laptop", "Sparkles", "Music",
  "Leaf", "Building2", "Cog", "Palette",
];

interface Category {
  id: string;
  name: string;
  slug: string;
  icon_name: string;
  icon_url: string | null;
  active: boolean;
  sort_order: number;
}

const AdminCategories = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editCat, setEditCat] = useState<Category | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", icon_name: "Briefcase", icon_url: "" as string, active: true, sort_order: 0 });
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetch = async () => {
    const { data } = await supabase.from("categories").select("*").order("sort_order");
    setCategories(data || []);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  const openNew = () => {
    setIsNew(true);
    setForm({ name: "", slug: "", icon_name: "Briefcase", icon_url: "", active: true, sort_order: categories.length });
    setEditCat({} as Category);
  };

  const openEdit = (cat: Category) => {
    setIsNew(false);
    setForm({ name: cat.name, slug: cat.slug, icon_name: cat.icon_name, icon_url: cat.icon_url || "", active: cat.active, sort_order: cat.sort_order });
    setEditCat(cat);
  };

  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `categories/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("uploads").upload(path, file, { upsert: true });
    if (error) {
      toast({ title: "Erro ao enviar imagem", variant: "destructive" });
      setUploading(false);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from("uploads").getPublicUrl(path);
    setForm(f => ({ ...f, icon_url: publicUrl }));
    setUploading(false);
  };

  const handleSave = async () => {
    if (!form.name || !form.slug) {
      toast({ title: "Preencha nome e slug", variant: "destructive" });
      return;
    }
    if (isNew) {
      await supabase.from("categories").insert(form);
      toast({ title: "Categoria criada!" });
    } else if (editCat) {
      await supabase.from("categories").update(form).eq("id", editCat.id);
      toast({ title: "Categoria atualizada!" });
    }
    setEditCat(null);
    fetch();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("categories").delete().eq("id", id);
    toast({ title: "Categoria removida" });
    fetch();
  };

  return (
    <AdminLayout title="Categorias & Ícones">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{categories.length} categorias</p>
        <button onClick={openNew} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" /> Nova categoria
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div>
      ) : (
        <div className="bg-card border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium text-muted-foreground">Ícone</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Nome</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Slug</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Ordem</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <tr key={cat.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="p-3">
                    {cat.icon_url ? (
                      <img src={cat.icon_url} alt={cat.name} className="w-8 h-8 object-contain rounded" />
                    ) : (
                      <span className="px-2 py-1 rounded-lg bg-accent text-xs font-mono">{cat.icon_name}</span>
                    )}
                  </td>
                  <td className="p-3 font-medium text-foreground">{cat.name}</td>
                  <td className="p-3 text-muted-foreground font-mono text-xs">{cat.slug}</td>
                  <td className="p-3 text-muted-foreground">{cat.sort_order}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${cat.active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {cat.active ? "Ativa" : "Inativa"}
                    </span>
                  </td>
                  <td className="p-3 flex gap-1">
                    <button onClick={() => openEdit(cat)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                      <Pencil className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <button onClick={() => handleDelete(cat.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors">
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!editCat} onOpenChange={(o) => !o && setEditCat(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{isNew ? "Nova Categoria" : "Editar Categoria"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Nome</label>
              <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Slug</label>
              <input value={form.slug} onChange={(e) => setForm(f => ({ ...f, slug: e.target.value }))}
                placeholder="ex: eletricista"
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 font-mono" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Ícone personalizado (PNG/SVG)</label>
              <div className="flex items-center gap-3">
                {form.icon_url ? (
                  <div className="relative">
                    <img src={form.icon_url} alt="icon" className="w-12 h-12 object-contain rounded-xl border p-1" />
                    <button onClick={() => setForm(f => ({ ...f, icon_url: "" }))} className="absolute -top-1 -right-1 w-4 h-4 bg-destructive rounded-full flex items-center justify-center">
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => fileRef.current?.click()} disabled={uploading}
                    className="flex items-center gap-2 px-3 py-2 border rounded-xl text-sm hover:bg-muted transition-colors">
                    {uploading ? <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full" /> : <Upload className="w-4 h-4" />}
                    {uploading ? "Enviando..." : "Enviar imagem"}
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" onChange={handleIconUpload} className="hidden" />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Se enviado, substitui o ícone padrão abaixo</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Ícone padrão (fallback)</label>
              <div className="relative">
                <select value={form.icon_name} onChange={(e) => setForm(f => ({ ...f, icon_name: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 appearance-none">
                  {availableIcons.map((icon) => (
                    <option key={icon} value={icon}>{icon}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Ordem</label>
                <input type="number" value={form.sort_order} onChange={(e) => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.active} onChange={(e) => setForm(f => ({ ...f, active: e.target.checked }))}
                    className="w-4 h-4 rounded border-border text-primary" />
                  <span className="text-sm text-foreground">Ativa</span>
                </label>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditCat(null)} className="flex-1 py-2.5 rounded-xl border text-sm font-medium hover:bg-muted transition-colors flex items-center justify-center gap-1">
                <X className="w-4 h-4" /> Cancelar
              </button>
              <button onClick={handleSave} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-1">
                <Save className="w-4 h-4" /> Salvar
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminCategories;
