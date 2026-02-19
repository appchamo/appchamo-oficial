import { BookOpen, UserCheck, CreditCard, Wallet, HelpCircle, MessageCircle, Phone, Shield, Star, Heart, Settings, FileText, Award, Briefcase } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const iconMap: Record<string, any> = {
  BookOpen, UserCheck, CreditCard, Wallet, HelpCircle, MessageCircle,
  Phone, Shield, Star, Heart, Settings, FileText, Award, Briefcase,
};

interface TutorialItem {
  id: string;
  icon: string;
  label: string;
  path: string;
}

interface TutorialsConfig {
  title: string;
  subtitle: string;
  items: TutorialItem[];
}

const defaultConfig: TutorialsConfig = {
  title: "Dúvidas sobre como usar o app?",
  subtitle: "Acesse nossos tutoriais!",
  items: [
    { id: "1", icon: "BookOpen", label: "Como usar", path: "/tutorial/1" },
    { id: "2", icon: "UserCheck", label: "Como contratar", path: "/tutorial/2" },
    { id: "3", icon: "CreditCard", label: "Como pagar", path: "/tutorial/3" },
    { id: "4", icon: "Wallet", label: "Assinaturas e saques", path: "/tutorial/4" },
  ],
};

const TutorialsSection = () => {
  const [config, setConfig] = useState<TutorialsConfig>(defaultConfig);

  useEffect(() => {
    supabase.from("platform_settings").select("value").eq("key", "home_tutorials").single().then(({ data }) => {
      if (data?.value && typeof data.value === "object" && !Array.isArray(data.value)) {
        const val = data.value as any;
        setConfig({
          title: val.title || defaultConfig.title,
          subtitle: val.subtitle || defaultConfig.subtitle,
          items: val.items || defaultConfig.items,
        });
      }
    });
  }, []);

  return (
    <section>
      <h3 className="font-semibold text-foreground mb-1 px-1">{config.title}</h3>
      <p className="text-xs text-muted-foreground mb-3 px-1">{config.subtitle}</p>
      <div className="grid grid-cols-2 gap-3">
        {config.items.map((t) => {
          const Icon = iconMap[t.icon] || BookOpen;
          return (
            <Link
              key={t.id}
              to={t.path}
              className="flex items-center gap-3 bg-card border rounded-xl p-3.5 hover:border-primary/30 hover:shadow-card transition-all group"
            >
              <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <span className="text-sm font-medium text-foreground">{t.label}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
};

export default TutorialsSection;
