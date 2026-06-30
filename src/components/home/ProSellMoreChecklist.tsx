/**
 * Checklist "Dicas para vender mais" na Home do profissional.
 *
 * 5 itens, cada um vira uma linha clicável que leva à tela relevante:
 *   1. Melhore seu nível de confiança (100%)     → /pro/marketing?tab=trust
 *   2. Crie um cupom para clientes               → /pro/marketing?tab=coupons
 *   3. Publique na comunidade                    → /home?feed=comunidade
 *   4. Conclua um serviço                        → /messages
 *   5. Consiga uma avaliação                     → perfil público do pro
 *
 * O critério de "100% de confiança" replica a mesma regra do `TrustLevelTab`
 * em ProMarketing (categoria+profissão, capa, experiência 100+, 3 serviços, bio 50+).
 *
 * Quando todas as 5 estão concluídas, mostra um card comemorativo com opção
 * de ocultar; a preferência fica em `localStorage`.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, ChevronDown, ChevronRight, ChevronUp, Circle, Sparkles, TrendingUp, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  professionalId: string;
  userId: string;
}

type ChecklistKey = "trust" | "coupon" | "community" | "service" | "review";

interface ChecklistItem {
  key: ChecklistKey;
  label: string;
  description: string;
  done: boolean;
  onGo: () => void;
}

const DISMISS_KEY_PREFIX = "chamo_sell_more_checklist_dismissed_";
const MINIMIZE_KEY_PREFIX = "chamo_sell_more_checklist_minimized_";

function computeTrustDone(pro: {
  experience: string | null;
  services: string[] | null;
  bio: string | null;
  category_id: string | null;
  profession_id: string | null;
  cover_image_url: string | null;
}): boolean {
  const expLen = (pro.experience ?? "").trim().length;
  const bioLen = (pro.bio ?? "").trim().length;
  const servicesCount = pro.services?.length ?? 0;
  const hasCat = !!pro.category_id && !!pro.profession_id;
  const hasCover = !!pro.cover_image_url;
  const hasExp = expLen >= 100;
  const hasServices = servicesCount >= 3;
  const hasBio = bioLen >= 50;
  return hasCat && hasCover && hasExp && hasServices && hasBio;
}

export default function ProSellMoreChecklist({ professionalId, userId }: Props) {
  const navigate = useNavigate();
  const dismissKey = DISMISS_KEY_PREFIX + userId;
  const minimizeKey = MINIMIZE_KEY_PREFIX + userId;

  const [minimized, setMinimized] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [trustDone, setTrustDone] = useState(false);
  const [couponDone, setCouponDone] = useState(false);
  const [communityDone, setCommunityDone] = useState(false);
  const [serviceDone, setServiceDone] = useState(false);
  const [reviewDone, setReviewDone] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(dismissKey) === "1");
      setMinimized(localStorage.getItem(minimizeKey) === "1");
    } catch {
      /* ignore */
    }
  }, [dismissKey, minimizeKey]);

  const toggleMinimized = () => {
    setMinimized((prev) => {
      const next = !prev;
      try { localStorage.setItem(minimizeKey, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };

  useEffect(() => {
    if (!professionalId || !userId) return;
    let cancelled = false;

    (async () => {
      const [proRes, couponRes, postRes, serviceRes, reviewRes] = await Promise.all([
        supabase
          .from("professionals")
          .select("experience, services, bio, category_id, profession_id, cover_image_url")
          .eq("id", professionalId)
          .maybeSingle(),
        (supabase as any)
          .from("professional_coupons")
          .select("id", { count: "exact", head: true })
          .eq("professional_id", professionalId)
          .eq("active", true),
        (supabase as any)
          .from("community_posts")
          .select("id", { count: "exact", head: true })
          .eq("author_id", userId),
        supabase
          .from("service_requests")
          .select("id", { count: "exact", head: true })
          .eq("professional_id", professionalId)
          .eq("status", "completed"),
        supabase
          .from("reviews")
          .select("id", { count: "exact", head: true })
          .eq("professional_id", professionalId),
      ]);

      if (cancelled) return;
      setTrustDone(proRes.data ? computeTrustDone(proRes.data as any) : false);
      setCouponDone((couponRes.count ?? 0) > 0);
      setCommunityDone((postRes.count ?? 0) > 0);
      setServiceDone((serviceRes.count ?? 0) > 0);
      setReviewDone((reviewRes.count ?? 0) > 0);
      setLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [professionalId, userId]);

  const items: ChecklistItem[] = useMemo(
    () => [
      {
        key: "trust",
        label: "Melhore a confiança do seu perfil",
        description: "Complete os 5 critérios e atinja 100%.",
        done: trustDone,
        onGo: () => navigate("/pro/marketing?tab=trust"),
      },
      {
        key: "coupon",
        label: "Crie um cupom para clientes",
        description: "Ofereça desconto e atraia mais pedidos.",
        done: couponDone,
        onGo: () => navigate("/pro/marketing?tab=coupons"),
      },
      {
        key: "community",
        label: "Publique na comunidade",
        description: "Apareça para quem ainda não te conhece.",
        done: communityDone,
        onGo: () => navigate("/home?feed=comunidade"),
      },
      {
        key: "service",
        label: "Conclua um serviço",
        description: "Feche sua primeira venda pelo app.",
        done: serviceDone,
        onGo: () => navigate("/messages"),
      },
      {
        key: "review",
        label: "Consiga uma avaliação",
        description: "Peça para o cliente deixar a nota após o serviço.",
        done: reviewDone,
        onGo: () => navigate(`/professional/${professionalId}`),
      },
    ],
    [trustDone, couponDone, communityDone, serviceDone, reviewDone, professionalId, navigate],
  );

  if (!loaded) return null;
  if (dismissed) return null;

  const doneCount = items.filter((i) => i.done).length;
  const allDone = doneCount === items.length;
  const pct = Math.round((doneCount / items.length) * 100);

  // Concluiu 100% → sai da Home automaticamente.
  if (allDone) return null;

  const handleDismiss = () => {
    try {
      localStorage.setItem(dismissKey, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <section className="w-full min-w-0">
      <div className="bg-card border-2 border-primary/20 rounded-2xl overflow-hidden shadow-sm">
        {/* Cabeçalho: área clicável (minimiza/expande) + botão X (fecha de vez) */}
        <div className="w-full flex items-center gap-2 px-4 pt-4 pb-3">
          <button
            type="button"
            onClick={toggleMinimized}
            aria-expanded={!minimized}
            className="flex items-center gap-2 flex-1 min-w-0 text-left active:opacity-80 transition-opacity"
          >
            <div className="flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-primary to-amber-500 shadow-sm shrink-0">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <h3 className="font-bold text-foreground tracking-tight text-[15px] lg:text-base truncate">
              Dicas para vender mais
            </h3>
            <span className="ml-auto text-[11px] font-bold text-primary uppercase tracking-wide shrink-0">
              {doneCount}/{items.length}
            </span>
            {minimized ? (
              <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />
            ) : (
              <ChevronUp className="w-5 h-5 text-muted-foreground shrink-0" />
            )}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Fechar dicas"
            className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!minimized && (
          <>
        {/* Barra de progresso logo abaixo do cabeçalho */}
        <div className="h-1.5 bg-muted">
          <div
            className="h-full bg-gradient-to-r from-primary to-amber-500 transition-all duration-500"
            style={{ width: `${Math.max(2, pct)}%` }}
          />
        </div>

        {allDone ? (
          <div className="p-5 flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-foreground text-sm">Tudo pronto, parabéns!</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                Você concluiu os 5 passos. Seu perfil está afiado para atrair mais clientes.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Ocultar dicas"
              className="shrink-0 p-1.5 rounded-lg hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        ) : (
          items.map((item, i) => (
            <ChecklistRow key={item.key} item={item} isLast={i === items.length - 1} />
          ))
        )}
          </>
        )}
      </div>
    </section>
  );
}

function ChecklistRow({ item, isLast }: { item: ChecklistItem; isLast: boolean }) {
  return (
    <button
      type="button"
      onClick={item.onGo}
      aria-label={`${item.label}${item.done ? " (concluído)" : ""}`}
      className={`flex items-center gap-3 px-4 py-3 w-full text-left active:bg-primary/[0.04] transition-colors ${
        !isLast ? "border-b border-border/60" : ""
      }`}
    >
      {item.done ? (
        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" strokeWidth={2.25} />
      ) : (
        <Circle className="w-5 h-5 text-muted-foreground/50 shrink-0" strokeWidth={2} />
      )}
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-semibold leading-tight truncate ${
            item.done ? "text-muted-foreground line-through" : "text-foreground"
          }`}
        >
          {item.label}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{item.description}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </button>
  );
}
