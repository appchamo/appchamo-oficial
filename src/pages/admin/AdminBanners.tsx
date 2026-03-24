import AdminLayout from "@/components/AdminLayout";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Save, X, ChevronDown, Monitor, Smartphone, Layers } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ImageCropUpload from "@/components/ImageCropUpload";

interface Banner {
  id: string;
  title: string;
  image_url: string;
  image_url_mobile: string;
  link_url: string;
  position: string;
  sort_order: number;
  width: string;
  height: string;
  active: boolean;
  carousel_group: string | null;
}

const positionLabels: Record<string, string> = {
  top: "Topo (acima de tudo)",
  carousel: "Carrossel principal (após patrocinadores)",
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
    title: "",
    image_url: "",
    image_url_mobile: "",
    link_url: "#",
    position: "below_categories",
    sort_order: 0,
    width: "100%",
    height: "auto",
    active: true,
    carousel_group: null as string | null,
  });

  // Estado do modo carrossel
  const [carouselMode, setCarouselMode] = useState(false);
  const [linkedBannerId, setLinkedBannerId] = useState<string>("");

  const fetchData = async () => {
    const { data } = await supabase.from("banners" as any).select("*").order("sort_order");
    setBanners((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const openNew = () => {
    setIsNew(true);
    setCarouselMode(false);
    setLinkedBannerId("");
    setForm({
      title: "",
      image_url: "",
      image_url_mobile: "",
      link_url: "#",
      position: "below_categories",
      sort_order: banners.length,
      width: "100%",
      height: "auto",
      active: true,
      carousel_group: null,
    });
    setEditItem({} as Banner);
  };

  const openEdit = (item: Banner) => {
    setIsNew(false);
    setCarouselMode(false);
    setLinkedBannerId("");
    setForm({
      title: item.title,
      image_url: item.image_url,
      image_url_mobile: item.image_url_mobile || "",
      link_url: item.link_url,
      position: item.position,
      sort_order: item.sort_order,
      width: item.width,
      height: item.height,
      active: item.active,
      carousel_group: item.carousel_group || null,
    });
    setEditItem(item);
  };

  // Quando o usuário seleciona um banner para agrupar em carrossel
  const handleLinkedBannerChange = (bannerId: string) => {
    setLinkedBannerId(bannerId);
    if (!bannerId) return;
    const linked = banners.find(b => b.id === bannerId);
    if (linked) {
      // Herda a posição do banner selecionado
      setForm(f => ({ ...f, position: linked.position }));
    }
  };

  const handleSave = async () => {
    if (!form.image_url) {
      toast({ title: "Envie a imagem desktop", variant: "destructive" });
      return;
    }

    let finalCarouselGroup = form.carousel_group;

    // Modo carrossel: descobrir/criar o grupo
    if (carouselMode && linkedBannerId) {
      const linkedBanner = banners.find(b => b.id === linkedBannerId);
      if (linkedBanner) {
        if (linkedBanner.carousel_group) {
          // Usar o grupo já existente do banner linkado
          finalCarouselGroup = linkedBanner.carousel_group;
        } else {
          // Criar novo grupo usando o id do banner linkado como chave
          finalCarouselGroup = linkedBanner.id;
          // Atualizar o banner linkado com o grupo
          await supabase
            .from("banners" as any)
            .update({ carousel_group: finalCarouselGroup } as any)
            .eq("id", linkedBanner.id);
        }
        // Herdar posição do banner linkado
        form.position = linkedBanner.position;
      }
    }

    const payload = { ...form, carousel_group: finalCarouselGroup };

    if (isNew) {
      await supabase.from("banners" as any).insert(payload as any);
      toast({ title: "Banner criado!" });
    } else if (editItem && editItem.id) {
      await supabase.from("banners" as any).update(payload as any).eq("id", editItem.id);
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

  // Contagem por grupo para exibição na lista
  const groupCounts: Record<string, number> = {};
  banners.forEach(b => {
    if (b.carousel_group) {
      groupCounts[b.carousel_group] = (groupCounts[b.carousel_group] || 0) + 1;
    }
  });

  // Banners disponíveis para linkar (todos ativos)
  const availableBanners = banners.filter(b => !editItem || b.id !== (editItem as Banner).id);

  return (
    <AdminLayout title="Banners">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{banners.length} banners</p>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" /> Novo banner
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : banners.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Nenhum banner cadastrado</div>
      ) : (
        <div className="flex flex-col gap-3">
          {banners.map((b) => {
            const groupCount = b.carousel_group ? (groupCounts[b.carousel_group] || 1) : 0;
            return (
              <div key={b.id} className="bg-card border rounded-xl p-4 flex items-center gap-4">
                <div className="w-20 h-14 rounded-lg overflow-hidden bg-muted flex-shrink-0 flex gap-1 p-1">
                  <img src={b.image_url} alt="Desktop" className="w-1/2 h-full object-cover rounded-sm" title="Desktop" />
                  {b.image_url_mobile && (
                    <img src={b.image_url_mobile} alt="Mobile" className="w-1/2 h-full object-cover rounded-sm" title="Mobile" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground truncate">{b.title || "Sem título"}</p>
                  <div className="flex items-center gap-2 flex-wrap mt-0.5">
                    <p className="text-xs text-muted-foreground">{positionLabels[b.position] || b.position}</p>
                    {groupCount > 1 && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                        <Layers className="w-3 h-3" /> Carrossel ({groupCount})
                      </span>
                    )}
                  </div>
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
            );
          })}
        </div>
      )}

      <Dialog open={!!editItem} onOpenChange={(o) => !o && setEditItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isNew ? "Novo Banner" : "Editar Banner"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">

            {/* Título */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Título (opcional)</label>
              <input
                value={form.title}
                onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Imagem Desktop */}
            <div className="p-3 border-2 border-dashed rounded-2xl bg-muted/20">
              <label className="text-xs font-bold text-foreground mb-3 flex items-center gap-2 uppercase tracking-tighter">
                <Monitor className="w-4 h-4 text-primary" /> IMAGEM DESKTOP (1080x460)
              </label>
              {form.image_url ? (
                <div className="relative rounded-xl overflow-hidden border mb-2">
                  <img src={form.image_url} alt="Banner" className="w-full h-24 object-cover" />
                  <button
                    onClick={() => setForm(f => ({ ...f, image_url: "" }))}
                    className="absolute top-1 right-1 p-1 rounded-full bg-destructive text-destructive-foreground"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <ImageCropUpload
                  onUpload={(url) => setForm(f => ({ ...f, image_url: url }))}
                  aspect={1080 / 460}
                  shape="rect"
                  bucketPath="branding"
                  label="Upload Desktop (1080x460)"
                />
              )}
            </div>

            {/* Imagem Mobile */}
            <div className="p-3 border-2 border-dashed rounded-2xl bg-muted/20">
              <label className="text-xs font-bold text-foreground mb-3 flex items-center gap-2 uppercase tracking-tighter">
                <Smartphone className="w-4 h-4 text-primary" /> IMAGEM MOBILE (1080x360)
              </label>
              {form.image_url_mobile ? (
                <div className="relative rounded-xl overflow-hidden border mb-2">
                  <img src={form.image_url_mobile} alt="Banner Mobile" className="w-full h-24 object-cover" />
                  <button
                    onClick={() => setForm(f => ({ ...f, image_url_mobile: "" }))}
                    className="absolute top-1 right-1 p-1 rounded-full bg-destructive text-destructive-foreground"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <ImageCropUpload
                  onUpload={(url) => setForm(f => ({ ...f, image_url_mobile: url }))}
                  aspect={1080 / 360}
                  shape="rect"
                  bucketPath="branding"
                  label="Upload Mobile (1080x360)"
                />
              )}
            </div>

            {/* Link */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Link (URL ao clicar)</label>
              <input
                value={form.link_url}
                onChange={(e) => setForm(f => ({ ...f, link_url: e.target.value }))}
                placeholder="https://..."
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* ── SEÇÃO CARROSSEL ── */}
            {isNew && availableBanners.length > 0 && (
              <div className="border rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => { setCarouselMode(v => !v); setLinkedBannerId(""); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${carouselMode ? "bg-blue-50 dark:bg-blue-900/20" : "bg-muted/40 hover:bg-muted/60"}`}
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${carouselMode ? "border-blue-500 bg-blue-500" : "border-muted-foreground/40"}`}>
                    {carouselMode && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${carouselMode ? "text-blue-700 dark:text-blue-400" : "text-foreground"}`}>
                      Adicionar como carrossel com banner existente
                    </p>
                    <p className="text-xs text-muted-foreground">Este banner vai girar junto com outro</p>
                  </div>
                  <Layers className={`w-4 h-4 ${carouselMode ? "text-blue-500" : "text-muted-foreground"}`} />
                </button>

                {carouselMode && (
                  <div className="p-4 border-t bg-blue-50/50 dark:bg-blue-900/10 space-y-3">
                    <p className="text-xs text-muted-foreground font-medium">Selecione o banner existente que vai girar junto:</p>
                    <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                      {availableBanners.map(b => {
                        const gCount = b.carousel_group ? (groupCounts[b.carousel_group] || 1) : 1;
                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => handleLinkedBannerChange(b.id)}
                            className={`flex items-center gap-3 p-2.5 rounded-xl border text-left transition-colors ${linkedBannerId === b.id ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-border hover:bg-muted/50"}`}
                          >
                            <img
                              src={b.image_url}
                              alt={b.title || "Banner"}
                              className="w-14 h-10 rounded-lg object-cover flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{b.title || "Sem título"}</p>
                              <p className="text-xs text-muted-foreground">{positionLabels[b.position] || b.position}</p>
                              {b.carousel_group && gCount > 1 && (
                                <span className="text-[10px] text-blue-600 font-semibold">
                                  Já tem carrossel ({gCount} banners)
                                </span>
                              )}
                            </div>
                            {linkedBannerId === b.id && (
                              <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                                <div className="w-1.5 h-1.5 rounded-full bg-white" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {linkedBannerId && (
                      <div className="flex items-center gap-2 p-2.5 rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-medium">
                        <Layers className="w-3.5 h-3.5 flex-shrink-0" />
                        Posição herdada automaticamente do banner selecionado
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Posição na Home (visível quando não está em modo carrossel com banner selecionado) */}
            {!(carouselMode && linkedBannerId) && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Posição na Home</label>
                <div className="relative">
                  <select
                    value={form.position}
                    onChange={(e) => setForm(f => ({ ...f, position: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 appearance-none"
                  >
                    {Object.entries(positionLabels).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>
            )}

            {/* Ordem + Ativo */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Ordem</label>
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm(f => ({ ...f, active: e.target.checked }))}
                    className="w-4 h-4 rounded border-border text-primary"
                  />
                  <span className="text-sm text-foreground">Banner Ativo</span>
                </label>
              </div>
            </div>

            <div className="flex gap-2 pt-3">
              <button
                onClick={() => setEditItem(null)}
                className="flex-1 py-3 rounded-xl border text-sm font-medium hover:bg-muted transition-colors flex items-center justify-center gap-1"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-black hover:bg-primary/90 transition-colors flex items-center justify-center gap-1"
              >
                <Save className="w-4 h-4" /> SALVAR BANNER
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminBanners;
