import AppLayout from "@/components/AppLayout";
import { Ticket, Percent, Gift } from "lucide-react";
import { useEffect, useState } from "react";
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

const Coupons = () => {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"raffle" | "discount">("raffle");

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("coupons").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
      setCoupons((data as Coupon[]) || []);
      setLoading(false);
    };
    load();
  }, []);

  const sourceLabel = (s: string) => {
    if (s === "registration") return "Cadastro";
    if (s === "payment") return "Pagamento";
    return s;
  };

  const raffleCoupons = coupons.filter(c => c.coupon_type === "raffle");
  const discountCoupons = coupons.filter(c => c.coupon_type === "discount");
  const filtered = tab === "raffle" ? raffleCoupons : discountCoupons;

  const isExpired = (c: Coupon) => c.expires_at && new Date(c.expires_at) < new Date();

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5">
        <h1 className="text-xl font-bold text-foreground mb-4">Meus Cupons</h1>

        {/* Summary cards */}
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

        {/* Tabs */}
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
                <div key={c.id} className="flex items-center justify-between bg-card border rounded-xl p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {tab === "discount" && c.discount_percent > 0 ? `${c.discount_percent}% de desconto` : sourceLabel(c.source)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(c.created_at).toLocaleDateString("pt-BR")}
                      {tab === "discount" && c.expires_at && (
                        <> · Expira: {new Date(c.expires_at).toLocaleDateString("pt-BR")}</>
                      )}
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    c.used ? "bg-muted text-muted-foreground" : expired ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
                  }`}>
                    {c.used ? "Usado" : expired ? "Expirado" : "Ativo"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </AppLayout>
  );
};

export default Coupons;
