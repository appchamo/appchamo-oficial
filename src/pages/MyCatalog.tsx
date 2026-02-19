import AppLayout from "@/components/AppLayout";
import { ArrowLeft, Plus, Package, Pencil, Trash2, X, Check, Image } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import ImageCropUpload from "@/components/ImageCropUpload";
import { useAuth } from "@/hooks/useAuth";

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  active: boolean;
}

const MyCatalog = () => {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [proId, setProId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", price: "", image_url: "" });

  const fetchData = async () => {
    if (!user) return;
    const { data: pro } = await supabase.from("professionals").select("id").eq("user_id", user.id).maybeSingle();
    if (!pro) { setLoading(false); return; }
    setProId(pro.id);

    const { data } = await supabase
      .from("product_catalog")
      .select("id, name, description, price, image_url, active")
      .eq("professional_id", pro.id)
      .order("sort_order", { ascending: true });
    setProducts((data as Product[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [user]);

  const resetForm = () => {
    setForm({ name: "", description: "", price: "", image_url: "" });
    setShowForm(false);
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: "Nome é obrigatório", variant: "destructive" }); return; }
    if (!proId) return;
    if (!editingId && products.length >= 10) {
      toast({ title: "Limite de 10 produtos atingido", variant: "destructive" });
      return;
    }

    const payload = {
      professional_id: proId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      price: parseFloat(form.price) || 0,
      image_url: form.image_url || null,
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
    fetchData();
  };

  const handleEdit = (p: Product) => {
    setForm({ name: p.name, description: p.description || "", price: String(p.price), image_url: p.image_url || "" });
    setEditingId(p.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("product_catalog").delete().eq("id", id);
    toast({ title: "Produto removido" });
    fetchData();
  };

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5">
        <Link to="/pro" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Painel Profissional
        </Link>

        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-foreground">Meu Catálogo</h1>
            <p className="text-xs text-muted-foreground">{products.length}/10 produtos</p>
          </div>
          {!showForm && products.length < 10 && (
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" /> Adicionar
            </button>
          )}
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-card border rounded-2xl p-5 shadow-card mb-5 space-y-3">
            <h3 className="font-semibold text-foreground text-sm">{editingId ? "Editar Produto" : "Novo Produto"}</h3>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Nome do produto/serviço *"
              className="w-full px-3 py-2.5 rounded-xl border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Descrição (opcional)"
              rows={2}
              className="w-full px-3 py-2.5 rounded-xl border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
            <input
              value={form.price}
              onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
              placeholder="Preço (R$)"
              type="number"
              step="0.01"
              className="w-full px-3 py-2.5 rounded-xl border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
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
            {form.image_url && (
              <img src={form.image_url} alt="Preview" className="w-20 h-20 rounded-xl object-cover" />
            )}
            <div className="flex gap-2">
              <button onClick={resetForm} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-sm font-medium hover:bg-muted transition-colors">
                <X className="w-4 h-4" /> Cancelar
              </button>
              <button onClick={handleSave} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
                <Check className="w-4 h-4" /> {editingId ? "Atualizar" : "Salvar"}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : products.length === 0 && !showForm ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
              <Package className="w-8 h-8 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium">Nenhum produto cadastrado</p>
            <p className="text-xs">Adicione seus produtos e serviços</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {products.map(p => (
              <div key={p.id} className="bg-card border rounded-2xl overflow-hidden shadow-card">
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} className="w-full h-32 object-cover" />
                ) : (
                  <div className="w-full h-32 bg-muted flex items-center justify-center">
                    <Image className="w-10 h-10 text-muted-foreground/30" />
                  </div>
                )}
                <div className="p-3">
                  <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                  {p.description && <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{p.description}</p>}
                  <p className="text-sm font-bold text-primary mt-1.5">
                    {p.price > 0 ? `R$ ${Number(p.price).toFixed(2).replace(".", ",")}` : "Sob consulta"}
                  </p>
                  <div className="flex gap-1.5 mt-2">
                    <button onClick={() => handleEdit(p)} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border text-[11px] font-medium hover:bg-muted transition-colors">
                      <Pencil className="w-3 h-3" /> Editar
                    </button>
                    <button onClick={() => handleDelete(p.id)} className="flex items-center justify-center p-1.5 rounded-lg border text-destructive hover:bg-destructive/10 transition-colors">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </AppLayout>
  );
};

export default MyCatalog;
