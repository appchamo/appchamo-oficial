import AdminLayout from "@/components/AdminLayout";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Save, Loader2, Plus, Trash2, GripVertical, ChevronUp, ChevronDown, ChevronRight, ListPlus, Video, X as CloseIcon, FileVideo } from "lucide-react";

interface TutorialItem {
  id: string;
  icon: string;
  label: string;
  path: string;
  description: string;
  video_url?: string; // ✅ Agora aceita URL do Storage
  steps?: string[];
}

const AVAILABLE_ICONS = [
  "BookOpen", "UserCheck", "CreditCard", "Wallet", "HelpCircle", "MessageCircle",
  "Phone", "Shield", "Star", "Heart", "Settings", "FileText", "Award", "Briefcase",
];

const AdminTutorials = () => {
  const [title, setTitle] = useState("Dúvidas sobre como usar o app?");
  const [subtitle, setSubtitle] = useState("Acesse nossos tutoriais!");
  const [items, setItems] = useState<TutorialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("platform_settings").select("value").eq("key", "home_tutorials").single();
      if (data?.value && typeof data.value === "object" && !Array.isArray(data.value)) {
        const val = data.value as any;
        setTitle(val.title || "Dúvidas sobre como usar o app?");
        setSubtitle(val.subtitle || "Acesse nossos tutoriais!");
        const loadedItems = (val.items || []).map((item: any) => ({
          ...item,
          steps: item.steps || (item.description ? item.description.split('\n').filter((l: string) => l.trim() !== '') : [""]),
          path: item.path || `/tutorial/${item.id}`,
        }));
        setItems(loadedItems);
      }
      setLoading(false);
    };
    load();
  }, []);

  // ✅ FUNÇÃO PARA UPLOAD DE VÍDEO NO STORAGE
  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>, itemIndex: number) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) { // Limite de 50MB
      toast({ title: "Vídeo muito grande", description: "O limite é de 50MB.", variant: "destructive" });
      return;
    }

    const itemId = items[itemIndex].id;
    setUploadingVideo(itemId);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `tutorials/${itemId}-${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from("uploads")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("uploads").getPublicUrl(fileName);
      updateItem(itemIndex, "video_url", urlData.publicUrl);
      toast({ title: "Vídeo enviado com sucesso!" });
    } catch (error) {
      toast({ title: "Erro no upload", variant: "destructive" });
    } finally {
      setUploadingVideo(null);
    }
  };

  const updateItem = (index: number, field: keyof TutorialItem, value: any) => {
    setItems(prev => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const addStep = (itemIndex: number) => {
    const newItems = [...items];
    newItems[itemIndex].steps = [...(newItems[itemIndex].steps || []), ""];
    setItems(newItems);
  };

  const updateStep = (itemIndex: number, stepIndex: number, value: string) => {
    const newItems = [...items];
    const newSteps = [...(newItems[itemIndex].steps || [])];
    newSteps[stepIndex] = value;
    newItems[itemIndex].steps = newSteps;
    setItems(newItems);
  };

  const removeStep = (itemIndex: number, stepIndex: number) => {
    const newItems = [...items];
    newItems[itemIndex].steps = (newItems[itemIndex].steps || []).filter((_, i) => i !== stepIndex);
    setItems(newItems);
  };

  const handleSave = async () => {
    setSaving(true);
    const itemsToSave = items.map(item => ({
      ...item,
      description: (item.steps || []).join('\n'),
      path: `/tutorial/${item.id}`,
    }));
    const { error } = await supabase.from("platform_settings").upsert({ key: "home_tutorials", value: { title, subtitle, items: itemsToSave } as any });
    if (error) toast({ title: "Erro ao salvar", variant: "destructive" });
    else toast({ title: "Tutoriais salvos!" });
    setSaving(false);
  };

  if (loading) return <AdminLayout title="Tutoriais"><Loader2 className="animate-spin mx-auto" /></AdminLayout>;

  return (
    <AdminLayout title="Tutoriais da Home">
      <div className="max-w-2xl space-y-4 pb-20">
        <div className="bg-card border rounded-xl p-4 space-y-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" className="w-full border rounded-lg px-3 py-2 text-sm" />
          <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Subtítulo" className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>

        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={item.id} className="bg-card border rounded-xl overflow-hidden">
              <div className="p-4 flex items-center gap-2">
                <GripVertical className="text-muted-foreground w-4" />
                <button onClick={() => setExpandedId(expandedId === item.id ? null : item.id)} className="flex-1 text-left font-bold text-sm">
                  {item.label}
                </button>
                <button onClick={() => setItems(items.filter((_, i) => i !== index))} className="text-destructive p-1"><Trash2 size={16}/></button>
              </div>

              {expandedId === item.id && (
                <div className="p-4 border-t space-y-4 bg-background">
                  {/* SEÇÃO DE VÍDEO */}
                  <div className="p-4 border-2 border-dashed rounded-xl bg-primary/5">
                    <label className="text-[10px] font-black uppercase text-primary flex items-center gap-2 mb-3">
                      <Video size={14} /> Vídeo de Animação do Tutorial
                    </label>
                    
                    {item.video_url ? (
                      <div className="relative rounded-lg overflow-hidden border bg-black aspect-video">
                        <video src={item.video_url} className="w-full h-full" controls />
                        <button onClick={() => updateItem(index, "video_url", "")} className="absolute top-2 right-2 bg-destructive text-white p-1 rounded-full">
                          <CloseIcon size={12} />
                        </button>
                      </div>
                    ) : (
                      <div className="text-center">
                        <input type="file" accept="video/*" className="hidden" id={`video-${index}`} onChange={(e) => handleVideoUpload(e, index)} />
                        <label htmlFor={`video-${index}`} className="cursor-pointer flex flex-col items-center gap-2 py-4">
                          {uploadingVideo === item.id ? <Loader2 className="animate-spin text-primary" /> : <FileVideo className="text-muted-foreground" size={32} />}
                          <span className="text-xs font-bold text-muted-foreground">Clique para fazer upload do vídeo (MP4)</span>
                        </label>
                      </div>
                    )}
                  </div>

                  <input value={item.label} onChange={(e) => updateItem(index, "label", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Título do Tutorial" />

                  <div className="space-y-3">
                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Passos do Tutorial</label>
                    {item.steps?.map((step, sIdx) => (
                      <div key={sIdx} className="flex gap-2">
                        <div className="w-8 h-8 rounded bg-muted flex items-center justify-center text-xs font-bold">{sIdx+1}</div>
                        <textarea value={step} onChange={(e) => updateStep(index, sIdx, e.target.value)} className="flex-1 border rounded-xl px-3 py-2 text-sm" rows={2} />
                        <button onClick={() => removeStep(index, sIdx)} className="text-destructive"><Trash2 size={14}/></button>
                      </div>
                    ))}
                    <button onClick={() => addStep(index)} className="w-full py-2 border-2 border-dashed rounded-xl text-primary text-xs font-bold flex items-center justify-center gap-2">
                      <ListPlus size={14} /> ADICIONAR OUTRA CAIXA (PASSO)
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center pt-4">
          <button onClick={() => setItems([...items, { id: Date.now().toString(), icon: "BookOpen", label: "Novo Tutorial", path: "", description: "", steps: [""] }])} className="text-primary font-bold text-sm flex items-center gap-2">
            <Plus size={16} /> NOVO GRUPO
          </button>
          <button onClick={handleSave} disabled={saving} className="bg-primary text-white px-8 py-3 rounded-xl font-black text-sm flex items-center gap-2 shadow-lg">
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            SALVAR ALTERAÇÕES
          </button>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminTutorials;