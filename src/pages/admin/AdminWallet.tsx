import AdminLayout from "@/components/AdminLayout";
import { Wallet, Send, Clock, CheckCircle2, Search, ChevronDown, ChevronUp, Loader2, AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface WalletEntry {
  professional_id: string;
  professional_name: string;
  professional_email: string;
  pix_key: string | null;
  pix_key_type: string | null;
  pending_amount: number;
  transferred_amount: number;
  pending_count: number;
  transactions: WalletTx[];
}

interface WalletTx {
  id: string;
  amount: number;
  description: string;
  status: string;
  created_at: string;
  transferred_at: string | null;
  asaas_transfer_id: string | null;
}

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const AdminWallet = () => {
  const [entries, setEntries] = useState<WalletEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [transferring, setTransferring] = useState<string | null>(null);
  const [tab, setTab] = useState<"pending" | "transferred">("pending");

  const load = async () => {
    setLoading(true);

    // 1. Busca todas as transações da carteira
    const { data, error } = await supabase
      .from("wallet_transactions")
      .select("id, professional_id, amount, description, status, created_at, transferred_at, asaas_transfer_id")
      .order("created_at", { ascending: false });

    if (error) { toast({ title: "Erro ao carregar carteiras", variant: "destructive" }); setLoading(false); return; }

    // 2. Busca dados dos profissionais únicos
    const proIds = [...new Set((data || []).map(t => t.professional_id))];
    if (!proIds.length) { setEntries([]); setLoading(false); return; }

    const { data: pros } = await supabase
      .from("professionals")
      .select("id, user_id")
      .in("id", proIds);

    const userIds = (pros || []).map(p => p.user_id).filter(Boolean);

    const [{ data: profiles }, { data: fiscals }] = await Promise.all([
      supabase.from("profiles").select("user_id, display_name, email").in("user_id", userIds),
      supabase.from("professional_fiscal_data").select("professional_id, pix_key, pix_key_type").in("professional_id", proIds),
    ]);

    // Mapas auxiliares
    const proByProId: Record<string, string> = {};
    (pros || []).forEach(p => { proByProId[p.id] = p.user_id; });
    const profileByUserId: Record<string, { display_name: string; email: string }> = {};
    (profiles || []).forEach(p => { profileByUserId[p.user_id] = p; });
    const fiscalByProId: Record<string, { pix_key: string; pix_key_type: string }> = {};
    (fiscals || []).forEach(f => { fiscalByProId[f.professional_id] = f; });

    // Agrupa por profissional
    const map: Record<string, WalletEntry> = {};
    for (const tx of (data || [])) {
      const pid = tx.professional_id;
      const userId = proByProId[pid];
      const profile = profileByUserId[userId] || { display_name: "—", email: "—" };
      const fiscal = fiscalByProId[pid];
      if (!map[pid]) {
        map[pid] = {
          professional_id: pid,
          professional_name: profile.display_name || "—",
          professional_email: profile.email || "—",
          pix_key: fiscal?.pix_key || null,
          pix_key_type: fiscal?.pix_key_type || null,
          pending_amount: 0,
          transferred_amount: 0,
          pending_count: 0,
          transactions: [],
        };
      }
      map[pid].transactions.push({
        id: tx.id,
        amount: Number(tx.amount),
        description: tx.description || "—",
        status: tx.status,
        created_at: tx.created_at,
        transferred_at: tx.transferred_at,
        asaas_transfer_id: tx.asaas_transfer_id,
      });
      if (tx.status === "pending") {
        map[pid].pending_amount += Number(tx.amount);
        map[pid].pending_count++;
      } else {
        map[pid].transferred_amount += Number(tx.amount);
      }
    }

    setEntries(Object.values(map));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleTransfer = async (entry: WalletEntry) => {
    if (!entry.pix_key) {
      toast({ title: "Profissional sem chave PIX cadastrada", description: "Peça para ele cadastrar em Financeiro > Dados de recebimento.", variant: "destructive" });
      return;
    }
    if (entry.pending_count === 0) {
      toast({ title: "Nenhum valor pendente para repassar", variant: "destructive" });
      return;
    }
    setTransferring(entry.professional_id);
    try {
      const pendingIds = entry.transactions.filter(t => t.status === "pending").map(t => t.id);
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process_transfer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          professional_id: entry.professional_id,
          wallet_transaction_ids: pendingIds,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Erro ao repassar");
      toast({ title: `✅ Repasse de ${fmt(result.amount)} realizado!`, description: `ID Asaas: ${result.transfer_id}` });
      load();
    } catch (err: any) {
      toast({ title: "Erro ao repassar", description: err.message, variant: "destructive" });
    } finally {
      setTransferring(null);
    }
  };

  const filtered = entries
    .filter(e => tab === "pending" ? e.pending_count > 0 : e.transferred_amount > 0)
    .filter(e =>
      e.professional_name.toLowerCase().includes(search.toLowerCase()) ||
      e.professional_email.toLowerCase().includes(search.toLowerCase())
    );

  const totalPending = entries.reduce((s, e) => s + e.pending_amount, 0);
  const totalTransferred = entries.reduce((s, e) => s + e.transferred_amount, 0);

  return (
    <AdminLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Wallet className="w-7 h-7 text-primary" />
          <h1 className="text-2xl font-bold">Carteira dos Profissionais</h1>
        </div>

        {/* Cards de resumo */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border bg-amber-50 border-amber-200 p-4">
            <p className="text-xs text-amber-700 font-medium flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> A Repassar</p>
            <p className="text-2xl font-bold text-amber-800 mt-1">{fmt(totalPending)}</p>
            <p className="text-xs text-amber-600 mt-0.5">{entries.filter(e => e.pending_count > 0).length} profissionais aguardando</p>
          </div>
          <div className="rounded-xl border bg-emerald-50 border-emerald-200 p-4">
            <p className="text-xs text-emerald-700 font-medium flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Já Repassado</p>
            <p className="text-2xl font-bold text-emerald-800 mt-1">{fmt(totalTransferred)}</p>
            <p className="text-xs text-emerald-600 mt-0.5">Total histórico</p>
          </div>
        </div>

        {/* Tabs + Busca */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex rounded-lg border overflow-hidden">
            <button onClick={() => setTab("pending")} className={`px-4 py-2 text-sm font-medium transition-colors ${tab === "pending" ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted"}`}>
              A Repassar
            </button>
            <button onClick={() => setTab("transferred")} className={`px-4 py-2 text-sm font-medium transition-colors ${tab === "transferred" ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted"}`}>
              Já Repassados
            </button>
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar profissional..."
              className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        {/* Lista */}
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Wallet className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>{tab === "pending" ? "Nenhum repasse pendente" : "Nenhum repasse realizado ainda"}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(entry => (
              <div key={entry.professional_id} className="border rounded-xl overflow-hidden bg-white shadow-sm">
                <div className="flex items-center gap-4 p-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-primary font-bold text-sm">{entry.professional_name.slice(0, 2).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{entry.professional_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{entry.professional_email}</p>
                    {entry.pix_key ? (
                      <p className="text-xs text-emerald-600 mt-0.5">
                        PIX ({entry.pix_key_type?.toUpperCase()}): {entry.pix_key}
                      </p>
                    ) : (
                      <p className="text-xs text-red-500 flex items-center gap-1 mt-0.5">
                        <AlertCircle className="w-3 h-3" /> Sem chave PIX cadastrada
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    {tab === "pending" ? (
                      <>
                        <p className="text-lg font-bold text-amber-700">{fmt(entry.pending_amount)}</p>
                        <p className="text-xs text-muted-foreground">{entry.pending_count} pagamento{entry.pending_count !== 1 ? "s" : ""}</p>
                      </>
                    ) : (
                      <>
                        <p className="text-lg font-bold text-emerald-700">{fmt(entry.transferred_amount)}</p>
                        <p className="text-xs text-muted-foreground">repassado</p>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {tab === "pending" && (
                      <button
                        onClick={() => handleTransfer(entry)}
                        disabled={transferring === entry.professional_id || !entry.pix_key}
                        className="flex items-center gap-1.5 bg-primary text-white px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
                      >
                        {transferring === entry.professional_id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        Repassar
                      </button>
                    )}
                    <button onClick={() => setExpanded(expanded === entry.professional_id ? null : entry.professional_id)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                      {expanded === entry.professional_id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Extrato expandido */}
                {expanded === entry.professional_id && (
                  <div className="border-t bg-muted/30 p-4 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Extrato</p>
                    {entry.transactions
                      .filter(t => tab === "pending" ? t.status === "pending" : t.status === "transferred")
                      .map(tx => (
                        <div key={tx.id} className="flex items-center justify-between text-sm bg-white rounded-lg px-3 py-2 border">
                          <div>
                            <p className="font-medium">{tx.description}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(tx.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                              {tx.transferred_at && ` · Repassado em ${new Date(tx.transferred_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`}
                            </p>
                            {tx.asaas_transfer_id && <p className="text-xs text-muted-foreground">ID: {tx.asaas_transfer_id}</p>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`font-bold ${tx.status === "pending" ? "text-amber-700" : "text-emerald-700"}`}>{fmt(tx.amount)}</span>
                            {tx.status === "pending" ? (
                              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Pendente</span>
                            ) : (
                              <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Repassado</span>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminWallet;
