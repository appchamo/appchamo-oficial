/**
 * Banner/teaser exibido no topo da Comunidade para profissionais ainda
 * NÃO verificados. Mostra um "post fantasma" do próprio pro (apenas texto)
 * com o selo de verificado destacado, em baixa opacidade (aparência de
 * preview), e um CTA para adquirir o selo.
 *
 * Regra de visibilidade:
 *   - Só para usuários profissionais/empresa (isPro).
 *   - Só quando `professionals.verified !== true`
 *     (se não encontrar registro, assume não-verificado para não esconder).
 *   - Respeita dispensa local via localStorage.
 *
 * Clique no CTA → `/subscriptions` (onde o plano concede o selo).
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BadgeCheck, ChevronRight, Heart, MessageCircle, MoreHorizontal, Share2, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const DISMISS_KEY_PREFIX = "chamo_verified_teaser_dismissed_";

interface ProInfo {
  verified: boolean;
  full_name: string;
  avatar_url: string | null;
  profession_name: string;
}

export default function ProVerifiedCommunityTeaser() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const isPro = profile?.user_type === "professional" || profile?.user_type === "company";
  const [info, setInfo] = useState<ProInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const dismissKey = user?.id ? DISMISS_KEY_PREFIX + user.id : "";

  useEffect(() => {
    if (!dismissKey) return;
    try {
      setDismissed(localStorage.getItem(dismissKey) === "1");
    } catch {
      /* ignore */
    }
  }, [dismissKey]);

  useEffect(() => {
    if (!user?.id || !isPro) {
      setInfo(null);
      return;
    }
    let cancelled = false;

    const fullName = profile?.full_name || "Você";
    const avatarUrl = (profile as any)?.avatar_url ?? null;

    (async () => {
      const { data: pro } = await (supabase as any)
        .from("professionals")
        .select("verified, professions(name)")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;

      const verified = pro?.verified === true;
      const profName = pro?.professions?.name || "Profissional";

      setInfo({
        verified,
        full_name: fullName,
        avatar_url: avatarUrl,
        profession_name: profName,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, isPro, profile?.full_name, (profile as any)?.avatar_url]);

  if (!isPro || !info || info.verified || dismissed) return null;

  const initials = info.full_name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleDismiss = () => {
    if (!dismissKey) return;
    try {
      localStorage.setItem(dismissKey, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  const goSubscribe = () => navigate("/subscriptions");

  return (
    <section className="relative mb-5">
      {/* Etiqueta "EXEMPLO" flutuando por cima do post fantasma */}
      <div className="pointer-events-none absolute inset-x-0 top-16 z-10 flex items-center justify-center">
        <div className="rotate-[-6deg] px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-extrabold uppercase tracking-[0.18em] shadow-lg ring-2 ring-white/80">
          Exemplo
        </div>
      </div>

      {/* Botão de dispensar, acima do post-mock */}
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Ocultar sugestão de selo verificado"
        className="absolute top-2 right-2 z-20 p-1.5 rounded-full bg-white/95 hover:bg-white shadow-sm"
      >
        <X className="w-3.5 h-3.5 text-muted-foreground" />
      </button>

      {/* Post-mock, baixa opacidade (preview) — apenas TEXTO */}
      <div
        aria-hidden
        className="opacity-55 pointer-events-none select-none bg-white dark:bg-zinc-900 rounded-2xl border border-black/[0.06] dark:border-white/10 shadow-sm overflow-hidden"
      >
        <div className="flex items-center gap-3 px-4 pt-4">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary overflow-hidden shrink-0 ring-2 ring-primary/20">
            {info.avatar_url ? (
              <img src={info.avatar_url} alt={info.full_name} className="w-full h-full object-cover" />
            ) : (
              initials
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 min-w-0">
              <p className="font-bold text-[14px] text-foreground truncate leading-tight">{info.full_name}</p>
              {/* Selo verificado destacado */}
              <span className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-blue-500 shrink-0">
                <BadgeCheck className="w-3 h-3 text-white" strokeWidth={2.5} />
              </span>
            </div>
            <p className="text-[12px] text-primary font-semibold truncate mt-0.5">{info.profession_name}</p>
          </div>
          <MoreHorizontal className="w-5 h-5 text-muted-foreground shrink-0" />
        </div>

        <div className="px-4 pt-3 pb-4">
          <p className="text-[14.5px] text-foreground leading-relaxed">
            Mais um cliente atendido hoje 🎉 Obrigado pela confiança! Quem precisar de um
            profissional de qualidade, é só chamar. 💪
          </p>
        </div>

        {/* barra de reações mock */}
        <div className="px-4 py-2 border-t border-black/[0.05] dark:border-white/10 flex items-center gap-4 text-muted-foreground text-[12px]">
          <span className="inline-flex items-center gap-1">
            <Heart className="w-4 h-4" /> 28
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageCircle className="w-4 h-4" /> 6
          </span>
          <span className="inline-flex items-center gap-1 ml-auto">
            <Share2 className="w-4 h-4" />
          </span>
        </div>
      </div>

      {/* CTA "fixo" por baixo do post fantasma */}
      <button
        type="button"
        onClick={goSubscribe}
        className="mt-3 w-full flex items-center gap-3 rounded-2xl bg-gradient-to-r from-primary to-amber-500 text-white text-left px-4 py-3.5 shadow-md shadow-primary/20 active:scale-[0.99] transition-transform"
      >
        <div className="flex items-center justify-center w-9 h-9 rounded-full bg-white/20 shrink-0">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-extrabold leading-tight">Adquira um selo verificado</p>
          <p className="text-[11.5px] font-medium opacity-95 mt-0.5 leading-snug">
            Para os clientes contratarem com mais segurança.
          </p>
        </div>
        <ChevronRight className="w-5 h-5 shrink-0" />
      </button>
    </section>
  );
}
