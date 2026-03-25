import { useEffect, useRef, useState } from "react";
import { Plus, Pencil, Trash2, Package, X, Check, ShoppingBag, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import ImageCropUpload from "@/components/ImageCropUpload";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

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
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", price: "", image_url: "", external_url: "" });

  // Purchase Modal State
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [creatingRequest, setCreatingRequest] = useState(false);

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

  const handleBuyClick = (p: Product) => {
    if (p.external_url) {
      window.open(p.external_url, '_blank');
      return;
    }
    setSelectedProduct(p);
    setPurchaseModalOpen(true);
  };

  const handleConfirmPurchase = async () => {
    if (!selectedProduct) return;
    setCreatingRequest(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: "Faça login para continuar", variant: "destructive" });
        navigate("/login", { state: { from: window.location.pathname } });
        return;
      }

      // 1. Tenta achar uma solicitação em aberto com esse profissional
      let reqId: string | null = null;
      const { data: existingReq } = await supabase
        .from("service_requests")
        .select("id")
        .eq("client_id", user.id)
        .eq("professional_id", professionalId)
        .in("status", ["pending", "accepted"])
        .maybeSingle();

      if (existingReq) {
        reqId = existingReq.id;
      } else {
        // 2. Se não tem, cria uma nova solicitação
        const { data: newReq, error: reqError } = await supabase
          .from("service_requests")
          .insert({
            client_id: user.id,
            professional_id: professionalId,
            description: `Interesse no produto: ${selectedProduct.name}`,
            status: "pending"
          })
          .select("id")
          .single();

        if (reqError) throw reqError;
        reqId = newReq.id;
      }

      if (!reqId) throw new Error("Não foi possível iniciar o chat.");

      // 3. Injeta a mensagem invisível do PRODUTO no Chat
      const priceFormatted = selectedProduct.price > 0 ? `R$ ${Number(selectedProduct.price).toFixed(2).replace(".", ",")}` : "Sob consulta";
      const productPayload = `🛍️ INTERESSE EM PRODUTO\n[PRODUCT:${selectedProduct.id}:${selectedProduct.name}:${priceFormatted}:${selectedProduct.image_url || 'null'}]`;

      await supabase.from("chat_messages").insert({
        request_id: reqId,
        sender_id: user.id,
        content: productPayload
      });

      // ✅ 4. NOTIFICA O PROFISSIONAL
      const { data: proData } = await supabase
        .from("professionals")
        .select("user_id")
        .eq("id", professionalId)
        .single();

      if (proData?.user_id) {
        await supabase.from("notifications").insert({
          user_id: proData.user_id,
          title: "🛍️ Novo Interesse em Produto!",
          message: `Um cliente quer comprar o seu produto: ${selectedProduct.name}. Acesse o chat!`,
          type: "system",
          read: false
        } as any);
      }

      toast({ title: "Solicitação enviada com sucesso!" });
      setPurchaseModalOpen(false);
      navigate(`/messages/${reqId}`); // Redireciona o cliente pro chat

    } catch (err: any) {
      toast({ title: "Erro ao iniciar compra", description: err.message, variant: "destructive" });
    } finally {
      setCreatingRequest(false);
    }
  };

  const carouselRef = useRef<HTMLDivElement>(null);
  const scrollCarousel = (dir: "left" | "right") => {
    if (!carouselRef.current) return;
    const w = carouselRef.current.offsetWidth;
    carouselRef.current.scrollBy({ left: dir === "right" ? w * 0.85 : -w * 0.85, behavior: "smooth" });
  };

  const visibleProducts = isOwner ? products : products.filter(p => p.active);

  if (loading) return null;
  if (!isOwner && visibleProducts.length === 0) return null;

  return (
    <div className="bg-card border rounded-2xl p-5 shadow-card mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
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
              maxSize={600}
              quality={0.75}
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

      {/* Carrossel 3 por vez */}
      {visibleProducts.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">Nenhum produto cadastrado.</p>
      ) : (
        <div className="relative">
          {visibleProducts.length > 3 && (
            <button
              onClick={() => scrollCarousel("left")}
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 z-10 w-7 h-7 rounded-full bg-white border shadow-md flex items-center justify-center hover:bg-muted transition-colors"
              aria-label="Anterior"
            >
              <ChevronLeft className="w-4 h-4 text-foreground" />
            </button>
          )}
          {visibleProducts.length > 3 && (
            <button
              onClick={() => scrollCarousel("right")}
              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 z-10 w-7 h-7 rounded-full bg-white border shadow-md flex items-center justify-center hover:bg-muted transition-colors"
              aria-label="Próximo"
            >
              <ChevronRight className="w-4 h-4 text-foreground" />
            </button>
          )}
        <div
          ref={carouselRef}
          data-tab-swipe-ignore
          className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory"
          style={{ scrollbarWidth: "none" }}
        >
          {visibleProducts.map(p => (
            <div
              key={p.id}
              className="flex-shrink-0 snap-start border rounded-xl overflow-hidden bg-background flex flex-col"
              style={{ width: "calc(33.33% - 6px)" }}
            >
              {/* Foto */}
              <div className="relative bg-muted" style={{ aspectRatio: "1/1" }}>
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Package className="w-6 h-6 text-muted-foreground/30" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-1.5 flex flex-col flex-1 gap-1">
                <p className="text-[10px] font-medium text-foreground line-clamp-2 leading-tight">{p.name}</p>
                <p className="text-[10px] font-bold text-primary">
                  {p.price > 0 ? `R$ ${Number(p.price).toFixed(2).replace(".", ",")}` : "Consulte"}
                </p>

                {/* Ações */}
                {isOwner ? (
                  <div className="flex gap-1 mt-auto pt-1 border-t">
                    <button onClick={() => handleEdit(p)} className="flex-1 flex items-center justify-center gap-0.5 py-1 rounded-md border text-[9px] font-medium hover:bg-muted transition-colors">
                      <Pencil className="w-2.5 h-2.5" /> Editar
                    </button>
                    <button onClick={() => handleDelete(p.id)} className="flex items-center justify-center p-1 rounded-md border text-destructive hover:bg-destructive/10 transition-colors">
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleBuyClick(p)}
                    className="mt-auto w-full flex items-center justify-center gap-1 py-1.5 rounded-md bg-primary text-primary-foreground text-[9px] font-bold uppercase tracking-wide hover:bg-primary/90 transition-colors"
                  >
                    <ShoppingBag className="w-2.5 h-2.5" />
                    {p.external_url ? "Ver" : "Comprar"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        </div>
      )}

      {/* ✅ MODAL DE COMPRA */}
      <Dialog open={purchaseModalOpen} onOpenChange={setPurchaseModalOpen}>
        <DialogContent className="max-w-xs text-center rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-primary flex items-center justify-center gap-2"><ShoppingBag className="w-5 h-5" /> Confirmar Interesse</DialogTitle>
          </DialogHeader>
          {selectedProduct && (
            <div className="space-y-4 pt-2">
              <div className="flex gap-3 text-left p-3 bg-muted/50 rounded-xl border">
                {selectedProduct.image_url ? (
                  <img src={selectedProduct.image_url} alt="Produto" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-background border flex items-center justify-center flex-shrink-0">
                    <Package className="w-6 h-6 text-muted-foreground/50" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-bold text-foreground line-clamp-2 leading-tight">{selectedProduct.name}</p>
                  <p className="text-xs font-semibold text-primary mt-1">
                    {selectedProduct.price > 0 ? `R$ ${Number(selectedProduct.price).toFixed(2).replace(".", ",")}` : "Sob consulta"}
                  </p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Você será direcionado ao chat com a empresa para combinar os detalhes do pedido e da entrega.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setPurchaseModalOpen(false)} className="flex-1 py-2.5 rounded-xl border font-medium text-sm hover:bg-muted transition-colors">
                  Cancelar
                </button>
                <button onClick={handleConfirmPurchase} disabled={creatingRequest} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50">
                  {creatingRequest ? <Loader2 className="w-4 h-4 animate-spin" /> : "Iniciar Chat"}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProductCatalog;