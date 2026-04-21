/**
 * Banner exibido logo abaixo de "Profissionais em destaque" convidando o
 * profissional a conhecer os planos que concedem o espaço de destaque.
 *
 * Só aparece para:
 *   - usuários profissionais/empresa;
 *   - cujo plano atual NÃO concede destaque (plan.has_featured !== true).
 *
 * Toque → navega para /subscriptions.
 */
import { Link } from "react-router-dom";
import { Sparkles, ChevronRight, Star } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";

export default function ProFeaturedUpsellBanner() {
  const { profile } = useAuth();
  const { plan, loading } = useSubscription();

  const isPro = profile?.user_type === "professional" || profile?.user_type === "company";
  if (!isPro) return null;

  // Enquanto carrega, não ocupa espaço para não causar layout shift.
  if (loading) return null;

  // Se o plano atual já dá destaque, não mostra nada.
  if (plan?.has_featured) return null;

  return (
    <Link
      to="/subscriptions"
      className="group relative mt-3 block overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[0.08] via-amber-500/[0.06] to-transparent px-4 py-3.5 shadow-sm active:scale-[0.99] transition-transform"
      aria-label="Conheça os planos que colocam seu perfil em destaque"
    >
      {/* estrelinhas decorativas */}
      <Star
        className="pointer-events-none absolute top-2 right-8 w-3 h-3 text-primary/40 fill-primary/30"
        aria-hidden
      />
      <Star
        className="pointer-events-none absolute bottom-2 right-16 w-2 h-2 text-primary/30 fill-primary/20"
        aria-hidden
      />

      <div className="relative flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-amber-500 text-white shrink-0 shadow-md shadow-primary/25">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] font-extrabold text-foreground leading-tight">
            Quer aparecer nos destaques do app?
          </p>
          <p className="text-[12px] text-muted-foreground leading-snug mt-0.5">
            Conheça nossos planos e ganhe mais visibilidade.
          </p>
        </div>
        <span className="inline-flex items-center gap-0.5 text-primary font-bold text-[12px] shrink-0">
          Ver planos
          <ChevronRight className="w-4 h-4" />
        </span>
      </div>
    </Link>
  );
}
