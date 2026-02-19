import AdminLayout from "@/components/AdminLayout";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Save, X, ChevronDown, Image } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ImageCropUpload from "@/components/ImageCropUpload";

interface Banner {
  id: string;
  title: string;
  image_url: string;
  link_url: string;
  position: string;
  sort_order: number;
  width: string;
  height: string;
  active: boolean;
}

const positionLabels: Record<string, string> = {
  top: "Topo (acima de tudo)",
  below_benefits: "Abaixo dos benefícios",
  below_sponsors: "Abaixo dos patrocinadores",
  below_search: "Abaixo da busca",
  below_featured: "Abaixo dos destaques",
  below_categories: "Abaixo das categorias",
  bottom: "Final da página",
};

const AdminBanners = () => {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState<Banner | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState({
    title: "", image_url: "", link_url: "#", position: "below_categories",
    sort_order: 0, width: "100%", height: "120px", active: true,
  });

  const fetchData = async () => {
    const { data } = await supabase.from("banners" as any).select("*").order("sort_order");
    setBanners((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const openNew = () => {
    setIsNew(true);
    setForm({ title: "", image_url: "", link_url: "#", position: "below_categories", sort_order: banners.length, width: "100%", height: "120px", active: true });
    setEditItem({} as Banner);
  };

  const openEdit = (item: Banner) => {
    setIsNew(false);
    setForm({ title: item.title, image_url: item.image_url, link_url: item.link_url, position: item.position, sort_order: item.sort_order, width: item.width, height: item.height, active: item.active });
    setEditItem(item);
  };

  const handleSave = async () => {
    if (!form.image_url) { toast({ title: "Envie uma imagem", variant: "destructive" }); return; }
    if (isNew) {
      await supabase.from("banners" as any).insert(form as any);
      toast({ title: "Banner criado!" });
    } else if (editItem) {
      await supabase.from("banners" as any).update(form as any).eq("id", editItem.id);
      toast({ title: "Banner atualizado!" });
    }
    setEditItem(null);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("banners" as any).delete().eq("id", id);
    toast({ title: "Banner removido" });
    fetchData();
  };

  return (
    <AdminLayout title="Banners">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{banners.length} banners</p>
        <button onClick={openNew} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" /> Novo banner
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div>
      ) : banners.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Nenhum banner cadastrado</div>
      ) : (
        <div className="flex flex-col gap-3">
          {banners.map((b) => (
            <div key={b.id} className="bg-card border rounded-xl p-4 flex items-center gap-4">
              <div className="w-20 h-14 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                <img src={b.image_url} alt={b.title} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-foreground truncate">{b.title || "Sem título"}</p>
                <p className="text-xs text-muted-foreground">{positionLabels[b.position] || b.position} · {b.width} × {b.height}</p>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${b.active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                {b.active ? "Ativo" : "Inativo"}
              </span>
              <div className="flex gap-1">
                <button onClick={() => openEdit(b)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                  <Pencil className="w-4 h-4 text-muted-foreground" />
                </button>
                <button onClick={() => handleDelete(b.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors">
                  <Trash2 className="w-4 h-4 text-destructive" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editItem} onOpenChange={(o) => !o && setEditItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isNew ? "Novo Banner" : "Editar Banner"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Título (opcional)</label>
              <input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Imagem *</label>
              {form.image_url ? (
                <div className="relative rounded-xl overflow-hidden border mb-2">
                  <img src={form.image_url} alt="Banner" className="w-full h-24 object-cover" />
                  <button onClick={() => setForm(f => ({ ...f, image_url: "" }))} className="absolute top-1 right-1 p-1 rounded-full bg-destructive text-destructive-foreground">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <ImageCropUpload
                  onUpload={(url) => setForm(f => ({ ...f, image_url: url }))}
                  aspect={16/5}
                  shape="rect"
                  bucketPath="branding"
                  label="Enviar imagem do banner"
                />
              )}
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Link (URL ao clicar)</label>
              <input value={form.link_url} onChange={(e) => setForm(f => ({ ...f, link_url: e.target.value }))}
                placeholder="https://..."
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Posição na Home</label>
              <div className="relative">
                <select value={form.position} onChange={(e) => setForm(f => ({ ...f, position: e.target.value }))}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 appearance-none">
                  {Object.entries(positionLabels).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Largura</label>
                <input value={form.width} onChange={(e) => setForm(f => ({ ...f, width: e.target.value }))}
                  placeholder="100%"
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Altura</label>
                <input value={form.height} onChange={(e) => setForm(f => ({ ...f, height: e.target.value }))}
                  placeholder="120px"
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
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
                  <span className="text-sm text-foreground">Ativo</span>
                </label>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditItem(null)} className="flex-1 py-2.5 rounded-xl border text-sm font-medium hover:bg-muted transition-colors flex items-center justify-center gap-1">
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

export default AdminBanners;
