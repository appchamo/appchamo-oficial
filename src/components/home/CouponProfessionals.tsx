/**
 * Lista "Contrate com desconto" na Home.
 *
 * Regras:
 *   - Só entram profissionais com pelo menos 1 cupom ATIVO (não expirado, com usos disponíveis).
 *   - Mostra o melhor cupom (maior desconto percebido) como destaque na linha.
 *   - Clicando na linha, abre um modal com detalhes do cupom (e CTA "Ver profissional").
 *
 * Layout em lista vertical (mesmo padrão visual do "Profissionais próximos",
 * porém com destaque laranja e o chip do desconto bem prominente à direita).
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, Star, Ticket, ChevronRight, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CouponShowcaseDialog } from "@/components/coupon/CouponShowcaseDialog";

const COUPON_VISIBLE_INITIAL = 3;
const COUPON_VISIBLE_MAX = 6;

interface CouponRow {
  id: string;
  /** Rótulo interno opcional do cupom (migrado de `code`). */
  name: string | null;
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
  const [expanded, setExpanded] = useState(false);
  const [openCouponProId, setOpenCouponProId] = useState<string | null>(null);

  const load = async () => {
    try {
      // 1) Cupons ativos (a policy "Anyone can view active coupons" já filtra expirados/esgotados;
      //     re-aplicamos aqui para robustez caso a policy mude.)
      const { data: rawCoupons, error: cErr } = await supabase
        .from("professional_coupons")
        .select(
          "id, name, professional_id, discount_type, discount_value, min_purchase, max_purchase, max_uses, used_count, expires_at, active",
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

      setItems(rows.slice(0, 50));
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

  const total = items.length;
  const visibleCount = expanded ? Math.min(COUPON_VISIBLE_MAX, total) : Math.min(COUPON_VISIBLE_INITIAL, total);
  const visible = items.slice(0, visibleCount);
  const canExpand = !expanded && total > COUPON_VISIBLE_INITIAL;
  const showAll = total > COUPON_VISIBLE_MAX;

  return (
    <section className="w-full min-w-0">
      <div className="px-1 mb-3 flex items-center gap-2">
        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-primary to-amber-500 shadow-sm">
          <Ticket className="w-4 h-4 text-white" />
        </div>
        <h3 className="font-bold text-foreground tracking-tight text-[15px] lg:text-base">
          Contrate com desconto
        </h3>
        {showAll && (
          <Link to="/search?discount=1" className="ml-auto inline-flex items-center gap-0.5 text-[12px] font-semibold text-primary">
            Ver todos <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>

      <div className="bg-card border-2 border-primary/30 rounded-2xl overflow-hidden shadow-sm">
        {visible.map((pro, i) => (
          <CouponProRow
            key={pro.id}
            pro={pro}
            isLast={i === visible.length - 1 && !canExpand}
            onOpenCoupon={() => setOpenCouponProId(pro.id)}
          />
        ))}
        {canExpand && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5 transition-colors"
          >
            Ver mais {Math.min(COUPON_VISIBLE_MAX, total) - COUPON_VISIBLE_INITIAL > 0 ? `(${Math.min(COUPON_VISIBLE_MAX, total) - COUPON_VISIBLE_INITIAL})` : ""}
            <ChevronDown className="w-4 h-4" />
          </button>
        )}
      </div>

      <CouponShowcaseDialog
        open={!!openPro && !!openCoupon}
        onClose={() => setOpenCouponProId(null)}
        professionalId={openPro?.id ?? ""}
        professionalName={openPro?.full_name ?? "Profissional"}
        coupon={openCoupon ?? null}
        professionalHref={openPro ? `/professional/${openPro.id}` : undefined}
      />
    </section>
  );
};

function CouponProRow({
  pro,
  isLast,
  onOpenCoupon,
}: {
  pro: ProRow;
  isLast: boolean;
  onOpenCoupon: () => void;
}) {
  const initials = (pro.full_name || "P")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const avatarSrc = getAvatarUrl(pro.avatar_url);
  const label = formatCouponShort(pro.coupon);

  return (
    <button
      type="button"
      onClick={onOpenCoupon}
      aria-label={`Ver cupom ${label} de ${pro.full_name}`}
      className={`flex items-center gap-3 px-3 py-3 active:bg-primary/5 transition-colors w-full text-left ${
        !isLast ? "border-b border-primary/15" : ""
      }`}
    >
      <div className="relative shrink-0">
        <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary overflow-hidden">
          {avatarSrc ? (
            <img
              src={avatarSrc}
              alt={pro.full_name}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            initials
          )}
        </div>
        {pro.verified && (
          <div className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-primary rounded-full flex items-center justify-center ring-2 ring-card">
            <BadgeCheck className="w-2.5 h-2.5 text-white" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate leading-tight">
          {pro.full_name}
        </p>
        <p className="text-xs font-medium text-primary truncate mt-0.5">
          {pro.profession_name}
        </p>
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
          <Star className="w-3 h-3 fill-primary text-primary" />
          <span className="font-semibold text-foreground/80">{pro.rating.toFixed(1)}</span>
          <span>· {pro.total_services} serv.</span>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-primary to-amber-500 px-2.5 py-1.5 text-[12px] font-extrabold uppercase tracking-wide text-white shadow-sm">
          <Ticket className="w-3 h-3" />
          {label}
        </span>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </div>
    </button>
  );
}

export default CouponProfessionals;
