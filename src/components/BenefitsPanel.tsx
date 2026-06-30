import { Gift, Ticket, Timer, Percent, Store, ChevronDown, ChevronUp } from "lucide-react";
import { Link } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const BENEFITS_COLLAPSED_KEY = "chamo_benefits_collapsed";

/** Disparado pela Home ao voltar de telas empilhadas (ex.: perfil) e no pull-to-refresh completo. */
export const CHAMO_HOME_SILENT_TICKER = "chamo-home-silent-ticker";

interface BenefitsPanelProps {
  section?: { title?: string };
}

const BenefitsPanel = ({ section }: BenefitsPanelProps) => {
  const [raffleCouponCount, setRaffleCouponCount] = useState(0);
  const [discountCouponCount, setDiscountCouponCount] = useState(0);
  const [nextDraw, setNextDraw] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try { setCollapsed(localStorage.getItem(BENEFITS_COLLAPSED_KEY) === "1"); } catch { /* ignore */ }
  }, []);
  const toggleCollapsed = () => setCollapsed((prev) => {
    const next = !prev;
    try { localStorage.setItem(BENEFITS_COLLAPSED_KEY, next ? "1" : "0"); } catch { /* ignore */ }
    return next;
  });

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;

    const { count: raffleCount } = await supabase
      .from("coupons")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("coupon_type", "raffle")
      .eq("used", false);
    setRaffleCouponCount(raffleCount || 0);

    const { data: discountData } = await supabase
      .from("coupons")
      .select("expires_at")
      .eq("user_id", user.id)
      .eq("coupon_type", "discount")
      .eq("used", false);
    const activeDiscounts = (discountData || []).filter(
      (c: { expires_at?: string | null }) => !c.expires_at || new Date(c.expires_at) > new Date(),
    );
    setDiscountCouponCount(activeDiscounts.length);

    const { data: raffle } = await supabase
      .from("raffles")
      .select("draw_date")
      .eq("status", "upcoming")
      .order("draw_date", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (raffle) setNextDraw((raffle as { draw_date: string }).draw_date);
    else setNextDraw(null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onTick = () => void load();
    window.addEventListener(CHAMO_HOME_SILENT_TICKER, onTick);
    return () => window.removeEventListener(CHAMO_HOME_SILENT_TICKER, onTick);
  }, [load]);

  const getCountdown = () => {
    if (!nextDraw) return "Em breve";
    const diff = new Date(nextDraw).getTime() - Date.now();
    if (diff <= 0) return "Hoje!";
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    return `${days}d ${hours}h`;
  };

  return (
    <div className="gradient-card rounded-2xl p-4 text-primary-foreground shadow-elevated flex flex-col gap-3">
      <button type="button" onClick={toggleCollapsed} aria-expanded={!collapsed} className="flex items-center gap-2 text-left">
        <Gift className="w-5 h-5 shrink-0" />
        <h2 className="font-bold text-base flex-1">{section?.title ?? "Seus Benefícios"}</h2>
        {collapsed ? <ChevronDown className="w-5 h-5 shrink-0" /> : <ChevronUp className="w-5 h-5 shrink-0" />}
      </button>

      {collapsed ? null : (
      <>
      {/* Contadores compactos */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-primary-foreground/15 backdrop-blur-sm rounded-xl px-3 py-2">
          <div className="flex items-center gap-1 mb-0.5">
            <Ticket className="w-3 h-3 opacity-80" />
            <p className="text-[10px] opacity-80">Sorteio</p>
          </div>
          <p className="text-xl font-extrabold leading-none">{raffleCouponCount}</p>
        </div>
        <div className="bg-primary-foreground/15 backdrop-blur-sm rounded-xl px-3 py-2">
          <div className="flex items-center gap-1 mb-0.5">
            <Percent className="w-3 h-3 opacity-80" />
            <p className="text-[10px] opacity-80">Descontos</p>
          </div>
          <p className="text-xl font-extrabold leading-none">{discountCouponCount}</p>
        </div>
        <div className="bg-primary-foreground/15 backdrop-blur-sm rounded-xl px-3 py-2">
          <div className="flex items-center gap-1 mb-0.5">
            <Timer className="w-3 h-3 opacity-80" />
            <p className="text-[10px] opacity-80">Próx. sorteio</p>
          </div>
          <p className="text-sm font-bold leading-none mt-1">{getCountdown()}</p>
        </div>
      </div>

      {/* Ações */}
      <div className="grid grid-cols-2 gap-2">
        <Link
          to="/coupons"
          className="text-center bg-primary-foreground text-primary font-semibold py-2.5 rounded-xl text-sm hover:bg-primary-foreground/90 transition-colors"
        >
          Meus cupons
        </Link>
        <Link
          to="/parceiros"
          className="flex items-center justify-center gap-1.5 bg-primary-foreground/15 hover:bg-primary-foreground/25 font-semibold py-2.5 rounded-xl text-sm transition-colors"
        >
          <Store className="w-4 h-4" /> Parceiros
        </Link>
      </div>
      </>
      )}
    </div>
  );
};

export default BenefitsPanel;
