import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SectionConfig {
  id: string;
  label: string;
  visible: boolean;
  order: number;
  title?: string;
  subtitle?: string;
}

const DEFAULT_FOOTER = "© 2026 Chamô. Todos os direitos reservados.";

const DEFAULT_SECTIONS: SectionConfig[] = [
  { id: "welcome", label: "Bem-vindo", visible: true, order: 0, title: "Bem-vindo, {nome} 👋", subtitle: "Encontre o profissional ideal perto de você" },
  { id: "sponsors", label: "Patrocinadores", visible: true, order: 1, title: "Patrocinadores", subtitle: "Patrocinado" },
  { id: "jobs", label: "Vagas de Emprego", visible: true, order: 2, title: "🔥 {count} vaga(s) de emprego disponíveis", subtitle: "Confira as oportunidades na sua região" },
  { id: "search", label: "Lupa de Pesquisa", visible: true, order: 3, title: "Buscar profissional ou serviço...", subtitle: "Ex: eletricista, encanador, designer..." },
  { id: "featured", label: "Profissionais em Destaque", visible: true, order: 4, title: "Profissionais em destaque" },
  { id: "categories", label: "Categorias", visible: true, order: 5, title: "Categorias" },
  { id: "benefits", label: "Seus Benefícios", visible: true, order: 6, title: "Seus Benefícios" },
  { id: "tutorials", label: "Tutoriais", visible: true, order: 7 },
];

async function fetchHomeLayout(): Promise<SectionConfig[]> {
  const { data } = await supabase.from("platform_settings").select("value").eq("key", "home_layout").single();
  if (data?.value && Array.isArray(data.value)) {
    const saved = data.value as unknown as SectionConfig[];
    const savedMap = new Map(saved.map(s => [s.id, s]));
    const merged = DEFAULT_SECTIONS.map(def => savedMap.get(def.id) || def);
    saved.forEach(s => { if (!merged.find(m => m.id === s.id)) merged.push(s); });
    merged.sort((a, b) => a.order - b.order);
    return merged;
  }
  return DEFAULT_SECTIONS;
}

async function fetchFooterText(): Promise<string> {
  const { data } = await supabase.from("platform_settings").select("value").eq("key", "home_footer_text").single();
  if (data?.value && typeof data.value === "string") return data.value;
  return DEFAULT_FOOTER;
}

export const useHomeLayout = () => {
  const [sections, setSections] = useState<SectionConfig[]>(DEFAULT_SECTIONS);
  const [footerText, setFooterText] = useState<string>(DEFAULT_FOOTER);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [nextSections, nextFooter] = await Promise.all([fetchHomeLayout(), fetchFooterText()]);
    setSections(nextSections);
    setFooterText(nextFooter);
  }, []);

  useEffect(() => {
    Promise.all([fetchHomeLayout(), fetchFooterText()]).then(([nextSections, nextFooter]) => {
      setSections(nextSections);
      setFooterText(nextFooter);
    }).finally(() => setLoading(false));
  }, []);

  const getSection = (id: string) => sections.find(s => s.id === id);
  const isVisible = (id: string) => getSection(id)?.visible !== false;

  return { sections, loading, getSection, isVisible, refresh, footerText };
};
