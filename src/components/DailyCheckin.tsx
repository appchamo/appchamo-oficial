/**
 * Check-in diário do programa de recompensas.
 * Streak até 30 dias. Cupom em 10 (2%), 20 (5%) e 30 (10% + sorteio + caixinha).
 */
import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarCheck, Gift, Flame, Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

const spDate = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); // YYYY-MM-DD
};

const MILESTONES = [
  { day: 10, label: "2% OFF" },
  { day: 20, label: "5% OFF" },
  { day: 30, label: "🎁 Especial" },
];

export default function DailyCheckin({ hideWhenDone = false }: { hideWhenDone?: boolean } = {}) {
  const { user } = useAuth();
  const [streak, setStreak] = useState(0);
  const [lastDate, setLastDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [gift, setGift] = useState(false);

  const today = spDate(0);
  const yesterday = spDate(-1);
  const checkedToday = lastDate === today;
  const alive = lastDate === today || lastDate === yesterday;
  const displayStreak = alive ? streak : 0;
  const pct = Math.min(100, (displayStreak / 30) * 100);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("checkin_streaks" as any)
      .select("current_streak, last_checkin_date")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) {
      setStreak((data as any).current_streak ?? 0);
      setLastDate((data as any).last_checkin_date ?? null);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const doCheckin = async () => {
    if (checking || checkedToday) return;
    setChecking(true);
    const { data, error } = await supabase.rpc("daily_checkin" as any);
    setChecking(false);
    if (error) {
      toast({ title: "Erro no check-in", description: error.message, variant: "destructive" });
      return;
    }
    const res = data as { already?: boolean; streak: number; reward: string | null };
    setStreak(res.streak);
    setLastDate(today);
    if (res.reward === "discount_2") toast({ title: "🎉 10 dias! Ganhou um cupom de 2% OFF" });
    else if (res.reward === "discount_5") toast({ title: "🔥 20 dias! Ganhou um cupom de 5% OFF" });
    else if (res.reward === "special_30") { setGift(true); }
    else toast({ title: `Check-in feito! Sequência: ${res.streak} dia${res.streak > 1 ? "s" : ""}` });
  };

  if (loading) {
    if (hideWhenDone) return null; // na Home, não pisca loader
    return <div className="bg-card border rounded-2xl p-5 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  }

  // Na Home: some assim que o check-in do dia já foi feito.
  if (hideWhenDone && checkedToday) return null;

  return (
    <div className="bg-card border rounded-2xl p-5 overflow-hidden">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-amber-500 flex items-center justify-center">
          <CalendarCheck className="w-4 h-4 text-white" />
        </div>
        <h2 className="font-bold text-foreground">Check-in diário</h2>
        <span className="ml-auto flex items-center gap-1 text-sm font-bold text-primary">
          <Flame className="w-4 h-4" /> {displayStreak}/30
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">Faça check-in todo dia e ganhe prêmios. Perdeu um dia, recomeça!</p>

      {/* Barra com marcos */}
      <div className="relative h-3 bg-muted rounded-full mb-2">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-primary to-amber-500"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        />
        {MILESTONES.map((m) => (
          <div key={m.day} className="absolute -top-1.5" style={{ left: `calc(${(m.day / 30) * 100}% - 12px)` }}>
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[9px] font-bold ${
              displayStreak >= m.day ? "bg-primary border-primary text-white" : "bg-card border-muted-foreground/30 text-muted-foreground"
            }`}>
              {m.day}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground mb-4 px-1">
        {MILESTONES.map((m) => (
          <span key={m.day} className={displayStreak >= m.day ? "text-primary font-semibold" : ""}>{m.label}</span>
        ))}
      </div>

      <button
        onClick={doCheckin}
        disabled={checking || checkedToday}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm active:scale-[0.98] transition-transform disabled:opacity-60"
      >
        {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : checkedToday ? <Check className="w-4 h-4" /> : <CalendarCheck className="w-4 h-4" />}
        {checkedToday ? "Check-in de hoje feito ✓" : "Fazer check-in de hoje"}
      </button>

      {/* Caixinha de presente — 30 dias */}
      <AnimatePresence>
        {gift && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setGift(false)}
          >
            <motion.div
              className="bg-card rounded-3xl p-8 text-center max-w-xs w-full"
              initial={{ scale: 0.6, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
              onClick={(e) => e.stopPropagation()}
            >
              <motion.div
                className="text-6xl mb-3"
                initial={{ rotate: -10, scale: 0 }} animate={{ rotate: [0, -12, 12, 0], scale: 1 }}
                transition={{ duration: 0.7, delay: 0.1 }}
              >🎁</motion.div>
              <h3 className="text-xl font-extrabold text-foreground mb-1">30 dias seguidos!</h3>
              <p className="text-sm text-muted-foreground mb-4">Você desbloqueou o prêmio especial:</p>
              <div className="space-y-2 mb-5 text-sm font-semibold">
                <div className="rounded-xl bg-primary/10 text-primary py-2">Cupom 10% OFF</div>
                <div className="rounded-xl bg-amber-500/10 text-amber-600 py-2">+ 1 cupom de sorteio</div>
              </div>
              <button onClick={() => setGift(false)} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm">
                Resgatar
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
