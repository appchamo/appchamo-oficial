import AdminLayout from "@/components/AdminLayout";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Save, Loader2, Plus, Trash2, GripVertical, ChevronUp, ChevronDown, ChevronRight } from "lucide-react";

interface TutorialItem {
  id: string;
  icon: string;
  label: string;
  path: string;
  description: string;
}

const DEFAULT_TUTORIALS: TutorialItem[] = [
  { id: "1", icon: "BookOpen", label: "Como usar", path: "/tutorial/1", description: "Aprenda como usar o aplicativo passo a passo." },
  { id: "2", icon: "UserCheck", label: "Como contratar", path: "/tutorial/2", description: "Saiba como contratar um profissional pelo app." },
  { id: "3", icon: "CreditCard", label: "Como pagar", path: "/tutorial/3", description: "Entenda como realizar pagamentos de forma segura." },
  { id: "4", icon: "Wallet", label: "Assinaturas e saques", path: "/tutorial/4", description: "Conheça os planos e como solicitar saques." },
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
          description: item.description || "",
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

  const updateItem = (index: number, field: keyof TutorialItem, value: string) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const updated = { ...item, [field]: value };
      // Auto-update path when label changes
      if (field === "label") {
        updated.path = `/tutorial/${item.id}`;
      }
      return updated;
    }));
  };

  const addItem = () => {
    const newId = Date.now().toString();
    setItems(prev => [...prev, { id: newId, icon: "BookOpen", label: "Novo tutorial", path: `/tutorial/${newId}`, description: "" }]);
    setExpandedId(newId);
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setSaving(true);
    // Ensure all paths point to /tutorial/:id
    const itemsToSave = items.map(item => ({
      ...item,
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
          Edite os tutoriais que aparecem na tela inicial. Cada tutorial terá sua própria página com o conteúdo completo.
        </p>

        <div className="bg-card border rounded-xl p-4 space-y-3">
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

        <div className="space-y-2">
          {items.map((item, index) => {
            const isExpanded = expandedId === item.id;
            return (
              <div key={item.id} className="bg-card border rounded-xl overflow-hidden">
                {/* Header row */}
                <div className="p-4">
                  <div className="flex items-center gap-2">
                    <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-xs font-bold text-muted-foreground w-6">{index + 1}</span>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                      className="flex-1 flex items-center gap-2 text-left"
                    >
                      <span className="font-medium text-sm text-foreground">{item.label}</span>
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

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t pt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-1">Ícone</label>
                        <select value={item.icon} onChange={(e) => updateItem(index, "icon", e.target.value)}
                          className="w-full border rounded-lg px-2 py-1.5 text-xs bg-background outline-none">
                          {AVAILABLE_ICONS.map(ic => <option key={ic} value={ic}>{ic}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-1">Título (botão na home)</label>
                        <input value={item.label} onChange={(e) => updateItem(index, "label", e.target.value)}
                          className="w-full border rounded-lg px-2 py-1.5 text-xs bg-background outline-none" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-1">Descrição completa (conteúdo da página)</label>
                      <textarea
                        value={item.description}
                        onChange={(e) => updateItem(index, "description", e.target.value)}
                        rows={6}
                        placeholder="Escreva o conteúdo completo do tutorial. Use cada linha para um passo..."
                        className="w-full border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 resize-y min-h-[120px]"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">Cada linha será exibida como um passo numerado na página do tutorial.</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button onClick={addItem} className="flex items-center gap-2 text-sm text-primary font-medium hover:underline">
          <Plus className="w-4 h-4" /> Adicionar tutorial
        </button>

        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Salvando..." : "Salvar tutoriais"}
        </button>
      </div>
    </AdminLayout>
  );
};

export default AdminTutorials;
