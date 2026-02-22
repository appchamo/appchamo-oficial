import AdminLayout from "@/components/AdminLayout";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Save, Loader2, Plus, Trash2, GripVertical, ChevronUp, ChevronDown, ChevronRight, ListPlus } from "lucide-react";

interface TutorialItem {
  id: string;
  icon: string;
  label: string;
  path: string;
  description: string; // Mantido para compatibilidade, mas usaremos para processar os steps
  steps?: string[]; // ✅ NOVO: Array de passos individuais
}

const DEFAULT_TUTORIALS: TutorialItem[] = [
  { id: "1", icon: "BookOpen", label: "Como usar", path: "/tutorial/1", description: "", steps: ["Aprenda como usar o aplicativo passo a passo."] },
  { id: "2", icon: "UserCheck", label: "Como contratar", path: "/tutorial/2", description: "", steps: ["Saiba como contratar um profissional pelo app."] },
  { id: "3", icon: "CreditCard", label: "Como pagar", path: "/tutorial/3", description: "", steps: ["Entenda como realizar pagamentos de forma segura."] },
  { id: "4", icon: "Wallet", label: "Assinaturas e saques", path: "/tutorial/4", description: "", steps: ["Conheça os planos e como solicitar saques."] },
];

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
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("platform_settings").select("value").eq("key", "home_tutorials").single();
      if (data?.value && typeof data.value === "object" && !Array.isArray(data.value)) {
        const val = data.value as any;
        setTitle(val.title || "Dúvidas sobre como usar o app?");
        setSubtitle(val.subtitle || "Acesse nossos tutoriais!");
        
        const loadedItems = (val.items || DEFAULT_TUTORIALS).map((item: any) => ({
          ...item,
          steps: item.steps || (item.description ? item.description.split('\n').filter((l: string) => l.trim() !== '') : [""]),
          path: item.path || `/tutorial/${item.id}`,
        }));
        setItems(loadedItems);
      } else {
        setItems(DEFAULT_TUTORIALS);
      }
      setLoading(false);
    };
    load();
  }, []);

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
  };

  const updateItem = (index: number, field: keyof TutorialItem, value: any) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const updated = { ...item, [field]: value };
      if (field === "label") updated.path = `/tutorial/${item.id}`;
      return updated;
    }));
  };

  // ✅ NOVAS FUNÇÕES PARA GERENCIAR PASSOS INDIVIDUAIS
  const addStep = (itemIndex: number) => {
    const newItems = [...items];
    const currentSteps = newItems[itemIndex].steps || [];
    newItems[itemIndex].steps = [...currentSteps, ""];
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
    const newSteps = (newItems[itemIndex].steps || []).filter((_, i) => i !== stepIndex);
    newItems[itemIndex].steps = newSteps.length > 0 ? newSteps : [""];
    setItems(newItems);
  };

  const addItem = () => {
    const newId = Date.now().toString();
    setItems(prev => [...prev, { id: newId, icon: "BookOpen", label: "Novo tutorial", path: `/tutorial/${newId}`, description: "", steps: [""] }]);
    setExpandedId(newId);
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setSaving(true);
    // Sincroniza o description com os steps (caso algum componente antigo ainda use description)
    const itemsToSave = items.map(item => ({
      ...item,
      description: (item.steps || []).join('\n'),
      path: `/tutorial/${item.id}`,
    }));

    const { error } = await supabase.from("platform_settings").upsert(
      { key: "home_tutorials", value: { title, subtitle, items: itemsToSave } as any },
      { onConflict: "key" }
    );
    if (error) {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } else {
      toast({ title: "Tutoriais salvos com sucesso!" });
    }
    setSaving(false);
  };

  if (loading) {
    return <AdminLayout title="Tutoriais da Home"><div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div></AdminLayout>;
  }

  return (
    <AdminLayout title="Tutoriais da Home">
      <div className="max-w-2xl space-y-4">
        <p className="text-sm text-muted-foreground mb-4">
          Edite os tutoriais da tela inicial. Cada caixa abaixo representa um "Passo" numerado na página do tutorial.
        </p>

        <div className="bg-card border rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Título da seção</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Subtítulo</label>
              <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {items.map((item, index) => {
            const isExpanded = expandedId === item.id;
            return (
              <div key={item.id} className="bg-card border rounded-xl overflow-hidden transition-all shadow-sm">
                <div className={`p-4 ${isExpanded ? "bg-primary/5" : ""}`}>
                  <div className="flex items-center gap-2">
                    <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-xs font-bold text-muted-foreground w-6">{index + 1}</span>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                      className="flex-1 flex items-center gap-2 text-left"
                    >
                      <span className="font-bold text-sm text-foreground">{item.label}</span>
                      <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                    </button>
                    <div className="flex items-center gap-1">
                      <button onClick={() => move(index, -1)} disabled={index === 0}
                        className="p-1 rounded hover:bg-muted disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                      <button onClick={() => move(index, 1)} disabled={index === items.length - 1}
                        className="p-1 rounded hover:bg-muted disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                      <button onClick={() => removeItem(index)}
                        className="p-1 rounded hover:bg-destructive/10 text-destructive"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t pt-4 space-y-4 bg-background">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold uppercase text-muted-foreground block mb-1">Ícone</label>
                        <select value={item.icon} onChange={(e) => updateItem(index, "icon", e.target.value)}
                          className="w-full border rounded-lg px-2 py-2 text-xs bg-background outline-none">
                          {AVAILABLE_ICONS.map(ic => <option key={ic} value={ic}>{ic}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase text-muted-foreground block mb-1">Título do Tutorial</label>
                        <input value={item.label} onChange={(e) => updateItem(index, "label", e.target.value)}
                          className="w-full border rounded-lg px-3 py-2 text-xs bg-background outline-none focus:ring-2 focus:ring-primary/30" />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <label className="text-[10px] font-bold uppercase text-muted-foreground block">Conteúdo dos Passos (Retângulos)</label>
                      
                      {(item.steps || []).map((step, sIdx) => (
                        <div key={sIdx} className="flex gap-2 group">
                          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground border">
                            {sIdx + 1}
                          </div>
                          <div className="flex-1 relative">
                            <textarea
                              value={step}
                              onChange={(e) => updateStep(index, sIdx, e.target.value)}
                              rows={2}
                              placeholder={`Descreva o passo ${sIdx + 1}...`}
                              className="w-full border rounded-xl px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                            />
                            {item.steps!.length > 1 && (
                              <button 
                                onClick={() => removeStep(index, sIdx)}
                                className="absolute -right-2 -top-2 p-1 rounded-full bg-destructive text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                              >
                                <X size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}

                      <button 
                        onClick={() => addStep(index)}
                        className="w-full py-2 rounded-xl border-2 border-dashed border-primary/20 text-primary text-xs font-bold hover:bg-primary/5 transition-colors flex items-center justify-center gap-2"
                      >
                        <ListPlus size={14} /> ADICIONAR OUTRA CAIXA (PASSO)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between pt-4 border-t">
          <button onClick={addItem} className="flex items-center gap-2 text-sm text-primary font-bold hover:underline">
            <Plus className="w-4 h-4" /> NOVO GRUPO DE TUTORIAL
          </button>

          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-8 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-black hover:bg-primary/90 transition-all shadow-md active:scale-95 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "SALVANDO..." : "SALVAR ALTERAÇÕES"}
          </button>
        </div>
      </div>
    </AdminLayout>
  );
};

const X = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
);

export default AdminTutorials;