import AdminLayout from "@/components/AdminLayout";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Save, Loader2, GripVertical, Eye, EyeOff, ChevronUp, ChevronDown, RefreshCw, Smartphone } from "lucide-react";

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
  { id: "sponsors", label: "Patrocinadores", visible: true, order: 1, title: "Patrocinadores", subtitle: "Patrocinado" },
  { id: "jobs", label: "Vagas de Emprego", visible: true, order: 2, title: "Vagas de emprego", subtitle: "Confira as vagas de emprego disponíveis" },
  { id: "search", label: "Lupa de Pesquisa", visible: true, order: 3, title: "Buscar profissional ou serviço...", subtitle: "Ex: eletricista, encanador, designer..." },
  { id: "featured", label: "Profissionais em Destaque", visible: true, order: 4, title: "Profissionais em destaque" },
  { id: "categories", label: "Categorias", visible: true, order: 5, title: "Categorias" },
  { id: "benefits", label: "Seus Benefícios", visible: true, order: 6, title: "Seus Benefícios" },
  { id: "tutorials", label: "Tutoriais", visible: true, order: 7 },
];

const DEFAULT_FOOTER = "© 2026 Chamô. Todos os direitos reservados.";

interface TutorialItem { id: string; icon: string; label: string; path: string; }
const DEFAULT_TUTORIALS = {
  title: "Dúvidas sobre como usar o app?",
  subtitle: "Acesse nossos tutoriais!",
  items: [
    { id: "1", icon: "BookOpen", label: "Como usar", path: "/tutorial/1" },
    { id: "2", icon: "UserCheck", label: "Como contratar", path: "/tutorial/2" },
    { id: "3", icon: "CreditCard", label: "Como pagar", path: "/tutorial/3" },
    { id: "4", icon: "Wallet", label: "Assinaturas e saques", path: "/tutorial/4" },
  ] as TutorialItem[],
};

const AdminLayoutPage = () => {
  const [sections, setSections] = useState<SectionConfig[]>([]);
  const [footerText, setFooterText] = useState(DEFAULT_FOOTER);
  const [tutorialsConfig, setTutorialsConfig] = useState(DEFAULT_TUTORIALS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const previewReadyRef = useRef(false);

  // Envia o rascunho atual para o preview (iframe da home real).
  const postPreview = useCallback(() => {
    try {
      iframeRef.current?.contentWindow?.postMessage(
        { type: "chamo-home-preview", sections, footerText },
        "*",
      );
    } catch { /* */ }
  }, [sections, footerText]);

  // Reaplica o rascunho sempre que algo muda (atualização ao vivo).
  useEffect(() => {
    if (previewReadyRef.current) postPreview();
  }, [postPreview]);

  // Quando o preview avisa que está pronto, manda o rascunho inicial.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "chamo-home-preview-ready") {
        previewReadyRef.current = true;
        postPreview();
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [postPreview]);

  const reloadPreview = () => {
    previewReadyRef.current = false;
    if (iframeRef.current) iframeRef.current.src = iframeRef.current.src;
  };

  useEffect(() => {
    const load = async () => {
      const [layoutRes, footerRes, tutorialsRes] = await Promise.all([
        supabase.from("platform_settings").select("value").eq("key", "home_layout").single(),
        supabase.from("platform_settings").select("value").eq("key", "home_footer_text").single(),
        supabase.from("platform_settings").select("value").eq("key", "home_tutorials").single(),
      ]);
      if (layoutRes.data?.value && Array.isArray(layoutRes.data.value)) {
        const saved = layoutRes.data.value as unknown as SectionConfig[];
        const savedMap = new Map(saved.map(s => [s.id, s]));
        const merged = DEFAULT_SECTIONS.map(def => savedMap.get(def.id) || def);
        saved.forEach(s => { if (!merged.find(m => m.id === s.id)) merged.push(s); });
        merged.sort((a, b) => a.order - b.order);
        setSections(merged);
      } else {
        setSections([...DEFAULT_SECTIONS]);
      }
      if (footerRes.data?.value && typeof footerRes.data.value === "string") {
        setFooterText(footerRes.data.value);
      }
      if (tutorialsRes.data?.value && typeof tutorialsRes.data.value === "object" && !Array.isArray(tutorialsRes.data.value)) {
        const val = tutorialsRes.data.value as any;
        setTutorialsConfig({
          title: val.title || DEFAULT_TUTORIALS.title,
          subtitle: val.subtitle || DEFAULT_TUTORIALS.subtitle,
          items: val.items || DEFAULT_TUTORIALS.items,
        });
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
    const [layoutErr, footerErr, tutorialsErr] = await Promise.all([
      supabase.from("platform_settings").upsert({ key: "home_layout", value: sections as any }, { onConflict: "key" }).then(r => r.error),
      supabase.from("platform_settings").upsert({ key: "home_footer_text", value: footerText }, { onConflict: "key" }).then(r => r.error),
      supabase.from("platform_settings").upsert({ key: "home_tutorials", value: tutorialsConfig as any }, { onConflict: "key" }).then(r => r.error),
    ]);
    if (layoutErr || footerErr || tutorialsErr) {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } else {
      toast({ title: "Layout e textos salvos com sucesso!" });
    }
    setSaving(false);
  };

  if (loading) {
    return <AdminLayout title="Layout da Home"><div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div></AdminLayout>;
  }

  return (
    <AdminLayout title="Layout da Home">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(300px,360px)] gap-6 items-start">
      <div className="space-y-3 min-w-0">
        <p className="text-sm text-muted-foreground mb-4">
          Arrume a ordem das seções da página inicial. Você pode ativar/desativar e editar textos. As mudanças aparecem ao vivo no preview ao lado.
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
            {section.visible && (section.title !== undefined || section.subtitle !== undefined) && (
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

        <div className="bg-card border rounded-xl p-4 mt-4">
          <h4 className="font-semibold text-sm text-foreground mb-2">Rodapé da Home</h4>
          <p className="text-[10px] text-muted-foreground mb-2">Texto exibido no final da página (ex.: copyright)</p>
          <input value={footerText} onChange={(e) => setFooterText(e.target.value)}
            placeholder={DEFAULT_FOOTER}
            className="w-full border rounded-lg px-3 py-2 text-xs bg-background outline-none focus:ring-2 focus:ring-primary/30" />
        </div>

        <div className="bg-card border rounded-xl p-4 mt-3">
          <h4 className="font-semibold text-sm text-foreground mb-2">Tutoriais (título e cards)</h4>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Título</label>
              <input value={tutorialsConfig.title} onChange={(e) => setTutorialsConfig(c => ({ ...c, title: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-xs bg-background outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground mb-1 block">Subtítulo</label>
              <input value={tutorialsConfig.subtitle} onChange={(e) => setTutorialsConfig(c => ({ ...c, subtitle: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-xs bg-background outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <p className="text-[10px] text-muted-foreground">Textos dos 4 cards:</p>
            {tutorialsConfig.items.map((item, i) => (
              <div key={item.id}>
                <label className="text-[10px] text-muted-foreground">Card {i + 1}</label>
                <input value={item.label} onChange={(e) => {
                  const next = [...tutorialsConfig.items];
                  next[i] = { ...next[i], label: e.target.value };
                  setTutorialsConfig(c => ({ ...c, items: next }));
                }}
                  className="w-full border rounded-lg px-3 py-2 text-xs bg-background outline-none focus:ring-2 focus:ring-primary/30 mt-0.5" />
              </div>
            ))}
          </div>
        </div>

        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 mt-4">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Salvando..." : "Salvar layout"}
        </button>
      </div>

      {/* Preview ao vivo — iPhone com a home real */}
      <div className="hidden lg:flex flex-col items-center sticky top-4">
        <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-foreground">
          <Smartphone className="w-4 h-4 text-primary" /> Preview ao vivo
          <button onClick={reloadPreview} title="Recarregar preview" className="ml-1 p-1.5 rounded-lg hover:bg-muted transition-colors">
            <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
        {/* Moldura do iPhone */}
        <div className="relative w-[320px] h-[660px] rounded-[44px] bg-neutral-900 p-3 shadow-2xl ring-1 ring-black/10">
          <div className="absolute top-3 left-1/2 -translate-x-1/2 w-32 h-6 bg-neutral-900 rounded-b-2xl z-10" />
          <iframe
            ref={iframeRef}
            title="Preview da Home"
            src="/home?preview=1"
            className="w-full h-full rounded-[32px] bg-white border-0"
          />
        </div>
        <p className="text-[11px] text-muted-foreground mt-3 text-center max-w-[280px]">
          O preview reflete o rascunho em tempo real. Lembre de tocar em <b>Salvar layout</b> para aplicar de verdade no app.
        </p>
      </div>
      </div>
    </AdminLayout>
  );
};

export default AdminLayoutPage;
