import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, Check, ChevronRight, ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import ImageCropUpload from "@/components/ImageCropUpload";

interface ServicePhoto {
  id: string;
  professional_id: string;
  image_url: string;
  title: string | null;
  description: string | null;
  sort_order: number;
}

const MAX_SERVICES = 10;

interface ProfessionalServicesProps {
  professionalId: string;
  isOwner: boolean;
}

const ProfessionalServices = ({ professionalId, isOwner }: ProfessionalServicesProps) => {
  const [items, setItems] = useState<ServicePhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ image_url: "", title: "", description: "" });
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const fetchItems = async () => {
    const { data } = await supabase
      .from("professional_services")
      .select("id, professional_id, image_url, title, description, sort_order")
      .eq("professional_id", professionalId)
      .order("sort_order", { ascending: true });
    setItems((data as ServicePhoto[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchItems(); }, [professionalId]);

  const resetForm = () => {
    setForm({ image_url: "", title: "", description: "" });
    setShowForm(false);
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!form.image_url.trim()) {
      toast({ title: "Adicione uma foto", variant: "destructive" });
      return;
    }
    if (!editingId && items.length >= MAX_SERVICES) {
      toast({ title: `Limite de ${MAX_SERVICES} fotos atingido`, variant: "destructive" });
      return;
    }
    const payload = {
      professional_id: professionalId,
      image_url: form.image_url.trim(),
      title: form.title.trim() || null,
      description: form.description.trim() || null,
      sort_order: editingId ? items.find((i) => i.id === editingId)?.sort_order ?? 0 : items.length,
    };
    if (editingId) {
      const { error } = await supabase.from("professional_services").update(payload).eq("id", editingId);
      if (error) { toast({ title: "Erro ao atualizar", variant: "destructive" }); return; }
      toast({ title: "Serviço atualizado!" });
    } else {
      const { error } = await supabase.from("professional_services").insert(payload);
      if (error) { toast({ title: "Erro ao adicionar", variant: "destructive" }); return; }
      toast({ title: "Foto adicionada!" });
    }
    resetForm();
    fetchItems();
  };

  const handleEdit = (s: ServicePhoto) => {
    setForm({ image_url: s.image_url, title: s.title || "", description: s.description || "" });
    setEditingId(s.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("professional_services").delete().eq("id", id);
    toast({ title: "Foto removida" });
    fetchItems();
  };

  if (loading) return null;
  if (!isOwner && items.length === 0) return null;

  return (
    <>
      <div className="bg-card border rounded-2xl p-5 shadow-card mb-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-foreground">Serviços</h2>
            {isOwner && (
              <span className="text-xs text-muted-foreground">{items.length}/{MAX_SERVICES}</span>
            )}
          </div>
          {isOwner && !showForm && items.length < MAX_SERVICES && (
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Adicionar foto
            </button>
          )}
        </div>

        {/* Formulário */}
        {isOwner && showForm && (
          <div className="border rounded-xl p-4 mb-4 bg-muted/30 space-y-3">
            <p className="text-xs text-muted-foreground">
              {editingId ? "Edite a foto ou os detalhes do serviço." : "Adicione uma foto do seu trabalho ou serviço."}
            </p>
            <ImageCropUpload
              onUpload={(url) => setForm((f) => ({ ...f, image_url: url }))}
              aspect={1}
              shape="rect"
              bucketPath="services"
              currentImage={form.image_url || undefined}
              label="Foto do serviço"
              maxSize={600}
              quality={0.75}
            />
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Título – ex: Corte masculino, Unha em gel"
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Descrição curta (opcional)"
              rows={2}
              maxLength={120}
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
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

        {/* Lista vazia */}
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            {isOwner ? "Nenhuma foto cadastrada. Adicione fotos do seu trabalho." : "Nenhum serviço publicado."}
          </p>
        ) : (
          /* Carrossel 3 por vez */
          <div
            className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory"
            style={{ scrollbarWidth: "none" }}
          >
            {items.map((s, idx) => (
              <div
                key={s.id}
                className="flex-shrink-0 snap-start"
                style={{ width: "calc(33.33% - 6px)" }}
              >
                {/* Foto clicável */}
                <div
                  className="relative rounded-xl overflow-hidden bg-muted cursor-pointer active:opacity-80"
                  style={{ aspectRatio: "1/1" }}
                  onClick={() => !isOwner && setExpandedIndex(idx)}
                >
                  {s.image_url ? (
                    <img
                      src={s.image_url}
                      alt={s.title || "Serviço"}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/30 text-2xl">📷</div>
                  )}
                </div>

                {/* Título + botões (owner) */}
                {isOwner ? (
                  <div className="mt-1.5 flex items-start justify-between gap-1">
                    <p className="text-[10px] font-medium text-foreground line-clamp-2 flex-1 leading-tight">
                      {s.title || <span className="text-muted-foreground">Sem título</span>}
                    </p>
                    <div className="flex gap-0.5 flex-shrink-0">
                      <button onClick={() => handleEdit(s)} className="p-1 rounded-md hover:bg-muted transition-colors" aria-label="Editar">
                        <Pencil className="w-3 h-3 text-muted-foreground" />
                      </button>
                      <button onClick={() => handleDelete(s.id)} className="p-1 rounded-md hover:bg-destructive/10 transition-colors" aria-label="Remover">
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Público: título abaixo da foto */
                  s.title && (
                    <p className="text-[10px] font-medium text-foreground text-center mt-1 leading-tight line-clamp-1 px-0.5">
                      {s.title}
                    </p>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de expansão (somente público) */}
      {expandedIndex !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4"
          onClick={() => setExpandedIndex(null)}
        >
          <div
            className="w-full max-w-sm flex flex-col items-center gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Foto */}
            <div className="w-full rounded-2xl overflow-hidden shadow-2xl">
              <img
                src={items[expandedIndex].image_url}
                alt={items[expandedIndex].title || "Serviço"}
                className="w-full object-cover"
                style={{ maxHeight: "60vh", objectFit: "contain", background: "#111" }}
              />
            </div>

            {/* Título + descrição */}
            {(items[expandedIndex].title || items[expandedIndex].description) && (
              <div className="text-center px-2">
                {items[expandedIndex].title && (
                  <p className="text-white font-bold text-base leading-tight">{items[expandedIndex].title}</p>
                )}
                {items[expandedIndex].description && (
                  <p className="text-white/70 text-sm mt-1 leading-snug">{items[expandedIndex].description}</p>
                )}
              </div>
            )}

            {/* Contador */}
            <p className="text-white/40 text-xs">{expandedIndex + 1} / {items.length}</p>

            {/* Botões */}
            <div className="flex gap-3 w-full">
              <button
                onClick={() => setExpandedIndex(null)}
                className="flex-1 py-2.5 rounded-xl border border-white/20 text-white text-sm font-medium hover:bg-white/10 transition-colors"
              >
                Fechar
              </button>
              {items.length > 1 && (
                <button
                  onClick={() => setExpandedIndex((expandedIndex + 1) % items.length)}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold flex items-center justify-center gap-1 hover:bg-primary/90 transition-colors"
                >
                  Próxima <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Setas laterais para desktop */}
          {items.length > 1 && (
            <>
              <button
                onClick={() => setExpandedIndex((expandedIndex - 1 + items.length) % items.length)}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center hover:bg-white/20 transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-white" />
              </button>
              <button
                onClick={() => setExpandedIndex((expandedIndex + 1) % items.length)}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center hover:bg-white/20 transition-colors"
              >
                <ChevronRight className="w-5 h-5 text-white" />
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
};

export default ProfessionalServices;
