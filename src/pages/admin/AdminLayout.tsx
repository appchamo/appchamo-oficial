import AdminLayout from "@/components/AdminLayout";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Save, Loader2, GripVertical, Eye, EyeOff, ChevronUp, ChevronDown } from "lucide-react";

interface SectionConfig {
  id: string;
  label: string;
  visible: boolean;
  order: number;
  title?: string;
  subtitle?: string;
}

const DEFAULT_SECTIONS: SectionConfig[] = [
  { id: "welcome", label: "Bem-vindo", visible: true, order: 0, title: "Bem-vindo, {nome} 👋", subtitle: "Encontre o profissional ideal perto de você" },
  { id: "sponsors", label: "Patrocinadores", visible: true, order: 1 },
  { id: "jobs", label: "Vagas de Emprego", visible: true, order: 2, title: "🔥 {count} vaga(s) de emprego disponíveis", subtitle: "Confira as oportunidades na sua região" },
  { id: "search", label: "Lupa de Pesquisa", visible: true, order: 3, title: "Buscar profissional ou serviço...", subtitle: "Ex: eletricista, encanador, designer..." },
  { id: "featured", label: "Profissionais em Destaque", visible: true, order: 4 },
  { id: "categories", label: "Categorias", visible: true, order: 5 },
  { id: "benefits", label: "Seus Benefícios", visible: true, order: 6 },
  { id: "tutorials", label: "Tutoriais", visible: true, order: 7 },
];

const AdminLayoutPage = () => {
  const [sections, setSections] = useState<SectionConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("platform_settings").select("value").eq("key", "home_layout").single();
      if (data?.value && Array.isArray(data.value)) {
        // Merge saved with defaults to include any new sections
        const saved = data.value as unknown as SectionConfig[];
        const savedMap = new Map(saved.map(s => [s.id, s]));
        const merged = DEFAULT_SECTIONS.map(def => savedMap.get(def.id) || def);
        // Add any saved sections not in defaults
        saved.forEach(s => { if (!merged.find(m => m.id === s.id)) merged.push(s); });
        merged.sort((a, b) => a.order - b.order);
        setSections(merged);
      } else {
        setSections([...DEFAULT_SECTIONS]);
      }
      setLoading(false);
    };
    load();
  }, []);

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    setSections(next.map((s, i) => ({ ...s, order: i })));
  };

  const toggle = (index: number) => {
    setSections(prev => prev.map((s, i) => i === index ? { ...s, visible: !s.visible } : s));
  };

  const updateField = (index: number, field: "title" | "subtitle", value: string) => {
    setSections(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from("platform_settings").upsert(
      { key: "home_layout", value: sections as any },
      { onConflict: "key" }
    );
    if (error) {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } else {
      toast({ title: "Layout salvo com sucesso!" });
    }
    setSaving(false);
  };

  if (loading) {
    return <AdminLayout title="Layout da Home"><div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div></AdminLayout>;
  }

  return (
    <AdminLayout title="Layout da Home">
      <div className="max-w-lg space-y-3">
        <p className="text-sm text-muted-foreground mb-4">
          Arrume a ordem das seções da página inicial. Você pode ativar/desativar e editar textos.
        </p>

        {sections.map((section, index) => (
          <div key={section.id} className={`bg-card border rounded-xl p-4 transition-all ${!section.visible ? "opacity-50" : ""}`}>
            <div className="flex items-center gap-3">
              <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-xs font-bold text-muted-foreground w-6">{index + 1}</span>
              <span className="flex-1 font-medium text-sm text-foreground">{section.label}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => move(index, -1)} disabled={index === 0}
                  className="p-1.5 rounded-lg hover:bg-muted transition-colors disabled:opacity-30">
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button onClick={() => move(index, 1)} disabled={index === sections.length - 1}
                  className="p-1.5 rounded-lg hover:bg-muted transition-colors disabled:opacity-30">
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button onClick={() => toggle(index)}
                  className={`p-1.5 rounded-lg transition-colors ${section.visible ? "hover:bg-muted" : "hover:bg-primary/10"}`}>
                  {section.visible ? <Eye className="w-4 h-4 text-primary" /> : <EyeOff className="w-4 h-4 text-muted-foreground" />}
                </button>
              </div>
            </div>

            {/* Editable fields for sections that support text customization */}
            {section.visible && (section.id === "welcome" || section.id === "jobs" || section.id === "search") && (
              <div className="mt-3 space-y-2 pl-12">
                {section.title !== undefined && (
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Título</label>
                    <input value={section.title || ""} onChange={(e) => updateField(index, "title", e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-xs bg-background outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                )}
                {section.subtitle !== undefined && (
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Subtítulo</label>
                    <input value={section.subtitle || ""} onChange={(e) => updateField(index, "subtitle", e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-xs bg-background outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                )}
                {section.id === "welcome" && (
                  <p className="text-[10px] text-muted-foreground">Use <code className="bg-muted px-1 rounded">{"{nome}"}</code> para o nome do usuário</p>
                )}
                {section.id === "jobs" && (
                  <p className="text-[10px] text-muted-foreground">Use <code className="bg-muted px-1 rounded">{"{count}"}</code> para a quantidade de vagas</p>
                )}
              </div>
            )}
          </div>
        ))}

        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 mt-4">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Salvando..." : "Salvar layout"}
        </button>
      </div>
    </AdminLayout>
  );
};

export default AdminLayoutPage;
