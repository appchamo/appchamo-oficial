import AppLayout from "@/components/AppLayout";
import { useParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, BookOpen, UserCheck, CreditCard, Wallet, HelpCircle, MessageCircle, Phone, Shield, Star, Heart, Settings, FileText, Award, Briefcase, PlayCircle } from "lucide-react";

const iconMap: Record<string, any> = {
  BookOpen, UserCheck, CreditCard, Wallet, HelpCircle, MessageCircle,
  Phone, Shield, Star, Heart, Settings, FileText, Award, Briefcase,
};

interface TutorialItem {
  id: string;
  icon: string;
  label: string;
  description: string;
  video_url?: string; // ✅ Adicionado
  steps?: string[];   // ✅ Adicionado para suporte ao novo formato
}

const TutorialDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [tutorial, setTutorial] = useState<TutorialItem | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("platform_settings").select("value").eq("key", "home_tutorials").single();
      if (data?.value && typeof data.value === "object" && !Array.isArray(data.value)) {
        const val = data.value as any;
        const items: TutorialItem[] = val.items || [];
        const found = items.find((t) => t.id === id);
        setTutorial(found || null);
      }
      setLoading(false);
    };
    load();
  }, [id]);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-12">
          <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </AppLayout>
    );
  }

  if (!tutorial) {
    return (
      <AppLayout>
        <div className="max-w-screen-lg mx-auto px-4 py-5">
          <Link to="/home" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Link>
          <p className="text-muted-foreground">Tutorial não encontrado.</p>
        </div>
      </AppLayout>
    );
  }

  const Icon = iconMap[tutorial.icon] || BookOpen;
  
  // ✅ Prioriza o array de steps se existir, senão usa a descrição antiga
  const steps = tutorial.steps && tutorial.steps.length > 0 
    ? tutorial.steps 
    : (tutorial.description ? tutorial.description.split("\n").filter((line) => line.trim() !== "") : []);

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5">
        <Link to="/home" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>

        <div className="bg-card border rounded-2xl overflow-hidden shadow-card">
          {/* ✅ SEÇÃO DE VÍDEO (Aparece apenas se houver vídeo_url) */}
          {tutorial.video_url && (
            <div className="w-full bg-black aspect-video border-b">
              <video 
                src={tutorial.video_url} 
                controls 
                className="w-full h-full"
                poster="/placeholder.svg" // Opcional: pode adicionar uma imagem de capa
              >
                Seu navegador não suporta vídeos.
              </video>
            </div>
          )}

          <div className="p-5">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <h1 className="text-xl font-black text-foreground">{tutorial.label}</h1>
            </div>

            {steps.length > 0 ? (
              <div className="space-y-4">
                <p className="text-[10px] font-black uppercase text-primary tracking-widest flex items-center gap-2 mb-2">
                  <PlayCircle size={12} /> Passo a passo
                </p>
                <ol className="flex flex-col gap-3">
                  {steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-3 bg-muted/30 p-4 rounded-xl border border-transparent hover:border-primary/10 transition-colors">
                      <span className="w-7 h-7 rounded-lg bg-primary text-white text-xs font-black flex items-center justify-center flex-shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-sm font-medium text-foreground leading-relaxed pt-0.5">
                        {step}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum conteúdo disponível.</p>
            )}
          </div>
        </div>
      </main>
    </AppLayout>
  );
};

export default TutorialDetail;