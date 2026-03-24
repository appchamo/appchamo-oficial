import AppLayout from "@/components/AppLayout";
import { Wallet, Clock, CheckCircle2, TrendingUp, AlertCircle, Loader2, Timer } from "lucide-react";
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
  available_at: string | null;
  payment_method: string | null;
  anticipation_enabled: boolean;
}

/** Retorna texto legível do tempo restante até available_at */
const timeUntilAvailable = (available_at: string | null): string | null => {
  if (!available_at) return null;
  const diff = new Date(available_at).getTime() - Date.now();
  if (diff <= 0) return "Disponível agora";
  const totalMin = Math.ceil(diff / 60000);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  if (days >= 1) return `Disponível em ${days}d${remHours > 0 ? ` ${remHours}h` : ""}`;
  if (hours >= 1) return `Disponível em ${hours}h${mins > 0 ? ` ${mins}min` : ""}`;
  return `Disponível em ${totalMin}min`;
};

/** Calcula available_at quando o campo está nulo no banco (registros antigos) */
const calcAvailableAt = (
  tx: { created_at: string; payment_method: string | null; anticipation_enabled: boolean },
  settings: Record<string, number>
): string => {
  const base = new Date(tx.created_at).getTime();
  const method = tx.payment_method || "pix";
  if (method === "pix") {
    const hours = settings["transfer_period_pix_hours"] || 12;
    return new Date(base + hours * 3600 * 1000).toISOString();
  }
  if (tx.anticipation_enabled) {
    const days = settings["transfer_period_card_anticipated_days"] || 7;
    return new Date(base + days * 86400 * 1000).toISOString();
  }
  const days = settings["transfer_period_card_days"] || 32;
  return new Date(base + days * 86400 * 1000).toISOString();
};

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
  const [periodSettings, setPeriodSettings] = useState<Record<string, number>>({});

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
        .from("professional_fiscal_data")
        .select("pix_key, pix_key_type")
        .eq("professional_id", pro.id)
        .maybeSingle();
      setPixKey(fiscal?.pix_key || null);
      setPixKeyType(fiscal?.pix_key_type || null);

      // Busca configurações de período de repasse da plataforma
      const { data: settings } = await supabase
        .from("platform_settings")
        .select("key, value")
        .in("key", [
          "transfer_period_pix_hours",
          "transfer_period_card_days",
          "transfer_period_card_anticipated_days",
        ]);
      const sMap: Record<string, number> = {};
      (settings || []).forEach((s: any) => { sMap[s.key] = parseFloat(s.value) || 0; });
      setPeriodSettings(sMap);

      // Busca transações da carteira
      const { data: txs } = await supabase
        .from("wallet_transactions")
        .select("id, amount, description, status, created_at, transferred_at, available_at, payment_method, anticipation_enabled")
        .eq("professional_id", pro.id)
        .order("created_at", { ascending: false });

      setTransactions((txs || []).map(t => ({
        ...t,
        amount: Number(t.amount),
        available_at: (t as any).available_at || null,
        payment_method: (t as any).payment_method || null,
        anticipation_enabled: (t as any).anticipation_enabled || false,
      })));
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
          supabase.from("wallet_transactions").select("id, amount, description, status, created_at, transferred_at, available_at, payment_method, anticipation_enabled")
            .eq("professional_id", pro.id).order("created_at", { ascending: false })
            .then(({ data: txs }) => setTransactions((txs || []).map(t => ({
              ...t,
              amount: Number(t.amount),
              available_at: (t as any).available_at || null,
              payment_method: (t as any).payment_method || null,
              anticipation_enabled: (t as any).anticipation_enabled || false,
            }))));
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
            {(() => {
              const nextAvailable = pending
                .map(t => t.available_at || calcAvailableAt(t, periodSettings))
                .sort()[0];
              const label = timeUntilAvailable(nextAvailable || null);
              if (!label) return null;
              return (
                <p className="text-[10px] text-amber-700 mt-1 flex items-center gap-1">
                  <Timer className="w-3 h-3" /> {label}
                </p>
              );
            })()}
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
              <div key={tx.id} className="flex items-start justify-between border rounded-xl px-4 py-3 bg-white gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{tx.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(tx.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                    {tx.transferred_at && ` · Recebido em ${new Date(tx.transferred_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`}
                  </p>
                  {tx.status === "pending" && (() => {
                    const effectiveAt = tx.available_at || calcAvailableAt(tx, periodSettings);
                    const label = timeUntilAvailable(effectiveAt);
                    if (!label) return null;
                    const isReady = label === "Disponível agora";
                    return (
                      <p className={`text-[10px] mt-0.5 flex items-center gap-1 font-medium ${isReady ? "text-emerald-600" : "text-amber-600"}`}>
                        <Timer className="w-3 h-3" /> {label}
                      </p>
                    );
                  })()}
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
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
