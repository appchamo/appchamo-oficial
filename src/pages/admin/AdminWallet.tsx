import AdminLayout from "@/components/AdminLayout";
import { Wallet, Send, Clock, CheckCircle2, Search, ChevronDown, ChevronUp, Loader2, AlertCircle, Info, Timer, X } from "lucide-react";
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
  gross_amount: number;
  platform_fee_amount: number;
  payment_fee_amount: number;
  anticipation_fee_amount: number;
  payment_method: string;
  anticipation_enabled: boolean;
  description: string;
  status: string;
  created_at: string;
  transferred_at: string | null;
  available_at: string | null;
  asaas_transfer_id: string | null;
}

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const timeUntilAvailable = (available_at: string | null): { ready: boolean; text: string; minutesLeft: number } => {
  if (!available_at) return { ready: true, text: "", minutesLeft: 0 };
  const diff = new Date(available_at).getTime() - Date.now();
  if (diff <= 0) return { ready: true, text: "", minutesLeft: 0 };
  const minutesLeft = Math.ceil(diff / 60000);
  const hoursLeft = Math.floor(minutesLeft / 60);
  const mins = minutesLeft % 60;
  const text = hoursLeft >= 1
    ? `${hoursLeft}h${mins > 0 ? ` ${mins}min` : ""}`
    : `${minutesLeft} min`;
  return { ready: false, text, minutesLeft };
};

// Modal de confirmação de repasse antes do prazo
const TransferTimingModal = ({
  entry, onConfirm, onCancel, transferring,
}: {
  entry: WalletEntry;
  onConfirm: (force: boolean) => void;
  onCancel: () => void;
  transferring: boolean;
}) => {
  const pendingTxs = entry.transactions.filter(t => t.status === "pending");
  const earliest = pendingTxs
    .map(t => t.available_at)
    .filter(Boolean)
    .sort()[0];
  const { ready, text } = timeUntilAvailable(earliest || null);
  const net = entry.pending_amount;
  const gross = pendingTxs.reduce((s, t) => s + (t.gross_amount || t.amount), 0);
        const platformFee = pendingTxs.reduce((s, t) => s + (t.platform_fee_amount || 0), 0);
        const paymentFee = pendingTxs.reduce((s, t) => s + (t.payment_fee_amount || 0), 0);
        const anticipationFee = pendingTxs.reduce((s, t) => s + (t.anticipation_fee_amount || 0), 0);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Confirmar Repasse</h3>
          <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-5 h-5" /></button>
        </div>

        {/* Detalhamento de taxas */}
        <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Detalhamento</p>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Valor cobrado (bruto)</span>
            <span className="font-medium">{fmt(gross)}</span>
          </div>
          {platformFee > 0 && (
            <div className="flex justify-between text-sm text-red-600">
              <span>(-) Comissão da plataforma</span>
              <span>- {fmt(platformFee)}</span>
            </div>
          )}
          {paymentFee > 0 && (
            <div className="flex justify-between text-sm text-red-600">
              <span>(-) Taxa de transação ({pendingTxs[0]?.payment_method === "pix" ? "PIX" : "Cartão"})</span>
              <span>- {fmt(paymentFee)}</span>
            </div>
          )}
          {anticipationFee > 0 && (
            <div className="flex justify-between text-sm text-orange-600">
              <span>(-) Taxa de antecipação</span>
              <span>- {fmt(anticipationFee)}</span>
            </div>
          )}
          <div className="border-t pt-2 flex justify-between font-bold text-emerald-700">
            <span>Valor líquido ao profissional</span>
            <span>{fmt(net)}</span>
          </div>
        </div>

        {/* Configurações escolhidas */}
        <div className="rounded-xl border p-3 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Configurações do Profissional</p>
          {pendingTxs.map(t => (
            <div key={t.id} className="flex gap-2 text-xs text-muted-foreground flex-wrap">
              <span className="bg-muted px-2 py-0.5 rounded-full capitalize">{t.payment_method === "pix" ? "PIX" : "Cartão"}</span>
              {t.anticipation_enabled
                ? <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">Com antecipação</span>
                : <span className="bg-muted px-2 py-0.5 rounded-full">Sem antecipação</span>}
            </div>
          ))}
        </div>

        {/* Aviso de prazo */}
        {!ready && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
            <Timer className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">Prazo mínimo não atingido</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Falta <strong>{text}</strong> para o período mínimo de repasse (PIX: 12h).
                Você pode esperar ou repassar agora mesmo assim.
              </p>
            </div>
          </div>
        )}

        {ready && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <p className="text-sm text-emerald-800">Prazo de repasse atingido. Pode repassar!</p>
          </div>
        )}

        {/* Botões */}
        <div className="flex gap-3 pt-1">
          {!ready && (
            <button
              onClick={onCancel}
              className="flex-1 border rounded-xl py-2.5 text-sm font-medium hover:bg-muted transition-colors"
            >
              Esperar {text}
            </button>
          )}
          <button
            onClick={() => onConfirm(true)}
            disabled={transferring}
            className="flex-1 bg-primary text-white rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-primary/90 transition-colors"
          >
            {transferring ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {ready ? "Repassar" : "Repassar Agora"}
          </button>
        </div>
      </div>
    </div>
  );
};

const AdminWallet = () => {
  const [entries, setEntries] = useState<WalletEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [transferring, setTransferring] = useState<string | null>(null);
  const [tab, setTab] = useState<"pending" | "transferred">("pending");
  const [modalEntry, setModalEntry] = useState<WalletEntry | null>(null);

  const load = async () => {
    setLoading(true);
      const { data, error } = await supabase
      .from("wallet_transactions")
      .select("id, professional_id, amount, gross_amount, platform_fee_amount, payment_fee_amount, anticipation_fee_amount, payment_method, anticipation_enabled, description, status, created_at, transferred_at, available_at, asaas_transfer_id")
      .order("created_at", { ascending: false });

    if (error) { toast({ title: "Erro ao carregar carteiras", variant: "destructive" }); setLoading(false); return; }

    const proIds = [...new Set((data || []).map(t => t.professional_id))];
    if (!proIds.length) { setEntries([]); setLoading(false); return; }

    const { data: pros } = await supabase.from("professionals").select("id, user_id").in("id", proIds);
    const userIds = (pros || []).map(p => p.user_id).filter(Boolean);

    const [{ data: profiles }, { data: fiscals }] = await Promise.all([
      supabase.from("profiles").select("user_id, display_name, email").in("user_id", userIds),
      supabase.from("professional_fiscal_data").select("professional_id, pix_key, pix_key_type").in("professional_id", proIds),
    ]);

    const proByProId: Record<string, string> = {};
    (pros || []).forEach(p => { proByProId[p.id] = p.user_id; });
    const profileByUserId: Record<string, { display_name: string; email: string }> = {};
    (profiles || []).forEach(p => { profileByUserId[p.user_id] = p; });
    const fiscalByProId: Record<string, { pix_key: string; pix_key_type: string }> = {};
    (fiscals || []).forEach(f => { fiscalByProId[f.professional_id] = f; });

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
        gross_amount: Number(tx.gross_amount || tx.amount),
        platform_fee_amount: Number(tx.platform_fee_amount || 0),
        payment_fee_amount: Number(tx.payment_fee_amount || 0),
        anticipation_fee_amount: Number(tx.anticipation_fee_amount || 0),
        payment_method: tx.payment_method || "pix",
        anticipation_enabled: tx.anticipation_enabled || false,
        description: tx.description || "—",
        status: tx.status,
        created_at: tx.created_at,
        transferred_at: tx.transferred_at,
        available_at: tx.available_at,
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

  const doTransfer = async (entry: WalletEntry) => {
    setTransferring(entry.professional_id);
    setModalEntry(null);
    try {
      const pendingIds = entry.transactions.filter(t => t.status === "pending").map(t => t.id);
      const { data, error } = await supabase.functions.invoke("process_transfer", {
        body: { professional_id: entry.professional_id, wallet_transaction_ids: pendingIds },
      });
      if (error) throw new Error(error.message || "Erro ao repassar");
      if (data?.error) throw new Error(data.error);
      const desc = `Bruto: ${fmt(data.gross_amount)} | Comissão: ${fmt(data.platform_fee)}${data.anticipation_fee > 0 ? ` | Antecipação: ${fmt(data.anticipation_fee)}` : ""}`;
      toast({ title: `✅ Repasse de ${fmt(data.amount)} realizado!`, description: desc });
      load();
    } catch (err: any) {
      toast({ title: "Erro ao repassar", description: err.message, variant: "destructive" });
    } finally {
      setTransferring(null);
    }
  };

  const handleTransferClick = (entry: WalletEntry) => {
    if (!entry.pix_key) {
      toast({ title: "Profissional sem chave PIX", description: "Peça para cadastrar em Financeiro → Cadastro Fiscal.", variant: "destructive" });
      return;
    }
    if (entry.pending_count === 0) return;
    setModalEntry(entry);
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
      {modalEntry && (
        <TransferTimingModal
          entry={modalEntry}
          onConfirm={() => doTransfer(modalEntry)}
          onCancel={() => setModalEntry(null)}
          transferring={transferring === modalEntry.professional_id}
        />
      )}

      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Wallet className="w-7 h-7 text-primary" />
          <h1 className="text-2xl font-bold">Carteira dos Profissionais</h1>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border bg-amber-50 border-amber-200 p-4">
            <p className="text-xs text-amber-700 font-medium flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> A Repassar (líquido)</p>
            <p className="text-2xl font-bold text-amber-800 mt-1">{fmt(totalPending)}</p>
            <p className="text-xs text-amber-600 mt-0.5">{entries.filter(e => e.pending_count > 0).length} profissional(is) aguardando</p>
          </div>
          <div className="rounded-xl border bg-emerald-50 border-emerald-200 p-4">
            <p className="text-xs text-emerald-700 font-medium flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Já Repassado</p>
            <p className="text-2xl font-bold text-emerald-800 mt-1">{fmt(totalTransferred)}</p>
            <p className="text-xs text-emerald-600 mt-0.5">Total histórico</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex rounded-lg border overflow-hidden">
            <button onClick={() => setTab("pending")} className={`px-4 py-2 text-sm font-medium transition-colors ${tab === "pending" ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted"}`}>A Repassar</button>
            <button onClick={() => setTab("transferred")} className={`px-4 py-2 text-sm font-medium transition-colors ${tab === "transferred" ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted"}`}>Já Repassados</button>
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar profissional..."
              className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Wallet className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>{tab === "pending" ? "Nenhum repasse pendente" : "Nenhum repasse realizado ainda"}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(entry => {
              const pendingTxs = entry.transactions.filter(t => t.status === "pending");
              const earliestAvailable = pendingTxs.map(t => t.available_at).filter(Boolean).sort()[0];
              const timing = timeUntilAvailable(earliestAvailable || null);

              return (
                <div key={entry.professional_id} className="border rounded-xl overflow-hidden bg-white shadow-sm">
                  <div className="flex items-center gap-4 p-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-primary font-bold text-sm">{entry.professional_name.slice(0, 2).toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{entry.professional_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{entry.professional_email}</p>
                      {entry.pix_key ? (
                        <p className="text-xs text-emerald-600 mt-0.5">PIX ({entry.pix_key_type?.toUpperCase()}): {entry.pix_key}</p>
                      ) : (
                        <p className="text-xs text-red-500 flex items-center gap-1 mt-0.5"><AlertCircle className="w-3 h-3" /> Sem chave PIX</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      {tab === "pending" ? (
                        <>
                          <p className="text-lg font-bold text-amber-700">{fmt(entry.pending_amount)}</p>
                          <p className="text-xs text-muted-foreground">líquido · {entry.pending_count} pag.</p>
                          {!timing.ready && (
                            <p className="text-xs text-amber-600 flex items-center gap-1 justify-end mt-0.5">
                              <Timer className="w-3 h-3" /> disponível em {timing.text}
                            </p>
                          )}
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
                          onClick={() => handleTransferClick(entry)}
                          disabled={transferring === entry.professional_id || !entry.pix_key}
                          className="flex items-center gap-1.5 bg-primary text-white px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
                        >
                          {transferring === entry.professional_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                          Repassar
                        </button>
                      )}
                      <button onClick={() => setExpanded(expanded === entry.professional_id ? null : entry.professional_id)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                        {expanded === entry.professional_id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {expanded === entry.professional_id && (
                    <div className="border-t bg-muted/30 p-4 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Extrato detalhado</p>
                      {entry.transactions
                        .filter(t => tab === "pending" ? t.status === "pending" : t.status === "transferred")
                        .map(tx => {
                          const txTiming = timeUntilAvailable(tx.available_at);
                          return (
                            <div key={tx.id} className="bg-white rounded-xl border p-3 space-y-2">
                              <div className="flex items-start justify-between">
                                <div>
                                  <p className="text-sm font-medium">{tx.description}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {new Date(tx.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                  </p>
                                  <div className="flex gap-1.5 mt-1 flex-wrap">
                                    <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full">{tx.payment_method === "pix" ? "PIX" : "Cartão"}</span>
                                    {tx.anticipation_enabled
                                      ? <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">Com antecipação</span>
                                      : <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">Sem antecipação</span>}
                                  </div>
                                </div>
                                <div className="text-right">
                                  {tx.status === "pending"
                                    ? <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Pendente</span>
                                    : <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Repassado</span>}
                                </div>
                              </div>

                              {/* Breakdown de valores */}
                              <div className="bg-muted/50 rounded-lg p-2.5 space-y-1 text-xs">
                                <div className="flex justify-between text-muted-foreground">
                                  <span>Valor cobrado (bruto)</span>
                                  <span>{fmt(tx.gross_amount)}</span>
                                </div>
                                {tx.platform_fee_amount > 0 && (
                                  <div className="flex justify-between text-red-600">
                                    <span>(-) Comissão da plataforma</span>
                                    <span>- {fmt(tx.platform_fee_amount)}</span>
                                  </div>
                                )}
                                {tx.payment_fee_amount > 0 && (
                                  <div className="flex justify-between text-red-600">
                                    <span>(-) Taxa de transação ({tx.payment_method === "pix" ? "PIX" : "Cartão"})</span>
                                    <span>- {fmt(tx.payment_fee_amount)}</span>
                                  </div>
                                )}
                                {tx.anticipation_fee_amount > 0 && (
                                  <div className="flex justify-between text-orange-600">
                                    <span>(-) Taxa de antecipação</span>
                                    <span>- {fmt(tx.anticipation_fee_amount)}</span>
                                  </div>
                                )}
                                <div className="flex justify-between font-bold text-emerald-700 border-t pt-1">
                                  <span>Valor líquido ao profissional</span>
                                  <span>{fmt(tx.amount)}</span>
                                </div>
                              </div>

                              {/* Prazo */}
                              {tx.status === "pending" && tx.available_at && (
                                <div className={`flex items-center gap-2 text-xs rounded-lg px-2.5 py-1.5 ${txTiming.ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                                  {txTiming.ready
                                    ? <><CheckCircle2 className="w-3.5 h-3.5" /> Disponível para repasse</>
                                    : <><Timer className="w-3.5 h-3.5" /> Disponível em {txTiming.text} ({new Date(tx.available_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })})</>}
                                </div>
                              )}
                              {tx.asaas_transfer_id && (
                                <p className="text-xs text-muted-foreground">ID Asaas: {tx.asaas_transfer_id}</p>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminWallet;
