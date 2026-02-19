import AdminLayout from "@/components/AdminLayout";
import { DollarSign, TrendingUp, Users, Search, Crown, Calendar, CreditCard, ChevronDown, ChevronUp, Settings2, Save, Loader2, X, FileText, Landmark } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCpf, formatCnpj } from "@/lib/formatters";

interface Transaction {
  id: string;
  client_id: string | null;
  professional_id: string | null;
  total_amount: number;
  platform_fee: number;
  professional_net: number;
  status: string;
  created_at: string;
}

interface Subscriber {
  id: string;
  user_id: string;
  plan_id: string;
  status: string;
  started_at: string;
  expires_at: string | null;
  full_name: string;
  email: string;
}

const statusMap: Record<string, { label: string; cls: string }> = {
  completed: { label: "Concluída", cls: "bg-primary/10 text-primary" },
  pending: { label: "Pendente", cls: "bg-muted text-muted-foreground" },
  cancelled: { label: "Cancelada", cls: "bg-destructive/10 text-destructive" },
};

const planLabel: Record<string, string> = { free: "Grátis", pro: "Pro", vip: "VIP", business: "Empresarial" };
const planCls: Record<string, string> = {
  free: "bg-muted text-muted-foreground",
  pro: "bg-primary/10 text-primary",
  vip: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  business: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
};

// Detail modal for transaction
const TransactionDetail = ({ tx, onClose }: { tx: Transaction; onClose: () => void }) => {
  const [clientName, setClientName] = useState("—");
  const [proName, setProName] = useState("—");
  const [protocol, setProtocol] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      // Find related service_request via client+professional
      if (tx.client_id) {
        const { data: p } = await supabase.from("profiles").select("full_name").eq("user_id", tx.client_id).maybeSingle();
        if (p) setClientName(p.full_name);
      }
      if (tx.professional_id) {
        const { data: pro } = await supabase.from("professionals").select("user_id").eq("id", tx.professional_id).maybeSingle();
        if (pro) {
          const { data: p } = await supabase.from("profiles").select("full_name").eq("user_id", pro.user_id).maybeSingle();
          if (p) setProName(p.full_name);
        }
      }
      // Try to find protocol
      if (tx.client_id && tx.professional_id) {
        const { data: sr } = await supabase.from("service_requests")
          .select("protocol")
          .eq("client_id", tx.client_id)
          .eq("professional_id", tx.professional_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (sr) setProtocol(sr.protocol);
      }
    };
    fetch();
  }, [tx]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border rounded-xl p-5 w-full max-w-md space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-foreground">Detalhes da Transação</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        {protocol && <p className="text-xs font-mono bg-muted px-2 py-1 rounded-lg text-muted-foreground">Protocolo: {protocol}</p>}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-[10px] text-muted-foreground">Cliente</p><p className="font-medium text-foreground">{clientName}</p></div>
          <div><p className="text-[10px] text-muted-foreground">Profissional</p><p className="font-medium text-foreground">{proName}</p></div>
          <div><p className="text-[10px] text-muted-foreground">Total</p><p className="font-medium text-foreground">R$ {Number(tx.total_amount).toLocaleString("pt-BR")}</p></div>
          <div><p className="text-[10px] text-muted-foreground">Comissão</p><p className="font-medium text-primary">R$ {Number(tx.platform_fee).toLocaleString("pt-BR")}</p></div>
          <div><p className="text-[10px] text-muted-foreground">Líquido profissional</p><p className="font-medium text-foreground">R$ {Number(tx.professional_net).toLocaleString("pt-BR")}</p></div>
          <div><p className="text-[10px] text-muted-foreground">Status</p>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${(statusMap[tx.status] || statusMap.pending).cls}`}>{(statusMap[tx.status] || statusMap.pending).label}</span>
          </div>
          <div className="col-span-2"><p className="text-[10px] text-muted-foreground">Data / Hora</p><p className="font-medium text-foreground">{new Date(tx.created_at).toLocaleString("pt-BR")}</p></div>
        </div>
      </div>
    </div>
  );
};

// Detail modal for subscriber
const SubscriberDetail = ({ sub, onClose }: { sub: Subscriber; onClose: () => void }) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      // Get professional id for this user
      const { data: pro } = await supabase.from("professionals").select("id").eq("user_id", sub.user_id).maybeSingle();
      if (pro) {
        const { data } = await supabase.from("transactions")
          .select("*")
          .eq("professional_id", pro.id)
          .order("created_at", { ascending: false })
          .limit(20);
        setTransactions(data || []);
      }
      setLoading(false);
    };
    fetch();
  }, [sub]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border rounded-xl p-5 w-full max-w-lg max-h-[80vh] overflow-y-auto space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-foreground">Detalhes do Assinante</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-[10px] text-muted-foreground">Nome</p><p className="font-medium text-foreground">{sub.full_name}</p></div>
          <div><p className="text-[10px] text-muted-foreground">Email</p><p className="font-medium text-foreground text-xs break-all">{sub.email}</p></div>
          <div><p className="text-[10px] text-muted-foreground">Plano</p>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${planCls[sub.plan_id] || planCls.free}`}>{planLabel[sub.plan_id] || sub.plan_id}</span>
          </div>
          <div><p className="text-[10px] text-muted-foreground">Status</p>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${sub.status === "active" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>{sub.status === "active" ? "Ativo" : sub.status}</span>
          </div>
          <div><p className="text-[10px] text-muted-foreground">Início</p><p className="font-medium text-foreground">{new Date(sub.started_at).toLocaleDateString("pt-BR")}</p></div>
          <div><p className="text-[10px] text-muted-foreground">Expira</p><p className="font-medium text-foreground">{sub.expires_at ? new Date(sub.expires_at).toLocaleDateString("pt-BR") : "—"}</p></div>
        </div>

        <h4 className="font-semibold text-sm text-foreground pt-3 border-t">Histórico de Pagamentos</h4>
        {loading ? (
          <div className="flex justify-center py-4"><div className="animate-spin w-5 h-5 border-3 border-primary border-t-transparent rounded-full" /></div>
        ) : transactions.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">Nenhum pagamento encontrado</p>
        ) : (
          <div className="space-y-2">
            {transactions.map(t => (
              <div key={t.id} className="flex items-center justify-between border rounded-lg p-2.5 text-xs">
                <div>
                  <p className="font-medium text-foreground">R$ {Number(t.total_amount).toLocaleString("pt-BR")}</p>
                  <p className="text-[10px] text-muted-foreground">{new Date(t.created_at).toLocaleString("pt-BR")}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${(statusMap[t.status] || statusMap.pending).cls}`}>{(statusMap[t.status] || statusMap.pending).label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Financial settings tab component
const FinancialConfig = () => {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from("platform_settings").select("*");
      if (data) {
        const map: Record<string, string> = {};
        for (const s of data) {
          const val = typeof s.value === "string" ? s.value : JSON.stringify(s.value).replace(/^"|"$/g, "");
          map[s.key] = val;
        }
        setSettings(map);
      }
      setLoading(false);
    };
    fetch();
  }, []);

  const set = (key: string, value: string) => setSettings(prev => ({ ...prev, [key]: value }));
  const inputCls = "w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30";

  const handleSave = async () => {
    setSaving(true);
    const feeKeys = ["commission_pct", "pix_fee_pct", "pix_fee_fixed", "card_fee_pct", "card_fee_fixed", "max_installments",
      "transfer_period_pix_hours", "transfer_period_card_days", "transfer_period_card_anticipated_days", "anticipation_fee_pct",
      ...Array.from({ length: 11 }, (_, i) => `installment_fee_${i + 2}x`)];
    for (const key of feeKeys) {
      if (settings[key] !== undefined) {
        await supabase.from("platform_settings").upsert({ key, value: settings[key] as any }, { onConflict: "key" });
      }
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase.from("admin_logs").insert({ admin_user_id: session.user.id, action: "update_financial_settings", target_type: "settings" });
    }
    toast({ title: "Configurações financeiras salvas!" });
    setSaving(false);
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div className="max-w-lg space-y-5">
      <div className="bg-card border rounded-xl p-4 space-y-3">
        <h2 className="font-semibold text-foreground text-sm">Comissão da plataforma</h2>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Comissão (%)</label>
          <input type="number" value={settings.commission_pct || "10"} onChange={(e) => set("commission_pct", e.target.value)} className={inputCls} />
        </div>
      </div>

      <div className="bg-card border rounded-xl p-4 space-y-3">
        <h2 className="font-semibold text-foreground text-sm">Taxas de Pagamento</h2>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">PIX (%)</label><input type="number" value={settings.pix_fee_pct || "0"} onChange={(e) => set("pix_fee_pct", e.target.value)} className={inputCls} /></div>
          <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">PIX fixo (R$)</label><input type="number" value={settings.pix_fee_fixed || "0"} onChange={(e) => set("pix_fee_fixed", e.target.value)} className={inputCls} /></div>
          <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Cartão à vista (%)</label><input type="number" value={settings.card_fee_pct || "0"} onChange={(e) => set("card_fee_pct", e.target.value)} className={inputCls} /></div>
          <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Cartão fixo (R$)</label><input type="number" value={settings.card_fee_fixed || "0"} onChange={(e) => set("card_fee_fixed", e.target.value)} className={inputCls} /></div>
        </div>
      </div>

      <div className="bg-card border rounded-xl p-4 space-y-3">
        <h2 className="font-semibold text-foreground text-sm">Taxas por Parcela</h2>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Máximo de parcelas</label>
          <input type="number" min="1" max="12" value={settings.max_installments || "12"} onChange={(e) => set("max_installments", e.target.value)} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 11 }, (_, i) => i + 2).map(n => (
            <div key={n}>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{n}x (%)</label>
              <input type="number" step="0.1" value={settings[`installment_fee_${n}x`] || "0"} onChange={(e) => set(`installment_fee_${n}x`, e.target.value)} className={inputCls} />
            </div>
          ))}
        </div>
      </div>

      {/* Transfer & Anticipation Settings */}
      <div className="bg-card border rounded-xl p-4 space-y-3">
        <h2 className="font-semibold text-foreground text-sm">Prazos de Repasse</h2>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">PIX (horas)</label><input type="number" value={settings.transfer_period_pix_hours || "48"} onChange={(e) => set("transfer_period_pix_hours", e.target.value)} className={inputCls} /></div>
          <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Cartão sem antecipação (dias úteis)</label><input type="number" value={settings.transfer_period_card_days || "33"} onChange={(e) => set("transfer_period_card_days", e.target.value)} className={inputCls} /></div>
          <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Cartão com antecipação (dias úteis)</label><input type="number" value={settings.transfer_period_card_anticipated_days || "4"} onChange={(e) => set("transfer_period_card_anticipated_days", e.target.value)} className={inputCls} /></div>
          <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Taxa de antecipação (%)</label><input type="number" step="0.1" value={settings.anticipation_fee_pct || "3.5"} onChange={(e) => set("anticipation_fee_pct", e.target.value)} className={inputCls} /></div>
        </div>
      </div>

      <button onClick={handleSave} disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? "Salvando..." : "Salvar configurações"}
      </button>
    </div>
  );
};

// Fiscal data admin tab
const FiscalDataAdmin = () => {
  const [professionals, setProfessionals] = useState<{ id: string; user_id: string; name: string }[]>([]);
  const [fiscalData, setFiscalData] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selectedFiscal, setSelectedFiscal] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data: pros } = await supabase.from("professionals").select("id, user_id").eq("active", true);
      if (!pros) { setLoading(false); return; }
      const userIds = pros.map(p => p.user_id);
      const [{ data: profiles }, { data: fiscal }] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, cpf, cnpj").in("user_id", userIds),
        supabase.from("professional_fiscal_data").select("*"),
      ]);
      const nameMap = new Map((profiles || []).map(p => [p.user_id, p]));
      setProfessionals(pros.map(p => ({ id: p.id, user_id: p.user_id, name: nameMap.get(p.user_id)?.full_name || "—" })));
      setFiscalData(fiscal || []);
      setLoading(false);
    };
    fetch();
  }, []);

  const getFiscal = (proId: string) => fiscalData.find(f => f.professional_id === proId);

  const filtered = professionals.filter(p => {
    if (!search) return true;
    return p.name.toLowerCase().includes(search.toLowerCase());
  });

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 border rounded-xl px-3 py-2.5 bg-card focus-within:ring-2 focus-within:ring-primary/30">
        <Search className="w-4 h-4 text-muted-foreground" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar profissional..."
          className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground" />
      </div>

      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium text-muted-foreground">Profissional</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Método</th>
              <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Chave/Conta</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
              <th className="text-left p-3 font-medium text-muted-foreground"></th>
            </tr></thead>
            <tbody>
              {filtered.map(p => {
                const fd = getFiscal(p.id);
                return (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-medium text-foreground text-xs md:text-sm">{p.name}</td>
                    <td className="p-3 text-xs">{fd ? (fd.payment_method === "pix" ? "PIX" : "TED") : "—"}</td>
                    <td className="p-3 text-xs text-muted-foreground hidden md:table-cell">
                      {fd ? (fd.payment_method === "pix" ? (fd.pix_key || "—") : `${fd.bank_name || ""} Ag ${fd.bank_agency || ""} Cc ${fd.bank_account || ""}`) : "—"}
                    </td>
                    <td className="p-3">
                      {fd ? <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Cadastrado</span>
                        : <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground">Pendente</span>}
                    </td>
                    <td className="p-3">
                      {fd && <button onClick={() => setSelectedFiscal({ ...fd, proName: p.name })} className="text-[11px] text-primary font-medium hover:underline">Ver mais</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <p className="text-center py-6 text-muted-foreground text-sm">Nenhum profissional encontrado</p>}
      </div>

      {/* Fiscal detail modal */}
      {selectedFiscal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setSelectedFiscal(null)}>
          <div className="bg-card border rounded-xl p-5 w-full max-w-md max-h-[80vh] overflow-y-auto space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-foreground">Dados Fiscais — {selectedFiscal.proName}</h3>
              <button onClick={() => setSelectedFiscal(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>

            <div className="space-y-3">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">Dados Bancários</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><p className="text-muted-foreground">Método</p><p className="font-medium text-foreground">{selectedFiscal.payment_method === "pix" ? "PIX" : "TED"}</p></div>
                  {selectedFiscal.payment_method === "pix" ? (
                    <>
                      <div><p className="text-muted-foreground">Tipo chave</p><p className="font-medium text-foreground">{(selectedFiscal.pix_key_type || "").toUpperCase()}</p></div>
                      <div className="col-span-2"><p className="text-muted-foreground">Chave PIX</p><p className="font-medium text-foreground">{selectedFiscal.pix_key || "—"}</p></div>
                    </>
                  ) : (
                    <>
                      <div><p className="text-muted-foreground">Banco</p><p className="font-medium text-foreground">{selectedFiscal.bank_name || "—"}</p></div>
                      <div><p className="text-muted-foreground">Agência</p><p className="font-medium text-foreground">{selectedFiscal.bank_agency || "—"}</p></div>
                      <div><p className="text-muted-foreground">Conta</p><p className="font-medium text-foreground">{selectedFiscal.bank_account || "—"}</p></div>
                      <div><p className="text-muted-foreground">Tipo</p><p className="font-medium text-foreground">{selectedFiscal.bank_account_type === "poupanca" ? "Poupança" : "Corrente"}</p></div>
                    </>
                  )}
                </div>
              </div>

              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">Dados para Nota Fiscal</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><p className="text-muted-foreground">Nome / Razão Social</p><p className="font-medium text-foreground">{selectedFiscal.fiscal_name || "—"}</p></div>
                  <div><p className="text-muted-foreground">CPF / CNPJ</p><p className="font-medium text-foreground">{selectedFiscal.fiscal_document || "—"}</p></div>
                  <div className="col-span-2"><p className="text-muted-foreground">Email NF</p><p className="font-medium text-foreground">{selectedFiscal.fiscal_email || "—"}</p></div>
                  <div className="col-span-2"><p className="text-muted-foreground">Endereço</p><p className="font-medium text-foreground">
                    {[selectedFiscal.fiscal_address_street, selectedFiscal.fiscal_address_number, selectedFiscal.fiscal_address_complement, selectedFiscal.fiscal_address_neighborhood, selectedFiscal.fiscal_address_city, selectedFiscal.fiscal_address_state, selectedFiscal.fiscal_address_zip].filter(Boolean).join(", ") || "—"}
                  </p></div>
                </div>
              </div>

              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">Preferências</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><p className="text-muted-foreground">Juros p/ cliente</p><p className="font-medium text-foreground">{selectedFiscal.charge_interest_to_client ? "Sim" : "Não"}</p></div>
                  <div><p className="text-muted-foreground">Antecipação</p><p className="font-medium text-foreground">{selectedFiscal.anticipation_enabled ? "Ativada" : "Desativada"}</p></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const AdminTransactions = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalVolume, setTotalVolume] = useState(0);
  const [totalFees, setTotalFees] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [subsLoading, setSubsLoading] = useState(true);
  const [subsSearch, setSubsSearch] = useState("");
  const [activeTab, setActiveTab] = useState("transactions");

  const [subStats, setSubStats] = useState({ pro: 0, vip: 0, business: 0, total: 0 });

  // Detail modals
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [selectedSub, setSelectedSub] = useState<Subscriber | null>(null);

  useEffect(() => {
    const fetchAll = async () => {
      const { data: summary } = await supabase.rpc("get_transaction_summary");
      const s = Array.isArray(summary) ? summary[0] : summary;
      setTotalVolume(Number(s?.total_volume || 0));
      setTotalFees(Number(s?.total_fees || 0));
      setTotalCount(Number(s?.transaction_count || 0));

      const { data } = await supabase.from("transactions").select("*").order("created_at", { ascending: false }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      setTransactions(data || []);
      setLoading(false);
    };
    fetchAll();
  }, [page]);

  useEffect(() => {
    const fetchSubs = async () => {
      const { data: subs } = await supabase.from("subscriptions").select("*").neq("plan_id", "free").order("started_at", { ascending: false });
      if (!subs || subs.length === 0) { setSubscribers([]); setSubStats({ pro: 0, vip: 0, business: 0, total: 0 }); setSubsLoading(false); return; }
      const userIds = subs.map(s => s.user_id);
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", userIds);
      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
      const mapped: Subscriber[] = subs.map(s => ({ ...s, full_name: profileMap.get(s.user_id)?.full_name || "—", email: profileMap.get(s.user_id)?.email || "—" }));
      setSubscribers(mapped);
      setSubStats({
        pro: mapped.filter(s => s.plan_id === "pro" && s.status === "active").length,
        vip: mapped.filter(s => s.plan_id === "vip" && s.status === "active").length,
        business: mapped.filter(s => s.plan_id === "business" && s.status === "active").length,
        total: mapped.filter(s => s.status === "active").length,
      });
      setSubsLoading(false);
    };
    fetchSubs();
  }, []);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const filteredSubs = subscribers.filter(s => {
    if (!subsSearch) return true;
    const q = subsSearch.toLowerCase();
    return s.full_name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q) || s.plan_id.toLowerCase().includes(q);
  });

  return (
    <AdminLayout title="Financeiro">
      {selectedTx && <TransactionDetail tx={selectedTx} onClose={() => setSelectedTx(null)} />}
      {selectedSub && <SubscriberDetail sub={selectedSub} onClose={() => setSelectedSub(null)} />}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-card border rounded-xl p-3 md:p-4">
          <DollarSign className="w-5 h-5 text-primary mb-1" />
          <p className="text-lg md:text-xl font-bold text-foreground">R$ {totalVolume.toLocaleString("pt-BR")}</p>
          <p className="text-[11px] text-muted-foreground">Volume total</p>
        </div>
        <div className="bg-card border rounded-xl p-3 md:p-4">
          <TrendingUp className="w-5 h-5 text-primary mb-1" />
          <p className="text-lg md:text-xl font-bold text-foreground">R$ {totalFees.toLocaleString("pt-BR")}</p>
          <p className="text-[11px] text-muted-foreground">Comissões</p>
        </div>
        <div className="bg-card border rounded-xl p-3 md:p-4">
          <CreditCard className="w-5 h-5 text-muted-foreground mb-1" />
          <p className="text-lg md:text-xl font-bold text-foreground">{totalCount.toLocaleString("pt-BR")}</p>
          <p className="text-[11px] text-muted-foreground">Transações</p>
        </div>
        <div className="bg-card border rounded-xl p-3 md:p-4">
          <Crown className="w-5 h-5 text-amber-500 mb-1" />
          <p className="text-lg md:text-xl font-bold text-foreground">{subStats.total}</p>
          <p className="text-[11px] text-muted-foreground">Assinantes ativos</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {subStats.pro > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{subStats.pro} Pro</span>}
            {subStats.vip > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-medium">{subStats.vip} VIP</span>}
            {subStats.business > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 font-medium">{subStats.business} Emp</span>}
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="transactions">Transações</TabsTrigger>
          <TabsTrigger value="subscribers" className="relative">
            Assinantes
            {subStats.total > 0 && <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">{subStats.total}</span>}
          </TabsTrigger>
          <TabsTrigger value="fiscal"><FileText className="w-3.5 h-3.5 mr-1" />Dados Fiscais</TabsTrigger>
          <TabsTrigger value="config"><Settings2 className="w-3.5 h-3.5 mr-1" />Configurações</TabsTrigger>
        </TabsList>

        <TabsContent value="transactions">
          {loading ? (
            <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Nenhuma transação registrada</div>
          ) : (
            <>
              <div className="bg-card border rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium text-muted-foreground">Total</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Comissão</th>
                      <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Líquido</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Data</th>
                      <th className="text-left p-3 font-medium text-muted-foreground"></th>
                    </tr></thead>
                    <tbody>
                      {transactions.map((t) => (
                        <tr key={t.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="p-3 text-xs md:text-sm">R$ {Number(t.total_amount).toLocaleString("pt-BR")}</td>
                          <td className="p-3 text-primary font-medium text-xs md:text-sm">R$ {Number(t.platform_fee).toLocaleString("pt-BR")}</td>
                          <td className="p-3 hidden md:table-cell text-xs">R$ {Number(t.professional_net).toLocaleString("pt-BR")}</td>
                          <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${(statusMap[t.status] || statusMap.pending).cls}`}>{(statusMap[t.status] || statusMap.pending).label}</span></td>
                          <td className="p-3 text-[11px] text-muted-foreground">{new Date(t.created_at).toLocaleDateString("pt-BR")}</td>
                          <td className="p-3"><button onClick={() => setSelectedTx(t)} className="text-[11px] text-primary font-medium hover:underline">Ver mais</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4">
                  <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 rounded-lg border text-xs font-medium disabled:opacity-40 hover:bg-muted transition-colors">Anterior</button>
                  <span className="text-xs text-muted-foreground">Página {page + 1} de {totalPages}</span>
                  <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 rounded-lg border text-xs font-medium disabled:opacity-40 hover:bg-muted transition-colors">Próxima</button>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="subscribers">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-1 flex items-center gap-2 border rounded-xl px-3 py-2.5 bg-card focus-within:ring-2 focus-within:ring-primary/30">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input type="text" value={subsSearch} onChange={(e) => setSubsSearch(e.target.value)} placeholder="Buscar assinante..."
                className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground" />
            </div>
          </div>
          {subsLoading ? (
            <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div>
          ) : filteredSubs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Nenhum assinante encontrado</div>
          ) : (
            <div className="bg-card border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium text-muted-foreground">Nome</th>
                    <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Email</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Plano</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Início</th>
                    <th className="text-left p-3 font-medium text-muted-foreground"></th>
                  </tr></thead>
                  <tbody>
                    {filteredSubs.map((s) => (
                      <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="p-3">
                          <p className="font-medium text-foreground text-xs md:text-sm">{s.full_name}</p>
                          <p className="text-[10px] text-muted-foreground md:hidden">{s.email}</p>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground hidden md:table-cell">{s.email}</td>
                        <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${planCls[s.plan_id] || planCls.free}`}>{planLabel[s.plan_id] || s.plan_id}</span></td>
                        <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${s.status === "active" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>{s.status === "active" ? "Ativo" : s.status}</span></td>
                        <td className="p-3 text-[11px] text-muted-foreground hidden md:table-cell"><span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(s.started_at).toLocaleDateString("pt-BR")}</span></td>
                        <td className="p-3"><button onClick={() => setSelectedSub(s)} className="text-[11px] text-primary font-medium hover:underline">Ver mais</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="fiscal">
          <FiscalDataAdmin />
        </TabsContent>

        <TabsContent value="config">
          <FinancialConfig />
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
};

export default AdminTransactions;
