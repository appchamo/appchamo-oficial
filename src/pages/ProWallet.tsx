import AppLayout from "@/components/AppLayout";
import { Wallet, Clock, CheckCircle2, TrendingUp, AlertCircle, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface WalletTx {
  id: string;
  amount: number;
  description: string;
  status: string;
  created_at: string;
  transferred_at: string | null;
}

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const ProWallet = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<WalletTx[]>([]);
  const [pixKey, setPixKey] = useState<string | null>(null);
  const [pixKeyType, setPixKeyType] = useState<string | null>(null);
  const [tab, setTab] = useState<"pending" | "transferred">("pending");

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      // Busca professional_id
      const { data: pro } = await supabase
        .from("professionals")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!pro) { setLoading(false); return; }

      // Busca chave PIX
      const { data: fiscal } = await supabase
        .from("professional_fiscal_info")
        .select("pix_key, pix_key_type")
        .eq("professional_id", pro.id)
        .maybeSingle();
      setPixKey(fiscal?.pix_key || null);
      setPixKeyType(fiscal?.pix_key_type || null);

      // Busca transações da carteira
      const { data: txs } = await supabase
        .from("wallet_transactions")
        .select("id, amount, description, status, created_at, transferred_at")
        .eq("professional_id", pro.id)
        .order("created_at", { ascending: false });

      setTransactions((txs || []).map(t => ({ ...t, amount: Number(t.amount) })));
      setLoading(false);
    };
    load();
  }, [user]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("pro_wallet_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "wallet_transactions" }, () => {
        // Recarrega ao detectar mudança
        supabase.from("professionals").select("id").eq("user_id", user.id).maybeSingle().then(({ data: pro }) => {
          if (!pro) return;
          supabase.from("wallet_transactions").select("id, amount, description, status, created_at, transferred_at")
            .eq("professional_id", pro.id).order("created_at", { ascending: false })
            .then(({ data: txs }) => setTransactions((txs || []).map(t => ({ ...t, amount: Number(t.amount) }))));
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const pending = transactions.filter(t => t.status === "pending");
  const transferred = transactions.filter(t => t.status === "transferred");
  const pendingTotal = pending.reduce((s, t) => s + t.amount, 0);
  const transferredTotal = transferred.reduce((s, t) => s + t.amount, 0);
  const displayed = tab === "pending" ? pending : transferred;

  return (
    <AppLayout>
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center gap-2">
          <Wallet className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold">Minha Carteira</h1>
        </div>

        {/* Chave PIX */}
        {!loading && (
          pixKey ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <p className="text-sm font-medium text-emerald-800">Chave PIX cadastrada</p>
                <p className="text-xs text-emerald-700">{pixKeyType?.toUpperCase()}: {pixKey}</p>
              </div>
            </div>
          ) : (
            <div
              onClick={() => navigate("/pro/financeiro")}
              className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-amber-100 transition-colors"
            >
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800">Cadastre sua chave PIX</p>
                <p className="text-xs text-amber-700">Para receber repasses, vá em Financeiro → Dados de recebimento</p>
              </div>
            </div>
          )
        )}

        {/* Cards de saldo */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border bg-amber-50 border-amber-200 p-4">
            <p className="text-xs text-amber-700 font-medium flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> A Receber</p>
            <p className="text-xl font-bold text-amber-800 mt-1">{fmt(pendingTotal)}</p>
            <p className="text-xs text-amber-600 mt-0.5">{pending.length} pagamento{pending.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="rounded-xl border bg-emerald-50 border-emerald-200 p-4">
            <p className="text-xs text-emerald-700 font-medium flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" /> Já Recebido</p>
            <p className="text-xl font-bold text-emerald-800 mt-1">{fmt(transferredTotal)}</p>
            <p className="text-xs text-emerald-600 mt-0.5">{transferred.length} repasse{transferred.length !== 1 ? "s" : ""}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex rounded-lg border overflow-hidden">
          <button onClick={() => setTab("pending")} className={`flex-1 py-2 text-sm font-medium transition-colors ${tab === "pending" ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted"}`}>
            A Receber
          </button>
          <button onClick={() => setTab("transferred")} className={`flex-1 py-2 text-sm font-medium transition-colors ${tab === "transferred" ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted"}`}>
            Recebidos
          </button>
        </div>

        {/* Lista */}
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Wallet className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">{tab === "pending" ? "Nenhum valor a receber" : "Nenhum repasse ainda"}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {displayed.map(tx => (
              <div key={tx.id} className="flex items-center justify-between border rounded-xl px-4 py-3 bg-white">
                <div>
                  <p className="text-sm font-medium">{tx.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(tx.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                    {tx.transferred_at && ` · Recebido em ${new Date(tx.transferred_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`font-bold ${tx.status === "pending" ? "text-amber-700" : "text-emerald-700"}`}>{fmt(tx.amount)}</span>
                  {tx.status === "pending" ? (
                    <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Pendente</span>
                  ) : (
                    <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Recebido</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default ProWallet;
