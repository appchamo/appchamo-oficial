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
  popup: "Popup (abre ao entrar no app)",
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

  // ── Popups (formato/config próprios, separados dos banners) ──
  const [popupItem, setPopupItem] = useState<Banner | null>(null);
  const [popupIsNew, setPopupIsNew] = useState(false);
  const [popupForm, setPopupForm] = useState({ title: "", image_url: "", link_url: "", active: true, sort_order: 0 });

  const fetchData = async () => {
    const { data, error } = await supabase.from("banners" as any).select("*").order("sort_order");
    if (error) {
      toast({ title: "Erro ao carregar banners", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
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
    let finalPosition = form.position;

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
          const { error: linkError } = await supabase
            .from("banners" as any)
            .update({ carousel_group: finalCarouselGroup } as any)
            .eq("id", linkedBanner.id);
          if (linkError) {
            toast({ title: "Erro ao agrupar carrossel", description: linkError.message, variant: "destructive" });
            return;
          }
        }
        // Herdar posição do banner linkado (sem mutar o form)
        finalPosition = linkedBanner.position;
      }
    }

    const payload = { ...form, carousel_group: finalCarouselGroup, position: finalPosition };

    if (isNew) {
      const { error } = await supabase.from("banners" as any).insert(payload as any);
      if (error) {
        toast({ title: "Erro ao criar banner", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Banner criado!" });
    } else if (editItem && editItem.id) {
      const { error } = await supabase.from("banners" as any).update(payload as any).eq("id", editItem.id);
      if (error) {
        toast({ title: "Erro ao atualizar banner", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Banner atualizado!" });
    }

    setEditItem(null);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("banners" as any).delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao remover banner", description: error.message, variant: "destructive" });
      return;
    }
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

  // Separa popups dos banners de conteúdo (cada um tem sua seção/formulário).
  const popups = banners.filter(b => b.position === "popup");
  const contentBanners = banners.filter(b => b.position !== "popup");

  // Banners disponíveis para linkar em carrossel (exclui o próprio e os popups).
  const availableBanners = contentBanners.filter(b => !editItem || b.id !== (editItem as Banner).id);

  const openNewPopup = () => {
    setPopupIsNew(true);
    setPopupForm({ title: "", image_url: "", link_url: "", active: true, sort_order: popups.length });
    setPopupItem({} as Banner);
  };

  const openEditPopup = (item: Banner) => {
    setPopupIsNew(false);
    setPopupForm({
      title: item.title || "",
      image_url: item.image_url || "",
      link_url: item.link_url && item.link_url !== "#" ? item.link_url : "",
      active: item.active,
      sort_order: item.sort_order,
    });
    setPopupItem(item);
  };

  const savePopup = async () => {
    if (!popupForm.image_url) {
      toast({ title: "Envie a imagem do popup", variant: "destructive" });
      return;
    }
    // Máximo de 3 popups ativos ao mesmo tempo.
    const otherActive = popups.filter(p => p.active && (!popupItem?.id || p.id !== popupItem.id)).length;
    if (popupForm.active && otherActive >= 3) {
      toast({ title: "Limite de 3 popups ativos", description: "Desative um popup antes de ativar outro.", variant: "destructive" });
      return;
    }
    const payload = {
      title: popupForm.title.trim(),
      image_url: popupForm.image_url,
      image_url_mobile: popupForm.image_url, // popup usa a mesma imagem vertical em todos os aparelhos
      link_url: popupForm.link_url.trim() || "#",
      position: "popup",
      sort_order: popupForm.sort_order || 0,
      width: "100%",
      height: "auto",
      active: popupForm.active,
      carousel_group: null,
    };
    if (popupIsNew) {
      const { error } = await supabase.from("banners" as any).insert(payload as any);
      if (error) { toast({ title: "Erro ao criar popup", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Popup criado!" });
    } else if (popupItem && popupItem.id) {
      const { error } = await supabase.from("banners" as any).update(payload as any).eq("id", popupItem.id);
      if (error) { toast({ title: "Erro ao atualizar popup", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Popup atualizado!" });
    }
    setPopupItem(null);
    fetchData();
  };

  return (
    <AdminLayout title="Banners">
      {/* ── POPUPS (formato e config próprios) ── */}
      <div className="mb-6 rounded-2xl border bg-card p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-foreground">Popups (abre ao entrar no app)</h2>
            <p className="text-xs text-muted-foreground">Imagem vertical em tela cheia, com legenda e link opcionais. Até 3 ativos.</p>
          </div>
          <button
            onClick={openNewPopup}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" /> Criar popup
          </button>
        </div>
        {loading ? null : popups.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">Nenhum popup criado.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {popups.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl border bg-background p-3">
                <div className="w-10 h-14 rounded-lg overflow-hidden bg-muted shrink-0">
                  {p.image_url && <img src={p.image_url} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{p.title || "Sem legenda"}</p>
                  <p className="text-xs text-muted-foreground truncate">{p.link_url && p.link_url !== "#" ? p.link_url : "Sem link"}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${p.active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {p.active ? "Ativo" : "Inativo"}
                </span>
                <div className="flex gap-1">
                  <button onClick={() => openEditPopup(p)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                    <Pencil className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors">
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{contentBanners.length} banners</p>
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
      ) : contentBanners.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Nenhum banner cadastrado</div>
      ) : (
        <div className="flex flex-col gap-3">
          {contentBanners.map((b) => {
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
                  maxSize={960}
                  quality={0.64}
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
                  maxSize={960}
                  quality={0.64}
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

            {/* Carrossel agora é automático: 2+ banners ativos na MESMA posição giram juntos. */}
            <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400">
              <Layers className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="text-xs font-medium">
                Dica: coloque 2 ou mais banners <strong>ativos na mesma posição</strong> e eles viram um carrossel automaticamente (com bolinhas), sem precisar agrupar nada.
              </p>
            </div>

            {/* Posição na Home */}
            {true && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Posição na Home</label>
                <div className="relative">
                  <select
                    value={form.position}
                    onChange={(e) => setForm(f => ({ ...f, position: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 appearance-none"
                  >
                    {Object.entries(positionLabels).filter(([k]) => k !== "popup").map(([k, v]) => (
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

      {/* ── Modal do POPUP (formato/config próprios) ── */}
      <Dialog open={!!popupItem} onOpenChange={(o) => !o && setPopupItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{popupIsNew ? "Novo popup" : "Editar popup"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
            {/* Imagem vertical (obrigatória) */}
            <div className="p-3 border-2 border-dashed rounded-2xl bg-muted/20">
              <label className="text-xs font-bold text-foreground mb-3 flex items-center gap-2 uppercase tracking-tighter">
                <Smartphone className="w-4 h-4 text-primary" /> Imagem do popup (vertical, ex.: 1080x1920)
              </label>
              {popupForm.image_url ? (
                <div className="relative rounded-xl overflow-hidden border mb-2 mx-auto w-40">
                  <img src={popupForm.image_url} alt="Popup" className="w-full object-cover" />
                  <button
                    onClick={() => setPopupForm(f => ({ ...f, image_url: "" }))}
                    className="absolute top-1 right-1 p-1 rounded-full bg-destructive text-destructive-foreground"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <ImageCropUpload
                  onUpload={(url) => setPopupForm(f => ({ ...f, image_url: url }))}
                  aspect={1080 / 1920}
                  shape="rect"
                  bucketPath="branding"
                  label="Upload imagem vertical"
                  maxSize={1080}
                  quality={0.7}
                />
              )}
            </div>

            {/* Legenda curta (opcional) */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Legenda curta (opcional)</label>
              <input
                value={popupForm.title}
                onChange={(e) => setPopupForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Ex.: Promoção da semana!"
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Link (opcional) */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Link ao clicar (opcional)</label>
              <input
                value={popupForm.link_url}
                onChange={(e) => setPopupForm(f => ({ ...f, link_url: e.target.value }))}
                placeholder="https://... ou /assinar"
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Ativo */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={popupForm.active}
                onChange={(e) => setPopupForm(f => ({ ...f, active: e.target.checked }))}
                className="w-4 h-4 rounded border-border text-primary"
              />
              <span className="text-sm text-foreground">Popup ativo</span>
            </label>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setPopupItem(null)}
                className="flex-1 py-3 rounded-xl border text-sm font-medium hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={savePopup}
                className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-black hover:bg-primary/90 transition-colors flex items-center justify-center gap-1"
              >
                <Save className="w-4 h-4" /> SALVAR POPUP
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminBanners;
