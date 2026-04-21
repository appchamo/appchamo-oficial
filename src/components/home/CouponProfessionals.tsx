/**
 * Carrossel "Profissionais com Cupons" na Home.
 *
 * Regras:
 *   - Só entram profissionais com pelo menos 1 cupom ATIVO (não expirado, com usos disponíveis).
 *   - Mostra o melhor cupom (maior desconto percebido) como destaque no card.
 *   - Clicando no badge de cupom, abre um modal detalhando valor/teto/compras mínimas.
 *
 * O badge aparece dentro do card do profissional; o card inteiro continua
 * linkando para o perfil público (`/professional/:id`).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, MapPin, Star, Ticket, X, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const CARD_CLASS =
  "flex-none w-[min(11rem,calc(50vw-1.75rem))] sm:w-[13.5rem] lg:w-[15rem] min-w-0";

interface CouponRow {
  id: string;
  code: string;
  professional_id: string;
  discount_type: "amount" | "percent";
  discount_value: number;
  min_purchase: number | null;
  max_purchase: number | null;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
}

interface ProRow {
  id: string;
  user_id: string;
  rating: number;
  total_services: number;
  verified: boolean;
  profession_name: string;
  full_name: string;
  avatar_url: string | null;
  address_city: string | null;
  address_state: string | null;
  coupon: CouponRow;
}

const getAvatarUrl = (avatarUrl?: string | null) => {
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith("http")) return avatarUrl;
  return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/uploads/${avatarUrl}`;
};

const formatBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

/** Label curto do desconto (ex.: "10% OFF", "R$ 20 OFF"). */
function formatCouponShort(c: CouponRow): string {
  if (c.discount_type === "percent") {
    const n = Number(c.discount_value);
    const rounded = Math.round(n * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}% OFF`;
  }
  return `${formatBRL(Number(c.discount_value))} OFF`;
}

/** Ordena os cupons escolhendo um "principal" por profissional: maior percentual, depois maior valor fixo. */
function pickBestCouponForPro(coupons: CouponRow[]): CouponRow {
  const sorted = [...coupons].sort((a, b) => {
    const aScore = a.discount_type === "percent" ? Number(a.discount_value) : 0;
    const bScore = b.discount_type === "percent" ? Number(b.discount_value) : 0;
    if (aScore !== bScore) return bScore - aScore;
    const aAmt = a.discount_type === "amount" ? Number(a.discount_value) : 0;
    const bAmt = b.discount_type === "amount" ? Number(b.discount_value) : 0;
    return bAmt - aAmt;
  });
  return sorted[0];
}

const CouponProfessionals = () => {
  const [items, setItems] = useState<ProRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openCouponProId, setOpenCouponProId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      // 1) Cupons ativos (a policy "Anyone can view active coupons" já filtra expirados/esgotados;
      //     re-aplicamos aqui para robustez caso a policy mude.)
      const { data: rawCoupons, error: cErr } = await supabase
        .from("professional_coupons")
        .select(
          "id, code, professional_id, discount_type, discount_value, min_purchase, max_purchase, max_uses, used_count, expires_at, active",
        )
        .eq("active", true)
        .limit(200);
      if (cErr) throw cErr;
      const now = Date.now();
      const coupons = (rawCoupons || []).filter((c: any) => {
        if (c.expires_at && new Date(c.expires_at).getTime() <= now) return false;
        if (c.max_uses != null && (c.used_count ?? 0) >= c.max_uses) return false;
        return true;
      }) as CouponRow[];
      if (coupons.length === 0) {
        setItems([]);
        setLoaded(true);
        return;
      }

      // 2) Para cada pro, fica com o "melhor" cupom (visível como destaque).
      const byPro = new Map<string, CouponRow[]>();
      for (const c of coupons) {
        const list = byPro.get(c.professional_id) ?? [];
        list.push(c);
        byPro.set(c.professional_id, list);
      }
      const proIds = Array.from(byPro.keys());

      // 3) Dados dos profissionais + perfil público (avatar / nome).
      const { data: pros, error: pErr } = await supabase
        .from("professionals")
        .select(
          "id, user_id, rating, total_services, verified, active, profile_status, availability_status, categories(name), professions(name)",
        )
        .in("id", proIds)
        .eq("active", true)
        .eq("profile_status", "approved")
        .neq("availability_status", "unavailable");
      if (pErr) throw pErr;
      const proList = (pros || []) as any[];
      if (proList.length === 0) {
        setItems([]);
        setLoaded(true);
        return;
      }

      const userIds = proList.map((p) => p.user_id);
      const [{ data: pubProfiles }, { data: locProfiles }] = await Promise.all([
        supabase.from("profiles_public" as any).select("user_id, full_name, avatar_url").in("user_id", userIds),
        supabase.from("profiles").select("user_id, address_city, address_state").in("user_id", userIds),
      ]);
      const pubMap = new Map(
        ((pubProfiles || []) as { user_id: string; full_name: string; avatar_url: string | null }[]).map((p) => [p.user_id, p]),
      );
      const locMap = new Map(
        ((locProfiles || []) as { user_id: string; address_city: string | null; address_state: string | null }[]).map((p) => [p.user_id, p]),
      );

      const rows: ProRow[] = proList.map((p) => {
        const best = pickBestCouponForPro(byPro.get(p.id) ?? []);
        return {
          id: p.id,
          user_id: p.user_id,
          rating: Number(p.rating ?? 0),
          total_services: Number(p.total_services ?? 0),
          verified: !!p.verified,
          profession_name: p.professions?.name || p.categories?.name || "—",
          full_name: pubMap.get(p.user_id)?.full_name || "Profissional",
          avatar_url: pubMap.get(p.user_id)?.avatar_url ?? null,
          address_city: locMap.get(p.user_id)?.address_city ?? null,
          address_state: locMap.get(p.user_id)?.address_state ?? null,
          coupon: best,
        };
      });

      // Ordena: melhor desconto (%) primeiro, depois verificados.
      rows.sort((a, b) => {
        const ap = a.coupon.discount_type === "percent" ? Number(a.coupon.discount_value) : 0;
        const bp = b.coupon.discount_type === "percent" ? Number(b.coupon.discount_value) : 0;
        if (ap !== bp) return bp - ap;
        if (a.verified !== b.verified) return a.verified ? -1 : 1;
        return b.rating - a.rating;
      });

      setItems(rows.slice(0, 18));
      setLoaded(true);
    } catch (err) {
      console.warn("[CouponProfessionals] load failed:", err);
      setItems([]);
      setLoaded(true);
    }
  };

  useEffect(() => {
    void load();
    const channel = supabase
      .channel("coupon-home-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "professional_coupons" },
        () => void load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const openCoupon = useMemo(
    () => items.find((i) => i.id === openCouponProId)?.coupon ?? null,
    [items, openCouponProId],
  );
  const openPro = useMemo(
    () => items.find((i) => i.id === openCouponProId) ?? null,
    [items, openCouponProId],
  );

  if (!loaded) return null;
  if (items.length === 0) return null;

  return (
    <section className="w-full min-w-0">
      <div className="px-1 mb-3 flex items-center gap-2">
        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-primary to-amber-500 shadow-sm">
          <Ticket className="w-4 h-4 text-white" />
        </div>
        <h3 className="font-bold text-foreground tracking-tight text-[15px] lg:text-base">
          Contrate com desconto
        </h3>
        <span className="ml-auto text-[11px] font-semibold text-primary/80 uppercase tracking-wide">
          {items.length} {items.length === 1 ? "oferta" : "ofertas"}
        </span>
      </div>

      <div
        ref={scrollRef}
        data-tab-swipe-ignore
        className="flex overflow-x-auto overflow-y-hidden gap-3 lg:gap-4 pb-2 scrollbar-hide px-1 box-border overscroll-x-contain"
        style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-x pan-y" }}
      >
        {items.map((pro) => (
          <div key={pro.id} className={CARD_CLASS}>
            <CouponProCard pro={pro} onOpenCoupon={() => setOpenCouponProId(pro.id)} />
          </div>
        ))}
      </div>

      <CouponDetailsDialog
        open={!!openPro && !!openCoupon}
        pro={openPro}
        coupon={openCoupon}
        onClose={() => setOpenCouponProId(null)}
      />
    </section>
  );
};

function CouponProCard({ pro, onOpenCoupon }: { pro: ProRow; onOpenCoupon: () => void }) {
  const initials = (pro.full_name || "P")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const avatarSrc = getAvatarUrl(pro.avatar_url);
  const cityLine =
    pro.address_city || pro.address_state
      ? [pro.address_city, pro.address_state].filter(Boolean).join(", ")
      : null;
  const label = formatCouponShort(pro.coupon);

  return (
    <div className="relative w-full min-w-0 min-h-0 flex">
      {/* Ribbon do cupom — fica acima do card sem bloquear o Link para o perfil. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onOpenCoupon();
        }}
        aria-label={`Ver detalhes do cupom ${label}`}
        className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-full bg-gradient-to-r from-primary to-amber-500 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-md ring-2 ring-white active:scale-[0.96] transition-transform"
      >
        <Ticket className="w-3 h-3" />
        {label}
      </button>

      <Link
        to={`/professional/${pro.id}`}
        className={cn(
          "bg-card rounded-xl lg:rounded-2xl border-2 border-primary/25 shadow-card p-4 lg:p-5 flex flex-col gap-2.5 lg:gap-3 w-full min-w-0 overflow-hidden active:scale-[0.97] transition-transform",
        )}
      >
        <div className="flex gap-4 lg:gap-5 items-start w-full min-w-0 mt-6">
          <div className="relative shrink-0 self-start">
            <div className="w-16 h-16 lg:w-[72px] lg:h-[72px] rounded-full bg-muted flex items-center justify-center text-base font-bold text-muted-foreground overflow-hidden ring-2 ring-border/40">
              {avatarSrc ? (
                <img
                  src={avatarSrc}
                  alt={pro.full_name}
                  className="w-full h-full object-cover rounded-full"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                initials
              )}
            </div>
            {pro.verified && (
              <div className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-primary rounded-full flex items-center justify-center ring-2 ring-card shadow-sm">
                <BadgeCheck className="w-3 h-3 text-white" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0" />
        </div>

        <div className="min-w-0 -mt-0.5">
          <p className="font-bold text-foreground text-sm lg:text-base truncate leading-tight">
            {pro.full_name}
          </p>
          <p className="text-sm lg:text-[15px] font-semibold text-primary truncate mt-0.5">
            {pro.profession_name}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <Star className="w-3.5 h-3.5 fill-primary text-primary flex-shrink-0" />
          <span className="text-sm font-semibold text-foreground">{pro.rating.toFixed(1)}</span>
          <span className="text-xs text-muted-foreground">· {pro.total_services} serv.</span>
        </div>

        {cityLine && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="w-3 h-3 text-primary flex-shrink-0" />
            <span className="truncate">{cityLine}</span>
          </div>
        )}

        <div className="mt-auto pt-1">
          <div className="w-full text-center text-sm font-semibold py-2.5 rounded-lg bg-primary text-white flex items-center justify-center gap-1">
            Contrate com desconto
            <ChevronRight className="w-4 h-4" aria-hidden />
          </div>
        </div>
      </Link>
    </div>
  );
}

function CouponDetailsDialog({
  open,
  pro,
  coupon,
  onClose,
}: {
  open: boolean;
  pro: ProRow | null;
  coupon: CouponRow | null;
  onClose: () => void;
}) {
  if (!coupon || !pro) {
    return (
      <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
        <DialogContent className="max-w-sm" />
      </Dialog>
    );
  }
  const label = formatCouponShort(coupon);
  const isUnlimited = coupon.max_uses == null;
  const remaining = coupon.max_uses != null ? Math.max(0, coupon.max_uses - (coupon.used_count ?? 0)) : null;

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent className="max-w-sm p-0 overflow-hidden rounded-2xl">
        <div className="relative bg-gradient-to-br from-primary via-amber-500 to-primary p-5 text-white">
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] opacity-95">
            <Ticket className="w-4 h-4" /> Cupom de desconto
          </div>
          <div className="mt-2 text-3xl font-black leading-none drop-shadow-sm">{label}</div>
          <div className="mt-1 text-sm font-semibold opacity-95">com {pro.full_name}</div>
        </div>

        <div className="p-5 space-y-4">
          <DialogHeader>
            <DialogTitle className="text-base">Detalhes do cupom</DialogTitle>
          </DialogHeader>

          <ul className="text-sm text-foreground space-y-2.5">
            <li className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Tipo do desconto</span>
              <span className="font-semibold">
                {coupon.discount_type === "percent" ? "Porcentagem" : "Valor fixo"}
              </span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Valor</span>
              <span className="font-semibold">
                {coupon.discount_type === "percent"
                  ? `${Number(coupon.discount_value)}%`
                  : formatBRL(Number(coupon.discount_value))}
              </span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Compra mínima</span>
              <span className="font-semibold">
                {coupon.min_purchase != null ? formatBRL(Number(coupon.min_purchase)) : "Sem mínimo"}
              </span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Compra máxima</span>
              <span className="font-semibold">
                {coupon.max_purchase != null ? formatBRL(Number(coupon.max_purchase)) : "Sem teto"}
              </span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Usos</span>
              <span className="font-semibold">
                {isUnlimited
                  ? "Ilimitado"
                  : remaining != null && remaining > 0
                    ? `${remaining} restante${remaining === 1 ? "" : "s"}`
                    : "Esgotado"}
              </span>
            </li>
            {coupon.expires_at && (
              <li className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Validade</span>
                <span className="font-semibold">
                  {new Date(coupon.expires_at).toLocaleDateString("pt-BR")}
                </span>
              </li>
            )}
          </ul>

          <p className="text-[11px] text-muted-foreground leading-snug">
            O cupom é aplicado automaticamente na tela de pagamento quando você contratar este
            profissional. Respeita compra mínima e teto, se houver.
          </p>

          <Link
            to={`/professional/${pro.id}`}
            onClick={onClose}
            className="mt-1 flex items-center justify-center gap-1.5 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-md hover:shadow-lg active:scale-[0.99] transition-all"
          >
            Ver profissional
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CouponProfessionals;
