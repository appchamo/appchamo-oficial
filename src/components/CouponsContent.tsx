/**
 * Conteúdo de "Meus Cupons" (lista + modal de detalhes), sem layout.
 * Usado na página /coupons e como aba dentro do Programa de Recompensas.
 */
import { Ticket, Percent, Gift, X, Calendar, Clock, Tag, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";

interface Coupon {
  id: string;
  source: string;
  created_at: string;
  used: boolean;
  coupon_type: string;
  discount_percent: number;
  expires_at: string | null;
}

const sourceLabel = (s: string) => {
  switch (s) {
    case "registration": return "Cadastro";
    case "payment": return "Pagamento";
    case "bonus": return "Roleta / Recompensas";
    case "admin": return "Administração";
    default: return s;
  }
};

const fmtDateTime = (s: string | null) => {
  if (!s) return "—";
  return new Date(s).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
};

export default function CouponsContent() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"raffle" | "discount">("raffle");
  const [selected, setSelected] = useState<Coupon | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setCoupons([]); return; }
        const { data } = await supabase.from("coupons").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
        setCoupons((data as Coupon[]) || []);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const raffleCoupons = coupons.filter(c => c.coupon_type === "raffle");
  const discountCoupons = coupons.filter(c => c.coupon_type === "discount");
  const filtered = tab === "raffle" ? raffleCoupons : discountCoupons;

  const isExpired = (c: Coupon) => !!c.expires_at && new Date(c.expires_at) < new Date();
  const couponTitle = (c: Coupon) =>
    c.coupon_type === "discount" && c.discount_percent > 0 ? `${c.discount_percent}% de desconto` : "Bilhete de sorteio";
  const statusOf = (c: Coupon) => c.used ? "Usado" : isExpired(c) ? "Expirado" : "Ativo";

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-card border rounded-2xl p-4 shadow-card text-center">
          <Ticket className="w-8 h-8 text-primary mx-auto mb-2" />
          <p className="text-2xl font-bold text-foreground">{raffleCoupons.filter(c => !c.used).length}</p>
          <p className="text-xs text-muted-foreground">Cupons de sorteio</p>
        </div>
        <div className="bg-card border rounded-2xl p-4 shadow-card text-center">
          <Percent className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
          <p className="text-2xl font-bold text-foreground">{discountCoupons.filter(c => !c.used && !isExpired(c)).length}</p>
          <p className="text-xs text-muted-foreground">Cupons de desconto</p>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab("raffle")}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${tab === "raffle" ? "bg-primary text-primary-foreground" : "bg-card border text-foreground"}`}
        >
          <Gift className="w-4 h-4 inline mr-1.5" />Sorteio
        </button>
        <button
          onClick={() => setTab("discount")}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${tab === "discount" ? "bg-primary text-primary-foreground" : "bg-card border text-foreground"}`}
        >
          <Percent className="w-4 h-4 inline mr-1.5" />Desconto
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          {tab === "raffle" ? "Nenhum cupom de sorteio ainda." : "Nenhum cupom de desconto ainda."}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((c) => {
            const expired = isExpired(c);
            return (
              <button
                key={c.id}
                onClick={() => setSelected(c)}
                className="flex items-center justify-between bg-card border rounded-xl p-3 text-left w-full transition-all hover:border-primary/40 active:scale-[0.99]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${c.coupon_type === "discount" ? "bg-emerald-500/10 text-emerald-600" : "bg-primary/10 text-primary"}`}>
                    {c.coupon_type === "discount" ? <Percent className="w-4 h-4" /> : <Ticket className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{couponTitle(c)}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(c.created_at).toLocaleDateString("pt-BR")}
                      {c.coupon_type === "discount" && c.expires_at && (
                        <> · Expira: {fmtDateTime(c.expires_at)}</>
                      )}
                    </p>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                  c.used ? "bg-muted text-muted-foreground" : expired ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
                }`}>
                  {statusOf(c)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {selected && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-5"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setSelected(null)}
          >
            <motion.div
              className="relative bg-card w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-6 overflow-hidden"
              initial={{ y: 40, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: "spring", stiffness: 280, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setSelected(null)}
                aria-label="Fechar"
                className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex flex-col items-center text-center mb-5">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-3 ${
                  selected.coupon_type === "discount" ? "bg-gradient-to-br from-emerald-500 to-emerald-600" : "bg-gradient-to-br from-primary to-amber-500"
                } text-white shadow-lg`}>
                  {selected.coupon_type === "discount"
                    ? <span className="text-xl font-black">{selected.discount_percent}%</span>
                    : <Ticket className="w-7 h-7" />}
                </div>
                <h2 className="text-lg font-extrabold text-foreground">{couponTitle(selected)}</h2>
                <span className={`mt-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                  selected.used ? "bg-muted text-muted-foreground"
                  : isExpired(selected) ? "bg-destructive/10 text-destructive"
                  : "bg-emerald-500/15 text-emerald-600"
                }`}>
                  {statusOf(selected)}
                </span>
              </div>

              <div className="space-y-3 text-sm">
                <Row icon={<Tag className="w-4 h-4" />} label="Origem" value={sourceLabel(selected.source)} />
                <Row icon={<Calendar className="w-4 h-4" />} label="Gerado em" value={fmtDateTime(selected.created_at)} />
                <Row
                  icon={<Clock className="w-4 h-4" />}
                  label="Expira em"
                  value={selected.coupon_type === "raffle" ? "Não expira (vale para o sorteio)" : fmtDateTime(selected.expires_at)}
                />
                <Row
                  icon={<CheckCircle2 className="w-4 h-4" />}
                  label="Tipo"
                  value={selected.coupon_type === "discount" ? "Desconto na compra" : "Bilhete do sorteio mensal"}
                />
              </div>

              <p className="mt-5 text-xs text-muted-foreground text-center leading-relaxed">
                {selected.coupon_type === "discount"
                  ? "Use este desconto na sua próxima compra dentro do app, antes de expirar."
                  : "Este bilhete concorre ao sorteio mensal do Chamô. Boa sorte! 🍀"}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 px-3.5 py-2.5">
      <span className="flex items-center gap-2 text-muted-foreground">{icon}{label}</span>
      <span className="font-semibold text-foreground text-right">{value}</span>
    </div>
  );
}
