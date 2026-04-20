import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ProRecordLite {
  experience: string | null;
  services: string[] | null;
  bio: string | null;
  category_id: string | null;
  profession_id: string | null;
  cover_image_url: string | null;
}

interface ProProfileProgressProps {
  userId: string;
}

/**
 * Barra fina com o progresso do perfil do profissional/empresa na Home.
 * Mesma lógica do "Nível de confiança" em ProMarketing.tsx — se o score chegar
 * a 100% o componente não é renderizado (nada de ruído no topo).
 */
const ProProfileProgress = ({ userId }: ProProfileProgressProps) => {
  const [pro, setPro] = useState<ProRecordLite | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!userId) return;
      const { data } = await supabase
        .from("professionals")
        .select("experience, services, bio, category_id, profession_id, cover_image_url")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      setPro((data as ProRecordLite | null) ?? null);
      setLoaded(true);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const { score, pendingCount, nextTip } = useMemo(() => {
    if (!pro) return { score: 0, pendingCount: 5, nextTip: null as string | null };
    const expLen = (pro.experience ?? "").trim().length;
    const bioLen = (pro.bio ?? "").trim().length;
    const servicesCount = pro.services?.length ?? 0;

    const items: { done: boolean; tip: string }[] = [
      {
        done: !!pro.category_id && !!pro.profession_id,
        tip: "Escolha sua categoria e profissão",
      },
      { done: !!pro.cover_image_url, tip: "Adicione uma foto de capa" },
      { done: expLen >= 100, tip: "Detalhe sua experiência (mín. 100 caracteres)" },
      { done: servicesCount >= 3, tip: "Cadastre pelo menos 3 serviços" },
      { done: bioLen >= 50, tip: 'Preencha o "Sobre" (mín. 50 caracteres)' },
    ];
    const done = items.filter((i) => i.done).length;
    const pct = Math.round((done / items.length) * 100);
    const firstPending = items.find((i) => !i.done)?.tip ?? null;
    return { score: pct, pendingCount: items.length - done, nextTip: firstPending };
  }, [pro]);

  if (!loaded || !pro || score >= 100) return null;

  return (
    <Link
      to="/pro/marketing?tab=trust"
      className="block rounded-xl border border-primary/25 bg-gradient-to-br from-primary/5 to-pink-500/5 p-3 transition-colors hover:from-primary/10 hover:to-pink-500/10"
      aria-label="Melhore seu perfil profissional"
    >
      <div className="flex items-center gap-2.5">
        <div className="shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500 to-violet-500 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-foreground leading-tight">
              Seu perfil está {score}% completo
            </p>
            <span className="text-[10px] font-semibold text-primary shrink-0 inline-flex items-center gap-0.5">
              Melhorar <ArrowRight className="w-3 h-3" />
            </span>
          </div>
          <div className="relative mt-1.5 h-1.5 rounded-full overflow-hidden bg-muted">
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-500 via-orange-500 via-yellow-400 via-green-500 via-blue-500 to-purple-600 transition-all duration-500"
              style={{ width: `${Math.max(4, score)}%` }}
            />
          </div>
          {nextTip ? (
            <p className="text-[10px] text-muted-foreground mt-1 truncate">
              Faltam {pendingCount} ajuste{pendingCount === 1 ? "" : "s"} · {nextTip}
            </p>
          ) : null}
        </div>
      </div>
    </Link>
  );
};

export default ProProfileProgress;
