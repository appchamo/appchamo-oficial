import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Briefcase, X, Check, Image } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import ImageCropUpload from "@/components/ImageCropUpload";

interface ServicePhoto {
  id: string;
  professional_id: string;
  image_url: string;
  title: string | null;
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
  const [form, setForm] = useState({ image_url: "", title: "" });

  const fetchItems = async () => {
    const { data } = await supabase
      .from("professional_services")
      .select("id, professional_id, image_url, title, sort_order")
      .eq("professional_id", professionalId)
      .order("sort_order", { ascending: true });
    setItems((data as ServicePhoto[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchItems();
  }, [professionalId]);

  const resetForm = () => {
    setForm({ image_url: "", title: "" });
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
      sort_order: editingId ? items.find((i) => i.id === editingId)?.sort_order ?? 0 : items.length,
    };

    if (editingId) {
      const { error } = await supabase.from("professional_services").update(payload).eq("id", editingId);
      if (error) {
        toast({ title: "Erro ao atualizar", variant: "destructive" });
        return;
      }
      toast({ title: "Serviço atualizado!" });
    } else {
      const { error } = await supabase.from("professional_services").insert(payload);
      if (error) {
        toast({ title: "Erro ao adicionar", variant: "destructive" });
        return;
      }
      toast({ title: "Foto adicionada!" });
    }
    resetForm();
    fetchItems();
  };

  const handleEdit = (s: ServicePhoto) => {
    setForm({ image_url: s.image_url, title: s.title || "" });
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
    <div className="bg-card border rounded-2xl p-5 shadow-card mb-4">
      <div className="flex items-center justify-between mb-3">
        {isOwner ? (
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-foreground">Serviços</h2>
            <span className="text-xs text-muted-foreground">{items.length}/{MAX_SERVICES}</span>
          </div>
        ) : (
          <h2 className="font-semibold text-foreground">Serviços</h2>
        )}
        {isOwner && !showForm && items.length < MAX_SERVICES && (
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Adicionar foto
          </button>
        )}
      </div>

      {isOwner && showForm && (
        <div className="border rounded-xl p-4 mb-4 bg-muted/30 space-y-3">
          <p className="text-xs text-muted-foreground">
            {editingId ? "Altere a foto ou o título do serviço." : "Adicione uma foto do seu trabalho ou serviço."}
          </p>
          <ImageCropUpload
            onUpload={(url) => setForm((f) => ({ ...f, image_url: url }))}
            aspect={1}
            shape="rect"
            bucketPath="services"
            currentImage={form.image_url || undefined}
            label="Foto do serviço"
          />
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Título (opcional) – ex: Corte masculino, Unha em gel"
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="flex gap-2">
            <button
              onClick={resetForm}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-sm font-medium hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4" /> Cancelar
            </button>
            <button
              onClick={handleSave}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              <Check className="w-4 h-4" /> {editingId ? "Atualizar" : "Salvar"}
            </button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          {isOwner ? "Nenhuma foto de serviço cadastrada. Adicione fotos do seu trabalho." : "Nenhum serviço publicado."}
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {items.map((s) => (
            <div key={s.id} className="border rounded-xl overflow-hidden bg-background">
              <div className="relative pt-[100%] bg-muted">
                {s.image_url ? (
                  <img
                    src={s.image_url}
                    alt={s.title || "Serviço"}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Image className="w-8 h-8 text-muted-foreground/40" />
                  </div>
                )}
              </div>
              {/* No perfil público: só a foto (sem título nem botões). Dono vê título e botões. */}
              {isOwner && (
                <div className="p-2 flex items-center justify-between gap-2">
                  {s.title ? (
                    <p className="text-xs font-medium text-foreground line-clamp-2 flex-1 min-w-0">{s.title}</p>
                  ) : (
                    <span className="text-xs text-muted-foreground flex-1">Sem título</span>
                  )}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleEdit(s)}
                      className="p-1.5 rounded-lg border hover:bg-muted transition-colors"
                      aria-label="Editar"
                    >
                      <Pencil className="w-3 h-3 text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => handleDelete(s.id)}
                      className="p-1.5 rounded-lg border text-destructive hover:bg-destructive/10 transition-colors"
                      aria-label="Remover"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProfessionalServices;
