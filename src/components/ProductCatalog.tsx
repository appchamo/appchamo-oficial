import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Package, X, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import ImageCropUpload from "@/components/ImageCropUpload";
import { Badge } from "@/components/ui/badge";

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  active: boolean;
  external_url: string | null;
}

interface ProductCatalogProps {
  professionalId: string;
  isOwner: boolean;
}

const ProductCatalog = ({ professionalId, isOwner }: ProductCatalogProps) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", price: "", image_url: "", external_url: "" });

  const fetchProducts = async () => {
    const { data } = await supabase
      .from("product_catalog")
      .select("id, name, description, price, image_url, active, external_url")
      .eq("professional_id", professionalId)
      .order("sort_order", { ascending: true });
    setProducts((data as Product[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchProducts(); }, [professionalId]);

  const resetForm = () => {
    setForm({ name: "", description: "", price: "", image_url: "", external_url: "" });
    setShowForm(false);
    setEditingId(null);
  };

  const isBlockedUrl = (url: string): boolean => {
    if (!url) return false;
    const blocked = [
      "bet", "apostas", "casino", "poker", "slots", "gambling",
      "onlyfans", "xvideos", "pornhub", "xhamster", "redtube", "xnxx",
      "18+", "+18", "adult", "xxx",
      "shopee", "aliexpress", "shein", "temu", "wish",
      "blaze", "sportingbet", "betano", "betfair", "pixbet", "esportebet",
      "stake", "fortune", "tiger", "mines", "crash", "roleta",
    ];
    const lower = url.toLowerCase();
    return blocked.some(word => lower.includes(word));
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: "Nome é obrigatório", variant: "destructive" }); return; }
    if (form.external_url.trim() && isBlockedUrl(form.external_url.trim())) {
      toast({ title: "Link não permitido", description: "Links para sites de apostas, conteúdo adulto ou marketplaces não são permitidos.", variant: "destructive" });
      return;
    }
    const payload = {
      professional_id: professionalId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      price: parseFloat(form.price) || 0,
      image_url: form.image_url || null,
      external_url: form.external_url.trim() || null,
    };

    if (editingId) {
      const { error } = await supabase.from("product_catalog").update(payload).eq("id", editingId);
      if (error) { toast({ title: "Erro ao atualizar", variant: "destructive" }); return; }
      toast({ title: "Produto atualizado!" });
    } else {
      const { error } = await supabase.from("product_catalog").insert(payload);
      if (error) { toast({ title: "Erro ao adicionar", variant: "destructive" }); return; }
      toast({ title: "Produto adicionado!" });
    }
    resetForm();
    fetchProducts();
  };

  const handleEdit = (p: Product) => {
    setForm({ name: p.name, description: p.description || "", price: String(p.price), image_url: p.image_url || "", external_url: p.external_url || "" });
    setEditingId(p.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("product_catalog").delete().eq("id", id);
    toast({ title: "Produto removido" });
    fetchProducts();
  };

  const visibleProducts = isOwner ? products : products.filter(p => p.active);

  if (loading) return null;
  if (!isOwner && visibleProducts.length === 0) return null;

  return (
    <div className="bg-card border rounded-2xl p-5 shadow-card mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-foreground">Catálogo</h2>
          <Badge variant="secondary" className="text-[10px]">{visibleProducts.length}</Badge>
        </div>
        {isOwner && !showForm && (
          <button onClick={() => { resetForm(); setShowForm(true); }} className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Adicionar
          </button>
        )}
      </div>

      {/* Form */}
      {isOwner && showForm && (
        <div className="border rounded-xl p-4 mb-4 bg-muted/30 space-y-3">
          <input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Nome do produto/serviço"
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <textarea
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Descrição (opcional)"
            rows={2}
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          />
          <input
            value={form.price}
            onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
            placeholder="Preço (R$)"
            type="number"
            step="0.01"
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div>
            <ImageCropUpload
              onUpload={(url) => setForm(f => ({ ...f, image_url: url }))}
              aspect={1}
              shape="rect"
              bucketPath="catalog"
              currentImage={form.image_url || undefined}
              label="Foto do produto"
            />
          </div>
          <input
            value={form.external_url}
            onChange={e => setForm(f => ({ ...f, external_url: e.target.value }))}
            placeholder="Link externo (opcional)"
            type="url"
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="flex gap-2">
            <button onClick={resetForm} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-sm font-medium hover:bg-muted transition-colors">
              <X className="w-4 h-4" /> Cancelar
            </button>
            <button onClick={handleSave} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
              <Check className="w-4 h-4" /> {editingId ? "Atualizar" : "Salvar"}
            </button>
          </div>
        </div>
      )}

      {/* Product grid */}
      {visibleProducts.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">Nenhum produto cadastrado.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
            {visibleProducts.map(p => {
              const inner = (
                <div className="border rounded-xl overflow-hidden bg-background group">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="w-full h-28 object-cover" />
                  ) : (
                    <div className="w-full h-28 bg-muted flex items-center justify-center">
                      <Package className="w-8 h-8 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="p-2.5">
                    <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                    {p.description && <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{p.description}</p>}
                    <p className="text-sm font-bold text-primary mt-1">
                      {p.price > 0 ? `R$ ${Number(p.price).toFixed(2).replace(".", ",")}` : "Sob consulta"}
                    </p>
                    {isOwner && (
                      <div className="flex gap-1.5 mt-2">
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleEdit(p); }} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border text-[11px] font-medium hover:bg-muted transition-colors">
                          <Pencil className="w-3 h-3" /> Editar
                        </button>
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(p.id); }} className="flex items-center justify-center p-1.5 rounded-lg border text-destructive hover:bg-destructive/10 transition-colors">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
              return p.external_url && !isOwner ? (
                <a key={p.id} href={p.external_url} target="_blank" rel="noopener noreferrer">{inner}</a>
              ) : (
                <div key={p.id}>{inner}</div>
              );
            })}
        </div>
      )}
    </div>
  );
};

export default ProductCatalog;
