/**
 * Tela de um tutorial: passo-a-passo animado + tela de conclusão celebrativa.
 * Conteúdo vem do admin (platform_settings.home_tutorials) com merge nos padrões.
 */
import AppLayout from "@/components/AppLayout";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft, BookOpen, UserCheck, CreditCard, Wallet, HelpCircle, MessageCircle,
  Phone, Shield, Star, Heart, Settings, FileText, Award, Briefcase, PlayCircle,
  Check, CheckCircle2, Loader2, PartyPopper,
} from "lucide-react";
import { staggerContainer, fadeUpItem, easeApp } from "@/lib/motion";
import {
  TutorialItem, resolveTutorial, tutorialSteps, isTutorialDone, markTutorialDone,
} from "@/lib/tutorials";

const iconMap: Record<string, any> = {
  BookOpen, UserCheck, CreditCard, Wallet, HelpCircle, MessageCircle,
  Phone, Shield, Star, Heart, Settings, FileText, Award, Briefcase,
};

const TutorialDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tutorial, setTutorial] = useState<TutorialItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    const load = async () => {
      let items: Partial<TutorialItem>[] | null = null;
      const { data } = await supabase.from("platform_settings").select("value").eq("key", "home_tutorials").single();
      if (data?.value && typeof data.value === "object" && !Array.isArray(data.value)) {
        items = (data.value as any).items || null;
      }
      setTutorial(resolveTutorial(id, items));
      if (id) setDone(isTutorialDone(id));
      setLoading(false);
    };
    load();
  }, [id]);

  const finish = () => {
    if (!id) return;
    markTutorialDone(id);
    setDone(true);
    setCelebrate(true);
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!tutorial) {
    return (
      <AppLayout>
        <div className="max-w-screen-lg mx-auto px-4 py-5">
          <Link to="/home" className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground bg-muted hover:bg-muted/80 px-3 py-1.5 rounded-xl mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Link>
          <p className="text-muted-foreground">Tutorial não encontrado.</p>
        </div>
      </AppLayout>
    );
  }

  const Icon = iconMap[tutorial.icon] || BookOpen;
  const steps = tutorialSteps(tutorial);

  return (
    <AppLayout>
      <main className="max-w-screen-md mx-auto px-4 py-5 pb-28">
        <Link to="/home" className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground bg-muted hover:bg-muted/80 px-3 py-1.5 rounded-xl mb-4 transition-colors active:scale-[0.98]">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>

        <motion.div
          className="bg-card border rounded-3xl overflow-hidden shadow-card"
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: easeApp }}
        >
          {tutorial.video_url && (
            <div className="w-full bg-black aspect-video border-b">
              <video src={tutorial.video_url} controls className="w-full h-full" poster="/placeholder.svg">
                Seu navegador não suporta vídeos.
              </video>
            </div>
          )}

          {/* Cabeçalho com gradiente */}
          <div className="relative overflow-hidden bg-gradient-to-br from-primary to-amber-500 px-5 py-6 text-white">
            <div className="pointer-events-none absolute -right-6 -top-8 h-28 w-28 rounded-full bg-white/15 blur-xl" />
            <div className="relative flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/30">
                <Icon className="h-6 w-6" strokeWidth={2.2} />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-black leading-tight">{tutorial.label}</h1>
                {done && (
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-bold">
                    <Check className="h-3 w-3" strokeWidth={3} /> Concluído
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="p-5">
            {steps.length > 0 ? (
              <>
                <p className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary">
                  <PlayCircle size={13} /> Passo a passo
                </p>
                <motion.ol
                  className="flex flex-col gap-3"
                  variants={staggerContainer} initial="hidden" animate="show"
                >
                  {steps.map((step, i) => (
                    <motion.li
                      key={i}
                      variants={fadeUpItem}
                      className="flex items-start gap-3 rounded-2xl border border-transparent bg-muted/40 p-4 transition-colors hover:border-primary/15"
                    >
                      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-black text-white">
                        {i + 1}
                      </span>
                      <span className="pt-0.5 text-sm font-medium leading-relaxed text-foreground">{step}</span>
                    </motion.li>
                  ))}
                </motion.ol>

                <button
                  onClick={finish}
                  disabled={done}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow-md shadow-primary/25 transition-transform active:scale-[0.98] disabled:opacity-60"
                >
                  {done ? <Check className="h-4 w-4" strokeWidth={3} /> : <CheckCircle2 className="h-4 w-4" />}
                  {done ? "Tutorial concluído" : "Marcar como concluído"}
                </button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum conteúdo disponível.</p>
            )}
          </div>
        </motion.div>
      </main>

      {/* Tela de conclusão celebrativa */}
      <AnimatePresence>
        {celebrate && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-6"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setCelebrate(false)}
          >
            <motion.div
              className="relative w-full max-w-xs overflow-hidden rounded-3xl bg-card p-8 text-center"
              initial={{ scale: 0.7, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.85, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/15 blur-2xl" />
              <motion.div
                className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg"
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: [0, -10, 10, 0] }}
                transition={{ duration: 0.7, type: "spring", stiffness: 240, damping: 14 }}
              >
                <PartyPopper className="h-10 w-10" strokeWidth={2} />
              </motion.div>
              <h3 className="text-xl font-extrabold text-foreground">Tutorial concluído!</h3>
              <p className="mt-1 text-sm text-muted-foreground">Mandou bem. Você já sabe usar essa parte do Chamô.</p>
              <div className="mt-6 flex flex-col gap-2">
                <button
                  onClick={() => navigate("/home")}
                  className="w-full rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground active:scale-[0.98] transition-transform"
                >
                  Voltar ao início
                </button>
                <button
                  onClick={() => setCelebrate(false)}
                  className="w-full rounded-2xl py-2.5 text-sm font-semibold text-muted-foreground"
                >
                  Continuar aqui
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AppLayout>
  );
};

export default TutorialDetail;
