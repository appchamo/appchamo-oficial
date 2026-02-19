import { Gift, Ticket, Timer, Percent } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const BenefitsPanel = () => {
  const [raffleCouponCount, setRaffleCouponCount] = useState(0);
  const [discountCouponCount, setDiscountCouponCount] = useState(0);
  const [nextDraw, setNextDraw] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Count raffle coupons (not used)
      const { count: raffleCount } = await supabase.from("coupons")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("coupon_type", "raffle")
        .eq("used", false);
      setRaffleCouponCount(raffleCount || 0);

      // Count active discount coupons (not used, not expired)
      const { data: discountData } = await supabase.from("coupons")
        .select("expires_at")
        .eq("user_id", user.id)
        .eq("coupon_type", "discount")
        .eq("used", false);
      const activeDiscounts = (discountData || []).filter(
        (c: any) => !c.expires_at || new Date(c.expires_at) > new Date()
      );
      setDiscountCouponCount(activeDiscounts.length);

      const { data: raffle } = await supabase.from("raffles").select("draw_date").eq("status", "upcoming").order("draw_date").limit(1).single();
      if (raffle) setNextDraw(raffle.draw_date);
    };
    load();
  }, []);

  const getCountdown = () => {
    if (!nextDraw) return "Em breve";
    const diff = new Date(nextDraw).getTime() - Date.now();
    if (diff <= 0) return "Hoje!";
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    return `${days} dias, ${hours}h`;
  };

  return (
    <div className="gradient-card rounded-2xl p-5 text-primary-foreground shadow-elevated">
      <div className="flex items-center gap-2 mb-4">
        <Gift className="w-5 h-5" />
        <h2 className="font-bold text-base">Seus Benefícios</h2>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-primary-foreground/15 backdrop-blur-sm rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Ticket className="w-3.5 h-3.5 opacity-80" />
            <p className="text-[10px] opacity-80">Sorteio</p>
          </div>
          <p className="text-2xl font-extrabold">{raffleCouponCount}</p>
        </div>
        <div className="bg-primary-foreground/15 backdrop-blur-sm rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Percent className="w-3.5 h-3.5 opacity-80" />
            <p className="text-[10px] opacity-80">Desconto</p>
          </div>
          <p className="text-2xl font-extrabold">{discountCouponCount}</p>
        </div>
        <div className="bg-primary-foreground/15 backdrop-blur-sm rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Timer className="w-3.5 h-3.5 opacity-80" />
            <p className="text-[10px] opacity-80">Sorteio</p>
          </div>
          <p className="text-xs font-bold">{getCountdown()}</p>
        </div>
      </div>
      <Link
        to="/coupons"
        className="w-full block text-center bg-primary-foreground text-primary font-semibold py-2.5 rounded-xl text-sm hover:bg-primary-foreground/90 transition-colors"
      >
        Ver meus cupons
      </Link>
    </div>
  );
};

export default BenefitsPanel;
