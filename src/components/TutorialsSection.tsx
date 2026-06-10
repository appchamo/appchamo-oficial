/**
 * Seção de tutoriais da Home.
 * Cards animados (Framer Motion), ícone em tile com gradiente, selo de
 * "concluído" e barra de progresso geral. Conteúdo vem do admin
 * (platform_settings.home_tutorials) com fallback/merge para os padrões.
 */
import {
  BookOpen, UserCheck, CreditCard, Wallet, HelpCircle, MessageCircle,
  Phone, Shield, Star, Heart, Settings, FileText, Award, Briefcase,
  GraduationCap, Check, ChevronRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { staggerContainer, fadeUpItem } from "@/lib/motion";
import {
  TutorialItem, DEFAULT_TUTORIALS_CONFIG, mergeTutorialItems,
  isTutorialDone, countTutorialsDone,
} from "@/lib/tutorials";

const iconMap: Record<string, any> = {
  BookOpen, UserCheck, CreditCard, Wallet, HelpCircle, MessageCircle,
  Phone, Shield, Star, Heart, Settings, FileText, Award, Briefcase,
};

const TutorialsSection = () => {
  const [title, setTitle] = useState(DEFAULT_TUTORIALS_CONFIG.title);
  const [subtitle, setSubtitle] = useState(DEFAULT_TUTORIALS_CONFIG.subtitle);
  const [items, setItems] = useState<TutorialItem[]>(DEFAULT_TUTORIALS_CONFIG.items);

  useEffect(() => {
    supabase.from("platform_settings").select("value").eq("key", "home_tutorials").single().then(({ data }) => {
      if (data?.value && typeof data.value === "object" && !Array.isArray(data.value)) {
        const val = data.value as any;
        setTitle(val.title || DEFAULT_TUTORIALS_CONFIG.title);
        setSubtitle(val.subtitle || DEFAULT_TUTORIALS_CONFIG.subtitle);
        setItems(mergeTutorialItems(val.items));
      }
    });
  }, []);

  const ids = items.map((t) => t.id);
  const done = countTutorialsDone(ids);
  const total = items.length;
  const allDone = total > 0 && done === total;

  return (
    <section>
      <div className="flex items-end justify-between gap-3 mb-3 px-1">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <GraduationCap className="w-4 h-4 text-primary shrink-0" strokeWidth={2.4} />
            <h3 className="font-bold text-foreground truncate">{title}</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        {total > 0 && (
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums ${
            allDone ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-primary/10 text-primary"
          }`}>
            {done}/{total}
          </span>
        )}
      </div>

      <motion.div
        className="grid grid-cols-2 gap-3"
        variants={staggerContainer}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
      >
        {items.map((t) => {
          const Icon = iconMap[t.icon] || BookOpen;
          const completed = isTutorialDone(t.id);
          return (
            <motion.div key={t.id} variants={fadeUpItem}>
              <Link
                to={t.path}
                className="relative flex h-full flex-col gap-2.5 overflow-hidden rounded-2xl border bg-card p-3.5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md active:scale-[0.98]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-amber-500 text-white shadow-sm shadow-primary/30">
                    <Icon className="h-5 w-5" strokeWidth={2.2} />
                  </div>
                  {completed ? (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
                  )}
                </div>
                <span className="text-sm font-semibold leading-snug text-foreground">{t.label}</span>
                <span className={`text-[10px] font-bold uppercase tracking-wide ${completed ? "text-emerald-600 dark:text-emerald-400" : "text-primary"}`}>
                  {completed ? "Concluído" : "Ver tutorial"}
                </span>
              </Link>
            </motion.div>
          );
        })}
      </motion.div>
    </section>
  );
};

export default TutorialsSection;
