import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SectionConfig {
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

export const useHomeLayout = () => {
  const [sections, setSections] = useState<SectionConfig[]>(DEFAULT_SECTIONS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("platform_settings").select("value").eq("key", "home_layout").single().then(({ data }) => {
      if (data?.value && Array.isArray(data.value)) {
        const saved = data.value as unknown as SectionConfig[];
        const savedMap = new Map(saved.map(s => [s.id, s]));
        const merged = DEFAULT_SECTIONS.map(def => savedMap.get(def.id) || def);
        saved.forEach(s => { if (!merged.find(m => m.id === s.id)) merged.push(s); });
        merged.sort((a, b) => a.order - b.order);
        setSections(merged);
      }
      setLoading(false);
    });
  }, []);

  const getSection = (id: string) => sections.find(s => s.id === id);
  const isVisible = (id: string) => getSection(id)?.visible !== false;

  return { sections, loading, getSection, isVisible };
};
