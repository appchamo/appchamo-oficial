import AdminLayout from "@/components/AdminLayout";
import { DollarSign, TrendingUp, Users, Search, Crown, Calendar, CreditCard, ChevronDown, ChevronUp, Settings2, Save, Loader2, X, FileText, Landmark, Check, Plus, Trash2, Info, Package, List, Gift, Filter, Apple, Smartphone, Wallet, AlertTriangle, Clock, XCircle, Receipt } from "lucide-react";

interface InstallmentPackage {
  id: string;
  label: string;
  from: number;
  to: number;
  rate: string;
}
import { useState, useEffect, useMemo } from "react";
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
  commission_fee: number;
  payment_fee: number;
  professional_net: number;
  status: string;
  created_at: string;
}

interface Subscriber {
  id: string;
  user_id: string;
  plan_id: string;
  status: string;
  source: string | null;
  started_at: string;
  expires_at: string | null;
  last_payment_status: string | null;
  last_payment_at: string | null;
  courtesy: boolean | null;
  full_name: string;
  email: string;
}

interface SubscriptionPayment {
  id: string;
  user_id: string;
  plan_id: string;
  source: string;
  status: string;
  amount: number;
  currency: string;
  external_id: string | null;
  reason: string | null;
  occurred_at: string;
  created_at: string;
  full_name?: string;
  email?: string;
}

// ─── Helpers de formatação ──────────────────────────────────────────────────
const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR");

const statusMap: Record<string, { label: string; cls: string }> = {
  completed: { label: "Concluída", cls: "bg-primary/10 text-primary" },
  pending: { label: "Pendente", cls: "bg-muted text-muted-foreground" },
  cancelled: { label: "Cancelada", cls: "bg-destructive/10 text-destructive" },
};

// ─── Status de assinatura: a "voz" do sistema ───────────────────────────────
// pending  → cartão sendo processado (Asaas/Apple ainda não confirmou)
// active   → pagamento aprovado pelo gateway
// refused  → cartão recusado / cobrança falhou
// cancelled→ usuário cancelou ou período de teste/expirou
// courtesy → liberado manualmente pelo admin (sem cartão)
const subStatusMap: Record<string, { label: string; cls: string; Icon: typeof Check }> = {
  active:    { label: "Ativo",     cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", Icon: Check },
  pending:   { label: "Pendente",  cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", Icon: Clock },
  refused:   { label: "Recusado",  cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",         Icon: XCircle },
  cancelled: { label: "Cancelado", cls: "bg-muted text-muted-foreground",                                       Icon: X },
  courtesy:  { label: "Cortesia",  cls: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400", Icon: Gift },
};

// Normaliza status legados (ACTIVE, CANCELED, etc)
const normalizeSubStatus = (s: string | null | undefined): string => {
  const v = String(s ?? "").toLowerCase();
  if (v === "canceled") return "cancelled";
  return v || "pending";
};

const sourceMap: Record<string, { label: string; cls: string; Icon: typeof Apple }> = {
  asaas_card:      { label: "Cartão",    cls: "bg-primary/10 text-primary",                                                     Icon: CreditCard },
  asaas_pix:       { label: "PIX",       cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",   Icon: Wallet },
  apple_iap:       { label: "Apple",     cls: "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900",                     Icon: Apple },
  google_iap:      { label: "Google",    cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",               Icon: Smartphone },
  manual_courtesy: { label: "Cortesia",  cls: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",       Icon: Gift },
};

// Status das cobranças individuais (subscription_payments)
const paymentStatusMap: Record<string, { label: string; cls: string }> = {
  paid:      { label: "Paga",       cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  pending:   { label: "Pendente",   cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  refused:   { label: "Recusada",   cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  refunded:  { label: "Reembolsada",cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  cancelled: { label: "Cancelada",  cls: "bg-muted text-muted-foreground" },
  courtesy:  { label: "Cortesia",   cls: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" },
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
          <div><p className="text-[10px] text-muted-foreground">Comissão App</p><p className="font-medium text-primary">R$ {Number(tx.commission_fee || tx.platform_fee).toLocaleString("pt-BR")}</p></div>
          {Number(tx.payment_fee) > 0 && <div><p className="text-[10px] text-muted-foreground">Taxa transação</p><p className="font-medium text-orange-600">R$ {Number(tx.payment_fee).toLocaleString("pt-BR")}</p></div>}
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
const SubscriberDetail = ({ sub, onClose, onChanged }: { sub: Subscriber; onClose: () => void; onChanged: () => void }) => {
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await (supabase as any)
        .from("subscription_payments")
        .select("*")
        .eq("user_id", sub.user_id)
        .order("occurred_at", { ascending: false })
        .limit(30);
      setPayments((data || []) as SubscriptionPayment[]);
      setLoading(false);
    };
    load();
  }, [sub]);

  const status = normalizeSubStatus(sub.status);
  const statusInfo = subStatusMap[status] || subStatusMap.pending;
  const sourceInfo = sub.source ? sourceMap[sub.source] : null;

  const handleRevoke = async () => {
    if (!confirm(`Revogar cortesia de ${sub.full_name}? O usuário voltará para o plano grátis.`)) return;
    setRevoking(true);
    const { error } = await supabase.functions.invoke("admin-manage", {
      body: { action: "revoke_courtesy", userId: sub.user_id },
    });
    if (error) {
      toast({ title: "Erro ao revogar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Cortesia revogada" });
      onChanged();
      onClose();
    }
    setRevoking(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border rounded-xl p-5 w-full max-w-lg max-h-[85vh] overflow-y-auto space-y-3" onClick={e => e.stopPropagation()}>
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
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusInfo.cls}`}>
              <statusInfo.Icon className="w-3 h-3" /> {statusInfo.label}
            </span>
          </div>
          <div><p className="text-[10px] text-muted-foreground">Origem</p>
            {sourceInfo ? (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${sourceInfo.cls}`}>
                <sourceInfo.Icon className="w-3 h-3" /> {sourceInfo.label}
              </span>
            ) : <span className="text-xs text-muted-foreground">—</span>}
          </div>
          <div><p className="text-[10px] text-muted-foreground">Última cobrança</p>
            <p className="font-medium text-foreground text-xs">
              {sub.last_payment_status
                ? `${(paymentStatusMap[sub.last_payment_status] || { label: sub.last_payment_status }).label}${sub.last_payment_at ? ` · ${fmtDateTime(sub.last_payment_at)}` : ""}`
                : "—"}
            </p>
          </div>
          <div><p className="text-[10px] text-muted-foreground">Início</p><p className="font-medium text-foreground text-xs">{fmtDateTime(sub.started_at)}</p></div>
          <div><p className="text-[10px] text-muted-foreground">Expira</p><p className="font-medium text-foreground text-xs">{sub.expires_at ? fmtDateTime(sub.expires_at) : "—"}</p></div>
        </div>

        {sub.courtesy && (
          <button onClick={handleRevoke} disabled={revoking}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-destructive/10 text-destructive text-xs font-semibold hover:bg-destructive/20 transition-colors disabled:opacity-50">
            {revoking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
            Revogar cortesia
          </button>
        )}

        <h4 className="font-semibold text-sm text-foreground pt-3 border-t flex items-center gap-1.5">
          <Receipt className="w-3.5 h-3.5" /> Histórico de cobranças do plano
        </h4>
        {loading ? (
          <div className="flex justify-center py-4"><div className="animate-spin w-5 h-5 border-3 border-primary border-t-transparent rounded-full" /></div>
        ) : payments.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">Nenhuma cobrança registrada</p>
        ) : (
          <div className="space-y-2">
            {payments.map(p => {
              const ps = paymentStatusMap[p.status] || { label: p.status, cls: "bg-muted text-muted-foreground" };
              const src = sourceMap[p.source];
              return (
                <div key={p.id} className="flex items-center justify-between border rounded-lg p-2.5 text-xs gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium text-foreground">{fmtBRL(Number(p.amount))}</p>
                      {src && <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${src.cls}`}>
                        <src.Icon className="w-2.5 h-2.5" /> {src.label}
                      </span>}
                    </div>
                    <p className="text-[10px] text-muted-foreground">{fmtDateTime(p.occurred_at)}</p>
                    {p.reason && <p className="text-[10px] text-muted-foreground italic mt-0.5">{p.reason}</p>}
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${ps.cls}`}>{ps.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Modal: Conceder Cortesia ──────────────────────────────────────────────
const GrantCourtesyModal = ({ onClose, onGranted }: { onClose: () => void; onGranted: () => void }) => {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<{ user_id: string; full_name: string; email: string }[]>([]);
  const [selected, setSelected] = useState<{ user_id: string; full_name: string; email: string } | null>(null);
  const [planId, setPlanId] = useState<"pro" | "vip" | "business">("vip");
  const [reason, setReason] = useState("");
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (search.trim().length < 2) { setResults([]); return; }
      setSearching(true);
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .or(`full_name.ilike.%${search}%,email.ilike.%${search}%`)
        .limit(10);
      setResults((data || []) as any);
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const handleSubmit = async () => {
    if (!selected) {
      toast({ title: "Selecione um usuário", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.functions.invoke("admin-manage", {
      body: { action: "grant_courtesy", userId: selected.user_id, planId, reason: reason || null },
    });
    if (error) {
      toast({ title: "Erro ao conceder cortesia", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Cortesia concedida com sucesso!" });
      onGranted();
      onClose();
    }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border rounded-xl p-5 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-foreground flex items-center gap-2"><Gift className="w-4 h-4 text-violet-500" /> Conceder Cortesia</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Buscar usuário (nome ou email)</label>
          <div className="flex items-center gap-2 border rounded-xl px-3 py-2 bg-background focus-within:ring-2 focus-within:ring-primary/30">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input
              autoFocus
              value={selected ? `${selected.full_name} · ${selected.email}` : search}
              onChange={(e) => { setSearch(e.target.value); setSelected(null); }}
              placeholder="Digite ao menos 2 caracteres..."
              className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
            />
            {selected && <button onClick={() => { setSelected(null); setSearch(""); }} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>}
          </div>
          {!selected && results.length > 0 && (
            <div className="mt-2 border rounded-xl divide-y max-h-40 overflow-y-auto">
              {results.map(r => (
                <button key={r.user_id} onClick={() => { setSelected(r); setResults([]); }}
                  className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors">
                  <p className="text-sm font-medium text-foreground">{r.full_name}</p>
                  <p className="text-[11px] text-muted-foreground">{r.email}</p>
                </button>
              ))}
            </div>
          )}
          {searching && <p className="text-[11px] text-muted-foreground mt-1">Buscando...</p>}
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Plano</label>
          <div className="grid grid-cols-3 gap-2">
            {(["pro", "vip", "business"] as const).map(p => (
              <button key={p} onClick={() => setPlanId(p)}
                className={`p-2.5 rounded-xl border text-xs font-semibold transition-colors ${planId === p ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>
                {planLabel[p]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Motivo (opcional)</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
            placeholder="Ex.: parceria, indicação, compensação..."
            className="w-full border rounded-xl px-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
        </div>

        <button onClick={handleSubmit} disabled={submitting || !selected}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
          {submitting ? "Concedendo..." : "Conceder cortesia"}
        </button>
      </div>
    </div>
  );
};

// Financial settings tab component
const FinancialConfig = () => {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [planPrices, setPlanPrices] = useState<Record<string, string>>({});
  const [planPricesAnnual, setPlanPricesAnnual] = useState<Record<string, string>>({});
  const [planPricesSemester, setPlanPricesSemester] = useState<Record<string, string>>({});
  const [planFeatures, setPlanFeatures] = useState<Record<string, string[]>>({});
  const [expandedPlan, setExpandedPlan] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Modo de taxas por parcela
  const [installmentMode, setInstallmentMode] = useState<"individual" | "package">("individual");
  const [installmentPackages, setInstallmentPackages] = useState<InstallmentPackage[]>([
    { id: "pkg1", label: "À vista", from: 1, to: 1, rate: "2.99" },
    { id: "pkg2", label: "2 a 6x", from: 2, to: 6, rate: "3.49" },
    { id: "pkg3", label: "7 a 12x", from: 7, to: 12, rate: "3.99" },
  ]);

  // Antecipação detalhada
  const [anticipationMode, setAnticipationMode] = useState<"simple" | "monthly">("simple");
  const [anticipationMonthlyRate, setAnticipationMonthlyRate] = useState("1.15");

  const addPackage = () => {
    setInstallmentPackages(prev => [
      ...prev,
      { id: `pkg${Date.now()}`, label: "", from: 1, to: 1, rate: "0" },
    ]);
  };
  const removePackage = (id: string) =>
    setInstallmentPackages(prev => prev.filter(p => p.id !== id));
  const updatePackage = (id: string, field: keyof InstallmentPackage, value: string | number) =>
    setInstallmentPackages(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));

  // Textos padrões caso o banco esteja vazio
  const defaultFeatures = {
    free: ["Até 3 chamadas por conta", "Acesso básico à plataforma", "Apenas cobrança presencial"],
    pro: ["Chamadas ilimitadas", "Receba pagamentos pelo app", "Suporte no app"],
    vip: ["Tudo do Pro", "Selo de verificado", "Aparece em destaque na Home"],
    business: ["Tudo do VIP", "Consultoria personalizada", "Suporte 24h", "Catálogo de produtos", "Publicar vagas de emprego", "Acesso VIP ao Chamô Event"]
  };

  useEffect(() => {
    const fetch = async () => {
      // Busca taxas
      const { data: platformData } = await supabase.from("platform_settings").select("*");
      if (platformData) {
        const map: Record<string, string> = {};
        for (const s of platformData) {
          const val = typeof s.value === "string" ? s.value : JSON.stringify(s.value).replace(/^"|"$/g, "");
          map[s.key] = val;
        }
        setSettings(map);

        // Carrega modo de parcelas e pacotes
        if (map.installment_mode === "package" || map.installment_mode === "individual") {
          setInstallmentMode(map.installment_mode);
        }
        if (map.installment_packages) {
          try {
            const raw = map.installment_packages;
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) setInstallmentPackages(parsed);
          } catch { /* mantém default */ }
        }

        // Carrega modo de antecipação
        if (map.anticipation_mode === "monthly" || map.anticipation_mode === "simple") {
          setAnticipationMode(map.anticipation_mode);
        }
        if (map.anticipation_monthly_rate) {
          setAnticipationMonthlyRate(map.anticipation_monthly_rate);
        }
      }

      const { data: plansData } = await supabase.from("plans").select("id, price_monthly, price_annual, price_semester, features");
      if (plansData) {
        const plansMap: Record<string, string> = {};
        const annualMap: Record<string, string> = {};
        const semesterMap: Record<string, string> = {};
        const featsMap: Record<string, string[]> = {};
        plansData.forEach((p: any) => {
          plansMap[p.id] = p.price_monthly.toString().replace('.', ',');
          annualMap[p.id] = p.price_annual ? p.price_annual.toString().replace('.', ',') : "";
          semesterMap[p.id] = p.price_semester ? p.price_semester.toString().replace('.', ',') : "";
          featsMap[p.id] = p.features && p.features.length > 0 ? p.features : defaultFeatures[p.id as keyof typeof defaultFeatures];
        });
        setPlanPrices(plansMap);
        setPlanPricesAnnual(annualMap);
        setPlanPricesSemester(semesterMap);
        setPlanFeatures(featsMap);
      }

      setLoading(false);
    };
    fetch();
  }, []);

  const set = (key: string, value: string) => setSettings(prev => ({ ...prev, [key]: value }));
  const setPlanPrice = (id: string, value: string) => setPlanPrices(prev => ({ ...prev, [id]: value }));
  const setPlanPriceAnnual = (id: string, value: string) => setPlanPricesAnnual(prev => ({ ...prev, [id]: value }));
  const setPlanPriceSemester = (id: string, value: string) => setPlanPricesSemester(prev => ({ ...prev, [id]: value }));
  const toggleExpand = (id: string) => setExpandedPlan(prev => ({ ...prev, [id]: !prev[id] }));
  const addFeature = (id: string) => setPlanFeatures(prev => ({ ...prev, [id]: [...(prev[id] || []), ""] }));
  const updateFeature = (id: string, index: number, value: string) => {
    const arr = [...(planFeatures[id] || [])];
    arr[index] = value;
    setPlanFeatures(prev => ({ ...prev, [id]: arr }));
  };
  const removeFeature = (id: string, index: number) => {
    const arr = [...(planFeatures[id] || [])];
    arr.splice(index, 1);
    setPlanFeatures(prev => ({ ...prev, [id]: arr }));
  };

  const inputCls = "w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30";

  const handleSave = async () => {
    setSaving(true);

    // Salva Taxas simples (chave-valor)
    const feeKeys = ["commission_pct", "pix_fee_pct", "pix_fee_fixed", "card_fee_pct", "card_fee_fixed", "max_installments",
      "transfer_period_pix_hours", "transfer_period_card_days", "transfer_period_card_anticipated_days", "anticipation_fee_pct",
      ...Array.from({ length: 11 }, (_, i) => `installment_fee_${i + 2}x`)];
    for (const key of feeKeys) {
      if (settings[key] !== undefined) {
        await supabase.from("platform_settings").upsert({ key, value: settings[key] as any }, { onConflict: "key" });
      }
    }

    // Salva configurações de parcelas (modo e pacotes)
    await supabase.from("platform_settings").upsert({ key: "installment_mode", value: installmentMode as any }, { onConflict: "key" });
    await supabase.from("platform_settings").upsert({ key: "installment_packages", value: installmentPackages as any }, { onConflict: "key" });

    // Salva configurações de antecipação detalhada
    await supabase.from("platform_settings").upsert({ key: "anticipation_mode", value: anticipationMode as any }, { onConflict: "key" });
    await supabase.from("platform_settings").upsert({ key: "anticipation_monthly_rate", value: anticipationMonthlyRate as any }, { onConflict: "key" });

    // Salva Preço e Benefícios dos Planos
    for (const planId of ['free', 'pro', 'vip', 'business']) {
        const updateData: any = {};

        // Preços (o plano free fica fixo em 0)
        if(planId !== 'free' && planPrices[planId] !== undefined) {
            const rawValue = String(planPrices[planId]).replace(',', '.');
            const numericPrice = parseFloat(rawValue);
            if (!isNaN(numericPrice)) updateData.price_monthly = numericPrice;
        }
        // Preço anual
        if (planId !== 'free') {
          const annualRaw = String(planPricesAnnual[planId] || "").replace(',', '.');
          const annualNum = parseFloat(annualRaw);
          updateData.price_annual = isNaN(annualNum) || annualRaw === "" ? null : annualNum;
        }
        // Preço semestral
        if (planId !== 'free') {
          const semRaw = String(planPricesSemester[planId] || "").replace(',', '.');
          const semNum = parseFloat(semRaw);
          updateData.price_semester = isNaN(semNum) || semRaw === "" ? null : semNum;
        }

        // Benefícios (Limpa campos vazios antes de salvar)
        if(planFeatures[planId] !== undefined) {
            updateData.features = planFeatures[planId].filter(f => f.trim() !== "");
        }

        if (Object.keys(updateData).length > 0) {
           await supabase.from("plans").update(updateData).eq("id", planId);
        }
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase.from("admin_logs").insert({ admin_user_id: session.user.id, action: "update_financial_settings", target_type: "settings" });
    }
    toast({ title: "Configurações salvas com sucesso!" });
    setSaving(false);
  };

  const renderPlanEditor = (id: string, name: string, color: string) => {
    const isExpanded = expandedPlan[id];
    const features = planFeatures[id] || [];

    return (
      <div className="space-y-3 pb-6 border-b last:border-0 last:pb-0 border-border">
        {id !== 'free' && (
           <div className="space-y-2">
             <label className={`text-xs font-bold ${color} mb-1.5 block`}>{name}</label>
             <div className="grid grid-cols-3 gap-2">
               <div>
                 <label className="text-[10px] text-muted-foreground font-medium mb-1 block">Mensal (R$)</label>
                 <input type="text" placeholder="Ex: 39,90" value={planPrices[id] || ""} onChange={(e) => setPlanPrice(id, e.target.value)} className={inputCls} />
               </div>
               <div>
                 <label className="text-[10px] text-muted-foreground font-medium mb-1 block">Semestral total (R$)</label>
                 <input type="text" placeholder="Ex: 199,00" value={planPricesAnnual[id] !== undefined ? planPricesSemester[id] || "" : ""} onChange={(e) => setPlanPriceSemester(id, e.target.value)} className={inputCls} />
                 {planPricesSemester[id] && !isNaN(parseFloat(String(planPricesSemester[id]).replace(',', '.'))) && (
                   <p className="text-[9px] text-emerald-600 mt-0.5">= R$ {(parseFloat(String(planPricesSemester[id]).replace(',', '.')) / 6).toFixed(2).replace('.', ',')}/mês</p>
                 )}
               </div>
               <div>
                 <label className="text-[10px] text-muted-foreground font-medium mb-1 block">Anual total (R$)</label>
                 <input type="text" placeholder="Ex: 359,00" value={planPricesAnnual[id] || ""} onChange={(e) => setPlanPriceAnnual(id, e.target.value)} className={inputCls} />
                 {planPricesAnnual[id] && !isNaN(parseFloat(String(planPricesAnnual[id]).replace(',', '.'))) && (
                   <p className="text-[9px] text-emerald-600 mt-0.5">= R$ {(parseFloat(String(planPricesAnnual[id]).replace(',', '.')) / 12).toFixed(2).replace('.', ',')}/mês</p>
                 )}
               </div>
             </div>
           </div>
        )}
        {id === 'free' && (
           <label className={`text-xs font-bold ${color} block`}>{name}</label>
        )}

        <div>
          <button onClick={() => toggleExpand(id)} className="flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary/80 transition-colors">
            Benefícios 
            <span className="text-[10px] text-muted-foreground font-normal flex items-center">
              {isExpanded ? <>Ver menos <ChevronUp className="w-3 h-3 ml-0.5"/></> : <>Ver mais <ChevronDown className="w-3 h-3 ml-0.5"/></>}
            </span>
          </button>
          
          {isExpanded && (
            <div className="mt-3 space-y-3 animate-in fade-in slide-in-from-top-2">
              {features.map((feat, idx) => (
                <div key={idx}>
                  <label className="text-[10px] text-muted-foreground mb-1 block">Campo {idx + 1}</label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Check className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${color}`} />
                      <input value={feat} onChange={(e) => updateFeature(id, idx, e.target.value)} className="w-full border rounded-xl pl-9 pr-3 py-2 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                    <button onClick={() => removeFeature(id, idx)} className="p-2 text-muted-foreground hover:text-destructive transition-colors"><X className="w-4 h-4"/></button>
                  </div>
                </div>
              ))}
              <button onClick={() => addFeature(id)} className="text-[11px] font-semibold text-primary bg-primary/10 px-3 py-1.5 rounded-lg hover:bg-primary/20 transition-colors">
                + Adicionar benefício
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div className="max-w-4xl space-y-5 flex flex-col md:flex-row gap-5 items-start">
      {/* Coluna Esquerda - Configurações Existentes */}
      <div className="w-full md:w-1/2 space-y-5">
        <div className="bg-card border rounded-xl p-4 space-y-3">
          <h2 className="font-semibold text-foreground text-sm">Comissão da plataforma</h2>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Comissão (%)</label>
            <input type="number" step="0.01" min="0" value={settings.commission_pct || "10"} onChange={(e) => set("commission_pct", e.target.value)} className={inputCls} />
          </div>
        </div>

        <div className="bg-card border rounded-xl p-4 space-y-3">
          <h2 className="font-semibold text-foreground text-sm">Taxas de Pagamento</h2>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">PIX (%)</label><input type="number" step="0.01" min="0" value={settings.pix_fee_pct || "0"} onChange={(e) => set("pix_fee_pct", e.target.value)} className={inputCls} /></div>
            <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">PIX fixo (R$)</label><input type="number" step="0.01" min="0" value={settings.pix_fee_fixed || "0"} onChange={(e) => set("pix_fee_fixed", e.target.value)} className={inputCls} /></div>
            <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Cartão à vista (%)</label><input type="number" step="0.01" min="0" value={settings.card_fee_pct || "0"} onChange={(e) => set("card_fee_pct", e.target.value)} className={inputCls} /></div>
            <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Cartão fixo (R$)</label><input type="number" step="0.01" min="0" value={settings.card_fee_fixed || "0"} onChange={(e) => set("card_fee_fixed", e.target.value)} className={inputCls} /></div>
          </div>
        </div>

        {/* Taxas por Parcela */}
        <div className="bg-card border rounded-xl p-4 space-y-4">
          <h2 className="font-semibold text-foreground text-sm">Taxas por Parcela</h2>

          {/* Modo toggle */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setInstallmentMode("individual")}
              className={`flex-1 flex items-center justify-center gap-1.5 p-2.5 rounded-xl border text-xs font-medium transition-colors ${installmentMode === "individual" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
            >
              <List className="w-3.5 h-3.5" /> Por Parcela Individual
            </button>
            <button
              type="button"
              onClick={() => setInstallmentMode("package")}
              className={`flex-1 flex items-center justify-center gap-1.5 p-2.5 rounded-xl border text-xs font-medium transition-colors ${installmentMode === "package" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
            >
              <Package className="w-3.5 h-3.5" /> Por Pacote de Parcelas
            </button>
          </div>

          {/* Máximo de parcelas */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Máximo de parcelas</label>
            <input type="number" min="1" max="21" value={settings.max_installments || "12"} onChange={(e) => set("max_installments", e.target.value)} className={inputCls} />
          </div>

          {installmentMode === "package" ? (
            <div className="space-y-3">
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-blue-700 dark:text-blue-300">A taxa é cobrada sobre o <strong>valor total da venda</strong>, independente do número de parcelas dentro do pacote. Ex.: Asaas cobra 3,99% para qualquer parcelamento de 7 a 12x.</p>
              </div>

              {/* Lista de pacotes */}
              <div className="space-y-2">
                {/* Header */}
                <div className="grid grid-cols-[1fr_60px_60px_70px_32px] gap-2 text-[10px] font-semibold text-muted-foreground uppercase px-1">
                  <span>Descrição</span><span>De (x)</span><span>Até (x)</span><span>Taxa (%)</span><span />
                </div>
                {installmentPackages.map((pkg) => (
                  <div key={pkg.id} className="grid grid-cols-[1fr_60px_60px_70px_32px] gap-2 items-center">
                    <input
                      type="text"
                      placeholder="Ex: 2 a 6x"
                      value={pkg.label}
                      onChange={(e) => updatePackage(pkg.id, "label", e.target.value)}
                      className={inputCls}
                    />
                    <input
                      type="number" min="1" max="21"
                      value={pkg.from}
                      onChange={(e) => updatePackage(pkg.id, "from", Number(e.target.value))}
                      className={inputCls}
                    />
                    <input
                      type="number" min="1" max="21"
                      value={pkg.to}
                      onChange={(e) => updatePackage(pkg.id, "to", Number(e.target.value))}
                      className={inputCls}
                    />
                    <input
                      type="number" step="0.01" min="0"
                      value={pkg.rate}
                      onChange={(e) => updatePackage(pkg.id, "rate", e.target.value)}
                      className={inputCls}
                    />
                    <button
                      type="button"
                      onClick={() => removePackage(pkg.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg border border-red-200 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addPackage}
                className="w-full flex items-center justify-center gap-1.5 p-2.5 rounded-xl border border-dashed border-primary/40 text-primary text-xs font-medium hover:bg-primary/5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar pacote
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 11 }, (_, i) => i + 2).map(n => (
                <div key={n}>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{n}x (%)</label>
                  <input type="number" step="0.01" value={settings[`installment_fee_${n}x`] || "0"} onChange={(e) => set(`installment_fee_${n}x`, e.target.value)} className={inputCls} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Prazos de Repasse */}
        <div className="bg-card border rounded-xl p-4 space-y-3">
          <h2 className="font-semibold text-foreground text-sm">Prazos de Repasse</h2>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">PIX (horas)</label><input type="number" value={settings.transfer_period_pix_hours || "48"} onChange={(e) => set("transfer_period_pix_hours", e.target.value)} className={inputCls} /></div>
            <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Cartão sem antecipação (dias úteis)</label><input type="number" value={settings.transfer_period_card_days || "33"} onChange={(e) => set("transfer_period_card_days", e.target.value)} className={inputCls} /></div>
            <div className="col-span-2"><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Cartão com antecipação (dias úteis)</label><input type="number" value={settings.transfer_period_card_anticipated_days || "4"} onChange={(e) => set("transfer_period_card_anticipated_days", e.target.value)} className={inputCls} /></div>
          </div>
        </div>

        {/* Antecipação de Recebíveis */}
        <div className="bg-card border rounded-xl p-4 space-y-4">
          <h2 className="font-semibold text-foreground text-sm">Antecipação de Recebíveis</h2>
          <p className="text-[11px] text-muted-foreground">Configure como a taxa de antecipação é calculada e cobrada.</p>

          {/* Modo de taxa */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAnticipationMode("simple")}
              className={`flex-1 p-2.5 rounded-xl border text-xs font-medium text-left transition-colors ${anticipationMode === "simple" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
            >
              <p className="font-semibold">Taxa simples (%)</p>
              <p className="text-[10px] mt-0.5 opacity-70">Ex.: 3,5% sobre o valor total antecipado</p>
            </button>
            <button
              type="button"
              onClick={() => setAnticipationMode("monthly")}
              className={`flex-1 p-2.5 rounded-xl border text-xs font-medium text-left transition-colors ${anticipationMode === "monthly" ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
            >
              <p className="font-semibold">% ao mês por parcela</p>
              <p className="text-[10px] mt-0.5 opacity-70">Ex.: 1,15% × nº parcelas antecipadas</p>
            </button>
          </div>

          {anticipationMode === "monthly" ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Taxa ao mês (%)</label>
                <input
                  type="number" step="0.01" min="0"
                  value={anticipationMonthlyRate}
                  onChange={(e) => setAnticipationMonthlyRate(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <p className="text-[11px] text-amber-700 dark:text-amber-300 font-medium mb-1">Como será exibido ao profissional:</p>
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  Taxa: {anticipationMonthlyRate}% ao mês por parcela antecipada<br />
                  <span className="opacity-80">Ex.: antecipando 6 parcelas → {(parseFloat(anticipationMonthlyRate || "0") * 6).toFixed(2).replace(".", ",")}% sobre o valor total</span>
                </p>
              </div>
            </div>
          ) : (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Taxa de antecipação (%)</label>
              <input type="number" step="0.01" min="0" value={settings.anticipation_fee_pct || "3.5"} onChange={(e) => set("anticipation_fee_pct", e.target.value)} className={inputCls} />
            </div>
          )}
        </div>
      </div>

      {/* Coluna Direita - Blocos de Planos com Benefícios (Accordion) */}
      <div className="w-full md:w-1/2 space-y-5 mt-0">
         <div className="bg-card border rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Crown className="w-5 h-5 text-amber-500" />
            <h2 className="font-semibold text-foreground text-sm">Planos e Benefícios</h2>
          </div>
          <p className="text-[11px] text-muted-foreground mb-4">
            Defina o valor mensal e os textos dos benefícios de cada plano.
          </p>

          <div className="space-y-4">
            {renderPlanEditor('pro', 'Plano Pro (R$)', 'text-primary')}
            {renderPlanEditor('vip', 'Plano VIP (R$)', 'text-amber-500')}
            {renderPlanEditor('business', 'Plano Empresarial (R$)', 'text-violet-500')}
            {renderPlanEditor('free', 'Plano Grátis', 'text-muted-foreground')}
          </div>
        </div>

        <button onClick={handleSave} disabled={saving}
          className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Salvando..." : "Salvar todas as configurações"}
        </button>
      </div>
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
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "pending" | "refused" | "cancelled" | "courtesy">("all");
  const [activeTab, setActiveTab] = useState("subscribers");

  const [subStats, setSubStats] = useState({ pro: 0, vip: 0, business: 0, total: 0, courtesy: 0, pending: 0, refused: 0 });

  // Subscription payments (cobranças de assinatura)
  const [subPayments, setSubPayments] = useState<SubscriptionPayment[]>([]);
  const [subPaymentsLoading, setSubPaymentsLoading] = useState(true);
  const [subPaymentsSearch, setSubPaymentsSearch] = useState("");
  const [subPaymentsStatusFilter, setSubPaymentsStatusFilter] = useState<"all" | "paid" | "pending" | "refused" | "courtesy" | "refunded">("all");

  // Detail modals
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [selectedSub, setSelectedSub] = useState<Subscriber | null>(null);
  const [showCourtesyModal, setShowCourtesyModal] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const triggerReload = () => setReloadKey(k => k + 1);

  useEffect(() => {
    const fetchAll = async () => {
      const { data: summary } = await supabase.rpc("get_transaction_summary");
      const s = Array.isArray(summary) ? summary[0] : summary;
      setTotalVolume(Number(s?.total_volume || 0));
      setTotalFees(Number(s?.total_fees || 0));
      setTotalCount(Number(s?.transaction_count || 0));

      const { data } = await supabase.from("transactions").select("*").order("created_at", { ascending: false }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      setTransactions((data || []) as any);
      setLoading(false);
    };
    fetchAll();
  }, [page]);

  useEffect(() => {
    const fetchSubs = async () => {
      setSubsLoading(true);
      // Busca todas as assinaturas pagas (todos os status) — filtramos no client
      const { data: subs } = await supabase
        .from("subscriptions")
        .select("*")
        .neq("plan_id", "free")
        .order("started_at", { ascending: false });

      if (!subs || subs.length === 0) {
        setSubscribers([]);
        setSubStats({ pro: 0, vip: 0, business: 0, total: 0, courtesy: 0, pending: 0, refused: 0 });
        setSubsLoading(false);
        return;
      }

      const userIds = subs.map(s => s.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", userIds);

      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));

      const mapped: Subscriber[] = subs
        .filter(s => profileMap.has(s.user_id))
        .map(s => ({
          ...(s as any),
          status: normalizeSubStatus((s as any).status),
          full_name: profileMap.get(s.user_id)?.full_name || "—",
          email: profileMap.get(s.user_id)?.email || "—",
        }));

      setSubscribers(mapped);
      const activeOrCourtesy = mapped.filter(s => ["active", "courtesy"].includes(s.status));
      setSubStats({
        pro: activeOrCourtesy.filter(s => s.plan_id === "pro").length,
        vip: activeOrCourtesy.filter(s => s.plan_id === "vip").length,
        business: activeOrCourtesy.filter(s => s.plan_id === "business").length,
        total: activeOrCourtesy.length,
        courtesy: mapped.filter(s => s.status === "courtesy").length,
        pending: mapped.filter(s => s.status === "pending").length,
        refused: mapped.filter(s => s.status === "refused").length,
      });
      setSubsLoading(false);
    };
    fetchSubs();
  }, [reloadKey]);

  // Carrega cobranças de assinatura (subscription_payments)
  useEffect(() => {
    const fetchPayments = async () => {
      setSubPaymentsLoading(true);
      const { data } = await (supabase as any)
        .from("subscription_payments")
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(200);

      if (!data || data.length === 0) {
        setSubPayments([]);
        setSubPaymentsLoading(false);
        return;
      }

      const userIds = Array.from(new Set(data.map((p: any) => p.user_id))) as string[];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", userIds);
      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));

      setSubPayments(data.map((p: any) => ({
        ...p,
        full_name: profileMap.get(p.user_id)?.full_name || "—",
        email: profileMap.get(p.user_id)?.email || "—",
      })) as SubscriptionPayment[]);
      setSubPaymentsLoading(false);
    };
    fetchPayments();
  }, [reloadKey]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const filteredSubs = useMemo(() => {
    return subscribers.filter(s => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (!subsSearch) return true;
      const q = subsSearch.toLowerCase();
      return s.full_name.toLowerCase().includes(q)
        || s.email.toLowerCase().includes(q)
        || s.plan_id.toLowerCase().includes(q);
    });
  }, [subscribers, subsSearch, statusFilter]);

  const filteredSubPayments = useMemo(() => {
    return subPayments.filter(p => {
      if (subPaymentsStatusFilter !== "all" && p.status !== subPaymentsStatusFilter) return false;
      if (!subPaymentsSearch) return true;
      const q = subPaymentsSearch.toLowerCase();
      return (p.full_name || "").toLowerCase().includes(q)
        || (p.email || "").toLowerCase().includes(q)
        || p.plan_id.toLowerCase().includes(q);
    });
  }, [subPayments, subPaymentsSearch, subPaymentsStatusFilter]);

  const statusCounts = useMemo(() => ({
    all: subscribers.length,
    active: subscribers.filter(s => s.status === "active").length,
    pending: subStats.pending,
    refused: subStats.refused,
    cancelled: subscribers.filter(s => s.status === "cancelled").length,
    courtesy: subStats.courtesy,
  }), [subscribers, subStats]);

  return (
    <AdminLayout title="Financeiro">
      {selectedTx && <TransactionDetail tx={selectedTx} onClose={() => setSelectedTx(null)} />}
      {selectedSub && <SubscriberDetail sub={selectedSub} onClose={() => setSelectedSub(null)} onChanged={triggerReload} />}
      {showCourtesyModal && <GrantCourtesyModal onClose={() => setShowCourtesyModal(false)} onGranted={triggerReload} />}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-card border rounded-xl p-3 md:p-4">
          <DollarSign className="w-5 h-5 text-primary mb-1" />
          <p className="text-lg md:text-xl font-bold text-foreground">{fmtBRL(totalVolume)}</p>
          <p className="text-[11px] text-muted-foreground">Volume total</p>
        </div>
        <div className="bg-card border rounded-xl p-3 md:p-4">
          <TrendingUp className="w-5 h-5 text-primary mb-1" />
          <p className="text-lg md:text-xl font-bold text-foreground">{fmtBRL(totalFees)}</p>
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

      {/* Alertas rápidos */}
      {(subStats.pending > 0 || subStats.refused > 0 || subStats.courtesy > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-6">
          {subStats.pending > 0 && (
            <button onClick={() => { setActiveTab("subscribers"); setStatusFilter("pending"); }}
              className="flex items-center gap-2 p-2.5 rounded-xl border bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 hover:bg-amber-100 transition-colors text-left">
              <Clock className="w-4 h-4 text-amber-600 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-amber-700 dark:text-amber-400">{subStats.pending} pendente(s)</p>
                <p className="text-[10px] text-amber-600 dark:text-amber-500">Aguardando confirmação do gateway</p>
              </div>
            </button>
          )}
          {subStats.refused > 0 && (
            <button onClick={() => { setActiveTab("subscribers"); setStatusFilter("refused"); }}
              className="flex items-center gap-2 p-2.5 rounded-xl border bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 hover:bg-red-100 transition-colors text-left">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-red-700 dark:text-red-400">{subStats.refused} recusada(s)</p>
                <p className="text-[10px] text-red-600 dark:text-red-500">Cobrança falhou — plano não ativo</p>
              </div>
            </button>
          )}
          {subStats.courtesy > 0 && (
            <button onClick={() => { setActiveTab("subscribers"); setStatusFilter("courtesy"); }}
              className="flex items-center gap-2 p-2.5 rounded-xl border bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800 hover:bg-violet-100 transition-colors text-left">
              <Gift className="w-4 h-4 text-violet-600 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-violet-700 dark:text-violet-400">{subStats.courtesy} cortesia(s)</p>
                <p className="text-[10px] text-violet-600 dark:text-violet-500">Liberadas manualmente</p>
              </div>
            </button>
          )}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4 flex flex-wrap w-full gap-1 h-auto min-h-10">
          <TabsTrigger value="subscribers" className="relative shrink-0">
            <Crown className="w-3.5 h-3.5 mr-1" />
            Assinantes
            {subStats.total > 0 && <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">{subStats.total}</span>}
          </TabsTrigger>
          <TabsTrigger value="sub-payments" className="shrink-0">
            <Receipt className="w-3.5 h-3.5 mr-1" />
            Cobranças do plano
          </TabsTrigger>
          <TabsTrigger value="transactions" className="shrink-0">
            <CreditCard className="w-3.5 h-3.5 mr-1" />
            Transações
          </TabsTrigger>
          <TabsTrigger value="fiscal" className="shrink-0"><FileText className="w-3.5 h-3.5 mr-1" />Dados Fiscais</TabsTrigger>
          <TabsTrigger value="config" className="shrink-0"><Settings2 className="w-3.5 h-3.5 mr-1" />Configurações</TabsTrigger>
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
                      <th className="text-left p-3 font-medium text-muted-foreground">Comissão App</th>
                      <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Taxa Transação</th>
                      <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Líquido</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Data</th>
                      <th className="text-left p-3 font-medium text-muted-foreground"></th>
                    </tr></thead>
                    <tbody>
                      {transactions.map((t) => (
                        <tr key={t.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="p-3 text-xs md:text-sm">R$ {Number(t.total_amount).toLocaleString("pt-BR")}</td>
                          <td className="p-3 text-primary font-medium text-xs md:text-sm">R$ {Number(t.commission_fee || t.platform_fee).toLocaleString("pt-BR")}</td>
                          <td className="p-3 hidden md:table-cell text-xs text-orange-600">R$ {Number(t.payment_fee || 0).toLocaleString("pt-BR")}</td>
                          <td className="p-3 hidden md:table-cell text-xs">R$ {Number(t.professional_net).toLocaleString("pt-BR")}</td>
                          <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${(statusMap[t.status] || statusMap.pending).cls}`}>{(statusMap[t.status] || statusMap.pending).label}</span></td>
                          <td className="p-3 text-[11px] text-muted-foreground whitespace-nowrap">{fmtDateTime(t.created_at)}</td>
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
          <div className="flex flex-col md:flex-row md:items-center gap-2 mb-4">
            <div className="flex-1 flex items-center gap-2 border rounded-xl px-3 py-2.5 bg-card focus-within:ring-2 focus-within:ring-primary/30">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input type="text" value={subsSearch} onChange={(e) => setSubsSearch(e.target.value)} placeholder="Buscar assinante..."
                className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground" />
            </div>
            <button onClick={() => setShowCourtesyModal(true)}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-violet-500 text-white text-sm font-semibold hover:bg-violet-600 transition-colors shrink-0">
              <Gift className="w-4 h-4" /> Conceder Cortesia
            </button>
          </div>

          {/* Filtros de status */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {([
              { id: "all",       label: "Todos",      cls: "bg-muted text-foreground hover:bg-muted/80" },
              { id: "active",    label: "Ativos",     cls: "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400" },
              { id: "pending",   label: "Pendentes",  cls: "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400" },
              { id: "refused",   label: "Recusados",  cls: "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400" },
              { id: "courtesy",  label: "Cortesia",   cls: "bg-violet-100 text-violet-700 hover:bg-violet-200 dark:bg-violet-900/30 dark:text-violet-400" },
              { id: "cancelled", label: "Cancelados", cls: "bg-muted text-muted-foreground hover:bg-muted/80" },
            ] as const).map(opt => {
              const count = (statusCounts as Record<string, number>)[opt.id] ?? 0;
              const isActive = statusFilter === opt.id;
              return (
                <button key={opt.id} onClick={() => setStatusFilter(opt.id as any)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${opt.cls} ${isActive ? "ring-2 ring-primary/40 ring-offset-1 ring-offset-background" : ""}`}>
                  {opt.label} <span className="opacity-70">({count})</span>
                </button>
              );
            })}
          </div>

          {subsLoading ? (
            <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div>
          ) : filteredSubs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Nenhum assinante encontrado para este filtro</div>
          ) : (
            <div className="bg-card border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium text-muted-foreground">Profissional</th>
                    <th className="text-left p-3 font-medium text-muted-foreground hidden lg:table-cell">Email</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Plano</th>
                    <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Origem</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Início</th>
                    <th className="text-left p-3 font-medium text-muted-foreground"></th>
                  </tr></thead>
                  <tbody>
                    {filteredSubs.map((s) => {
                      const st = subStatusMap[s.status] || subStatusMap.pending;
                      const src = s.source ? sourceMap[s.source] : null;
                      return (
                        <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="p-3">
                            <p className="font-medium text-foreground text-xs md:text-sm">{s.full_name}</p>
                            <p className="text-[10px] text-muted-foreground lg:hidden">{s.email}</p>
                          </td>
                          <td className="p-3 text-xs text-muted-foreground hidden lg:table-cell">{s.email}</td>
                          <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${planCls[s.plan_id] || planCls.free}`}>{planLabel[s.plan_id] || s.plan_id}</span></td>
                          <td className="p-3 hidden md:table-cell">
                            {src ? (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${src.cls}`}>
                                <src.Icon className="w-3 h-3" /> {src.label}
                              </span>
                            ) : <span className="text-[10px] text-muted-foreground">—</span>}
                          </td>
                          <td className="p-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.cls}`}>
                              <st.Icon className="w-3 h-3" /> {st.label}
                            </span>
                          </td>
                          <td className="p-3 text-[11px] text-muted-foreground hidden md:table-cell whitespace-nowrap">
                            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{fmtDateTime(s.started_at)}</span>
                          </td>
                          <td className="p-3"><button onClick={() => setSelectedSub(s)} className="text-[11px] text-primary font-medium hover:underline">Ver mais</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="sub-payments">
          <div className="flex flex-col md:flex-row md:items-center gap-2 mb-4">
            <div className="flex-1 flex items-center gap-2 border rounded-xl px-3 py-2.5 bg-card focus-within:ring-2 focus-within:ring-primary/30">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input type="text" value={subPaymentsSearch} onChange={(e) => setSubPaymentsSearch(e.target.value)} placeholder="Buscar profissional..."
                className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground" />
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 mb-4">
            {([
              { id: "all",      label: "Todas",       cls: "bg-muted text-foreground hover:bg-muted/80" },
              { id: "paid",     label: "Pagas",       cls: "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400" },
              { id: "pending",  label: "Pendentes",   cls: "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400" },
              { id: "refused",  label: "Recusadas",   cls: "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400" },
              { id: "refunded", label: "Reembolsadas",cls: "bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400" },
              { id: "courtesy", label: "Cortesia",    cls: "bg-violet-100 text-violet-700 hover:bg-violet-200 dark:bg-violet-900/30 dark:text-violet-400" },
            ] as const).map(opt => {
              const isActive = subPaymentsStatusFilter === opt.id;
              const count = opt.id === "all"
                ? subPayments.length
                : subPayments.filter(p => p.status === opt.id).length;
              return (
                <button key={opt.id} onClick={() => setSubPaymentsStatusFilter(opt.id as any)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${opt.cls} ${isActive ? "ring-2 ring-primary/40 ring-offset-1 ring-offset-background" : ""}`}>
                  {opt.label} <span className="opacity-70">({count})</span>
                </button>
              );
            })}
          </div>

          {subPaymentsLoading ? (
            <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div>
          ) : filteredSubPayments.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Nenhuma cobrança encontrada</div>
          ) : (
            <div className="bg-card border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium text-muted-foreground">Profissional</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Plano</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Origem</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Valor</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Data / Hora</th>
                  </tr></thead>
                  <tbody>
                    {filteredSubPayments.map(p => {
                      const ps = paymentStatusMap[p.status] || { label: p.status, cls: "bg-muted text-muted-foreground" };
                      const src = sourceMap[p.source];
                      return (
                        <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="p-3">
                            <p className="font-medium text-foreground text-xs md:text-sm">{p.full_name}</p>
                            <p className="text-[10px] text-muted-foreground md:hidden">{fmtDateTime(p.occurred_at)}</p>
                          </td>
                          <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${planCls[p.plan_id] || planCls.free}`}>{planLabel[p.plan_id] || p.plan_id}</span></td>
                          <td className="p-3">
                            {src ? (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${src.cls}`}>
                                <src.Icon className="w-3 h-3" /> {src.label}
                              </span>
                            ) : <span className="text-[10px] text-muted-foreground">{p.source}</span>}
                          </td>
                          <td className="p-3 text-xs md:text-sm font-semibold text-foreground">{fmtBRL(Number(p.amount))}</td>
                          <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${ps.cls}`}>{ps.label}</span></td>
                          <td className="p-3 text-[11px] text-muted-foreground hidden md:table-cell whitespace-nowrap">{fmtDateTime(p.occurred_at)}</td>
                        </tr>
                      );
                    })}
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