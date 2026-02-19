import AppLayout from "@/components/AppLayout";
import { DollarSign, TrendingUp, Calendar, Landmark, FileText, AlertTriangle, Save, Loader2, Info } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { formatCpf, formatCnpj, validateCpf, validateCnpj } from "@/lib/formatters";

type Period = "day" | "month";
type DateRange = "7d" | "30d" | "custom";

interface FiscalData {
  id?: string;
  professional_id: string;
  payment_method: string;
  bank_name: string;
  bank_agency: string;
  bank_account: string;
  bank_account_type: string;
  pix_key: string;
  pix_key_type: string;
  fiscal_name: string;
  fiscal_document: string;
  fiscal_email: string;
  fiscal_address_street: string;
  fiscal_address_number: string;
  fiscal_address_complement: string;
  fiscal_address_neighborhood: string;
  fiscal_address_city: string;
  fiscal_address_state: string;
  fiscal_address_zip: string;
  charge_interest_to_client: boolean;
  anticipation_enabled: boolean;
}

const emptyFiscal = (proId: string): FiscalData => ({
  professional_id: proId,
  payment_method: "pix",
  bank_name: "", bank_agency: "", bank_account: "", bank_account_type: "corrente",
  pix_key: "", pix_key_type: "cpf",
  fiscal_name: "", fiscal_document: "", fiscal_email: "",
  fiscal_address_street: "", fiscal_address_number: "", fiscal_address_complement: "",
  fiscal_address_neighborhood: "", fiscal_address_city: "", fiscal_address_state: "", fiscal_address_zip: "",
  charge_interest_to_client: false, anticipation_enabled: false,
});

// === Fiscal Registration Tab ===
const FiscalTab = ({ proId, userDoc }: { proId: string; userDoc: string | null }) => {
  const [fiscal, setFiscal] = useState<FiscalData>(emptyFiscal(proId));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("professional_fiscal_data").select("*").eq("professional_id", proId).maybeSingle()
      .then(({ data }) => {
        if (data) setFiscal(data as any);
        setLoading(false);
      });
  }, [proId]);

  const set = (key: keyof FiscalData, val: any) => setFiscal(prev => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    // Validate document matches profile CPF/CNPJ
    if (userDoc && fiscal.fiscal_document) {
      const cleanDoc = fiscal.fiscal_document.replace(/\D/g, "");
      const cleanUser = userDoc.replace(/\D/g, "");
      if (cleanDoc !== cleanUser) {
        toast({ title: "O documento fiscal deve ser o mesmo CPF/CNPJ do seu cadastro", variant: "destructive" });
        return;
      }
    }
    setSaving(true);
    const payload: any = { ...fiscal, professional_id: proId };
    delete payload.id;
    delete payload.created_at;
    delete payload.updated_at;

    if (fiscal.id) {
      await supabase.from("professional_fiscal_data").update(payload).eq("id", fiscal.id);
    } else {
      const { data } = await supabase.from("professional_fiscal_data").insert(payload).select("id").single();
      if (data) setFiscal(prev => ({ ...prev, id: data.id }));
    }
    toast({ title: "Dados fiscais salvos!" });
    setSaving(false);
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div>;

  const inputCls = "w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30";

  return (
    <div className="space-y-5">
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-700 dark:text-amber-300">
          <strong>Importante:</strong> Os dados bancários e fiscais devem estar no seu nome (CPF/CNPJ cadastrado na plataforma). Não é permitido cadastrar dados de terceiros.
        </p>
      </div>

      {/* Banking */}
      <div className="bg-card border rounded-xl p-4 space-y-3">
        <h2 className="font-semibold text-foreground text-sm flex items-center gap-2"><Landmark className="w-4 h-4" />Dados Bancários</h2>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Método de recebimento</label>
          <div className="flex gap-2">
            {[["pix", "Chave PIX"], ["bank_transfer", "Conta bancária (TED)"]].map(([v, l]) => (
              <button key={v} onClick={() => set("payment_method", v)}
                className={`flex-1 px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${fiscal.payment_method === v ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:bg-muted"}`}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {fiscal.payment_method === "pix" ? (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tipo de chave</label>
              <select value={fiscal.pix_key_type} onChange={e => set("pix_key_type", e.target.value)} className={inputCls}>
                <option value="cpf">CPF</option>
                <option value="cnpj">CNPJ</option>
              </select>
              <p className="text-[10px] text-muted-foreground mt-1">Somente chave PIX vinculada ao seu {userDoc && userDoc.length > 14 ? "CNPJ" : "CPF"} cadastrado</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Chave PIX</label>
              <input value={fiscal.pix_key} onChange={e => {
                const val = fiscal.pix_key_type === "cpf" ? formatCpf(e.target.value) : formatCnpj(e.target.value);
                set("pix_key", val);
              }} className={inputCls}
                maxLength={fiscal.pix_key_type === "cpf" ? 14 : 18}
                placeholder={fiscal.pix_key_type === "cpf" ? "000.000.000-00" : "00.000.000/0000-00"} />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Banco</label>
                <input value={fiscal.bank_name} onChange={e => set("bank_name", e.target.value)} className={inputCls} placeholder="Ex: Itaú" /></div>
              <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tipo de conta</label>
                <select value={fiscal.bank_account_type} onChange={e => set("bank_account_type", e.target.value)} className={inputCls}>
                  <option value="corrente">Corrente</option>
                  <option value="poupanca">Poupança</option>
                </select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Agência</label>
                <input value={fiscal.bank_agency} onChange={e => set("bank_agency", e.target.value)} className={inputCls} placeholder="0001" /></div>
              <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Conta</label>
                <input value={fiscal.bank_account} onChange={e => set("bank_account", e.target.value)} className={inputCls} placeholder="00000-0" /></div>
            </div>
          </div>
        )}
      </div>

      {/* Fiscal data */}
      <div className="bg-card border rounded-xl p-4 space-y-3">
        <h2 className="font-semibold text-foreground text-sm flex items-center gap-2"><FileText className="w-4 h-4" />Dados para Nota Fiscal</h2>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Nome / Razão Social</label>
            <input value={fiscal.fiscal_name} onChange={e => set("fiscal_name", e.target.value)} className={inputCls} /></div>
          <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">CPF / CNPJ</label>
            <input value={fiscal.fiscal_document} onChange={e => {
              const raw = e.target.value.replace(/\D/g, "");
              set("fiscal_document", raw.length <= 11 ? formatCpf(e.target.value) : formatCnpj(e.target.value));
            }} className={inputCls} maxLength={18} placeholder={userDoc || ""} /></div>
        </div>
        <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Email para NF</label>
          <input type="email" value={fiscal.fiscal_email} onChange={e => set("fiscal_email", e.target.value)} className={inputCls} /></div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2"><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Rua</label>
            <input value={fiscal.fiscal_address_street} onChange={e => set("fiscal_address_street", e.target.value)} className={inputCls} /></div>
          <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Nº</label>
            <input value={fiscal.fiscal_address_number} onChange={e => set("fiscal_address_number", e.target.value)} className={inputCls} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Bairro</label>
            <input value={fiscal.fiscal_address_neighborhood} onChange={e => set("fiscal_address_neighborhood", e.target.value)} className={inputCls} /></div>
          <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Complemento</label>
            <input value={fiscal.fiscal_address_complement} onChange={e => set("fiscal_address_complement", e.target.value)} className={inputCls} /></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Cidade</label>
            <input value={fiscal.fiscal_address_city} onChange={e => set("fiscal_address_city", e.target.value)} className={inputCls} /></div>
          <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">UF</label>
            <input maxLength={2} value={fiscal.fiscal_address_state} onChange={e => set("fiscal_address_state", e.target.value.toUpperCase())} className={inputCls} /></div>
          <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">CEP</label>
            <input value={fiscal.fiscal_address_zip} onChange={e => set("fiscal_address_zip", e.target.value)} className={inputCls} /></div>
        </div>
      </div>

      <button onClick={handleSave} disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 w-full justify-center">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? "Salvando..." : "Salvar dados fiscais"}
      </button>
    </div>
  );
};

// === Fee Preferences Tab ===
const FeePreferencesTab = ({ proId }: { proId: string }) => {
  const [fiscal, setFiscal] = useState<FiscalData | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadSettings = async () => {
    const [{ data: fd }, { data: ps }] = await Promise.all([
      supabase.from("professional_fiscal_data").select("*").eq("professional_id", proId).maybeSingle(),
      supabase.from("platform_settings").select("key, value"),
    ]);
    if (fd) setFiscal(fd as any);
    if (ps) {
      const map: Record<string, string> = {};
      for (const s of ps) {
        const v = s.value;
        map[s.key] = typeof v === "string" ? v : String(v);
      }
      setSettings(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadSettings();
    // Refetch when user returns to tab (catches admin changes)
    const handler = () => { if (!document.hidden) loadSettings(); };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [proId]);

  const handleSave = async (field: string, value: boolean) => {
    setSaving(true);
    if (fiscal?.id) {
      await supabase.from("professional_fiscal_data").update({ [field]: value }).eq("id", fiscal.id);
      setFiscal(prev => prev ? { ...prev, [field]: value } : prev);
    } else {
      const payload: any = { ...emptyFiscal(proId), [field]: value };
      const { data } = await supabase.from("professional_fiscal_data").insert(payload).select().single();
      if (data) setFiscal(data as any);
    }
    toast({ title: "Preferência atualizada!" });
    setSaving(false);
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div>;

  const chargeInterest = fiscal?.charge_interest_to_client ?? false;
  const anticipation = fiscal?.anticipation_enabled ?? false;
  const pixPeriod = settings.transfer_period_pix_hours || "48";
  const cardPeriod = settings.transfer_period_card_days || "33";
  const cardAnticipatedPeriod = settings.transfer_period_card_anticipated_days || "4";
  const anticipationFee = settings.anticipation_fee_pct || "3.5";
  const commissionPct = settings.commission_pct || "10";

  return (
    <div className="space-y-5">
      {/* Transfer periods */}
      <div className="bg-card border rounded-xl p-4 space-y-3">
        <h2 className="font-semibold text-foreground text-sm">Prazos de Repasse</h2>
        <div className="space-y-2">
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-foreground">PIX</p>
              <p className="text-[10px] text-muted-foreground">Após confirmação do pagamento</p>
            </div>
            <span className="text-sm font-bold text-primary">até {pixPeriod}h</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-foreground">Cartão {anticipation ? "(antecipado)" : "(sem antecipação)"}</p>
              <p className="text-[10px] text-muted-foreground">Após confirmação do pagamento</p>
            </div>
            <span className="text-sm font-bold text-primary">{anticipation ? `${cardAnticipatedPeriod} dias úteis` : `${cardPeriod} dias úteis`}</span>
          </div>
        </div>
      </div>

      {/* Interest preference */}
      <div className="bg-card border rounded-xl p-4 space-y-3">
        <h2 className="font-semibold text-foreground text-sm">Juros do Parcelamento</h2>
        <p className="text-xs text-muted-foreground">Escolha quem paga as taxas de parcelamento no cartão de crédito.</p>
        <div className="flex gap-2">
          <button onClick={() => handleSave("charge_interest_to_client", false)} disabled={saving}
            className={`flex-1 p-3 rounded-xl border text-left transition-colors ${!chargeInterest ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}>
            <p className="text-xs font-semibold text-foreground">Sem juros para o cliente</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">As taxas serão descontadas do seu valor líquido</p>
          </button>
          <button onClick={() => handleSave("charge_interest_to_client", true)} disabled={saving}
            className={`flex-1 p-3 rounded-xl border text-left transition-colors ${chargeInterest ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}>
            <p className="text-xs font-semibold text-foreground">Com juros para o cliente</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">O cliente verá as taxas no parcelamento</p>
          </button>
        </div>

        {!chargeInterest && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
            <p className="text-xs text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>As taxas de parcelamento serão descontadas do valor que você recebe. Comissão da plataforma: {commissionPct}%.</span>
            </p>
          </div>
        )}

        {/* Show fee table */}
        <div className="space-y-1.5 pt-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Taxas por parcela</p>
          <div className="grid grid-cols-3 gap-1.5 text-[11px]">
            <span className="text-muted-foreground font-medium">Parcelas</span>
            <span className="text-muted-foreground font-medium">Taxa</span>
            <span className="text-muted-foreground font-medium">Quem paga</span>
            {Array.from({ length: parseInt(settings.max_installments || "12") }, (_, i) => i + 1).map(n => {
              const feeKey = n === 1 ? "card_fee_pct" : `installment_fee_${n}x`;
              const fee = settings[feeKey] || "0";
              return (
                <React.Fragment key={n}>
                  <span className="text-foreground">{n}x</span>
                  <span className="text-foreground">{fee}%</span>
                  <span className={chargeInterest ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400"}>{chargeInterest ? "Cliente" : "Você"}</span>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {/* Anticipation preference */}
      <div className="bg-card border rounded-xl p-4 space-y-3">
        <h2 className="font-semibold text-foreground text-sm">Antecipação de Recebíveis</h2>
        <p className="text-xs text-muted-foreground">Escolha se quer receber pagamentos de cartão de forma antecipada.</p>
        <div className="flex gap-2">
          <button onClick={() => handleSave("anticipation_enabled", false)} disabled={saving}
            className={`flex-1 p-3 rounded-xl border text-left transition-colors ${!anticipation ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}>
            <p className="text-xs font-semibold text-foreground">Sem antecipação</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Receba em {cardPeriod} dias úteis</p>
            <p className="text-[10px] text-primary font-medium mt-0.5">Sem taxa adicional</p>
          </button>
          <button onClick={() => handleSave("anticipation_enabled", true)} disabled={saving}
            className={`flex-1 p-3 rounded-xl border text-left transition-colors ${anticipation ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}>
            <p className="text-xs font-semibold text-foreground">Com antecipação</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Receba em {cardAnticipatedPeriod} dias úteis</p>
            <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium mt-0.5">Taxa: {anticipationFee}%</p>
          </button>
        </div>
      </div>
    </div>
  );
};

// === Transactions Tab ===
const TransactionsTab = ({ proId }: { proId: string }) => {
  const [period, setPeriod] = useState<Period>("month");
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Record<string, string>>({});

  const loadTransferSettings = () => {
    supabase.from("platform_settings").select("key, value")
      .in("key", ["transfer_period_pix_hours", "transfer_period_card_days", "transfer_period_card_anticipated_days"])
      .then(({ data }) => {
        if (data) {
          const map: Record<string, string> = {};
          for (const s of data) map[s.key] = typeof s.value === "string" ? s.value : JSON.stringify(s.value).replace(/^"|"$/g, "");
          setSettings(map);
        }
      });
  };

  useEffect(() => {
    loadTransferSettings();
    const handler = () => { if (!document.hidden) loadTransferSettings(); };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  const getDateFrom = () => {
    if (dateRange === "7d") { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString(); }
    if (dateRange === "30d") { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString(); }
    if (customFrom) return new Date(customFrom).toISOString();
    const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString();
  };

  const getDateTo = () => {
    if (dateRange === "custom" && customTo) { const d = new Date(customTo); d.setHours(23, 59, 59, 999); return d.toISOString(); }
    return new Date().toISOString();
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase.from("transactions").select("*").eq("professional_id", proId)
        .gte("created_at", getDateFrom()).lte("created_at", getDateTo()).order("created_at", { ascending: false });
      setTransactions(data || []);
      setLoading(false);
    };
    load();
  }, [proId, dateRange, customFrom, customTo]);

  const groupByPeriod = () => {
    const groups: Record<string, { total: number; net: number; count: number }> = {};
    for (const t of transactions) {
      const d = new Date(t.created_at);
      const key = period === "day" ? d.toLocaleDateString("pt-BR") : `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
      if (!groups[key]) groups[key] = { total: 0, net: 0, count: 0 };
      groups[key].total += Number(t.total_amount);
      groups[key].net += Number(t.professional_net);
      groups[key].count += 1;
    }
    return Object.entries(groups).map(([label, data]) => ({ label, ...data }));
  };

  const grouped = groupByPeriod();
  const totalNet = transactions.reduce((sum, t) => sum + Number(t.professional_net), 0);
  const totalVolume = transactions.reduce((sum, t) => sum + Number(t.total_amount), 0);
  const pixHours = settings.transfer_period_pix_hours || "48";
  const cardDays = settings.transfer_period_card_days || "33";

  return (
    <div>
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-card border rounded-xl p-4 shadow-card">
          <TrendingUp className="w-5 h-5 text-primary mb-2" />
          <p className="text-xl font-bold text-foreground">R$ {totalNet.toFixed(2).replace(".", ",")}</p>
          <p className="text-xs text-muted-foreground">Receita líquida</p>
        </div>
        <div className="bg-card border rounded-xl p-4 shadow-card">
          <DollarSign className="w-5 h-5 text-primary mb-2" />
          <p className="text-xl font-bold text-foreground">R$ {totalVolume.toFixed(2).replace(".", ",")}</p>
          <p className="text-xs text-muted-foreground">Volume total</p>
        </div>
      </div>

      {/* Date range filter */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Período:</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {([["7d", "7 dias"], ["30d", "30 dias"], ["custom", "Personalizado"]] as const).map(([val, label]) => (
            <button key={val} onClick={() => setDateRange(val)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${dateRange === val ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
              {label}
            </button>
          ))}
        </div>
        {dateRange === "custom" && (
          <div className="flex items-center gap-2 mt-2">
            <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="rounded-lg text-xs h-8" />
            <span className="text-xs text-muted-foreground">até</span>
            <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="rounded-lg text-xs h-8" />
          </div>
        )}
      </div>

      {/* Group by selector */}
      <div className="flex items-center gap-2 mb-4">
        <p className="text-sm font-medium text-foreground mr-2">Agrupar por:</p>
        {(["day", "month"] as const).map(p => (
          <button key={p} onClick={() => setPeriod(p)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${period === p ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
            {p === "day" ? "Dia" : "Mês"}
          </button>
        ))}
      </div>

      {/* Transactions list */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-12">
          <DollarSign className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nenhuma transação encontrada</p>
        </div>
      ) : (
        <div className="space-y-2">
          {grouped.map((g) => (
            <div key={g.label} className="bg-card border rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">{g.label}</p>
                <p className="text-xs text-muted-foreground">{g.count} transaç{g.count === 1 ? "ão" : "ões"}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-primary">R$ {g.net.toFixed(2).replace(".", ",")}</p>
                <p className="text-[10px] text-muted-foreground">de R$ {g.total.toFixed(2).replace(".", ",")}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Transfer periods info */}
      <div className="mt-6 bg-muted/50 border rounded-xl p-4">
        <p className="text-xs font-semibold text-foreground mb-2">Prazos de recebimento</p>
        <div className="space-y-1 text-[11px] text-muted-foreground">
          <p>• <strong>PIX:</strong> até {pixHours} horas após o pagamento</p>
          <p>• <strong>Cartão:</strong> até {cardDays} dias úteis após o pagamento</p>
        </div>
      </div>
    </div>
  );
};

// === Main Component ===


const ProfessionalFinancial = () => {
  const { user, profile } = useAuth();
  const [proId, setProId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("professionals").select("id").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data) setProId(data.id); });
  }, [user]);

  const userDoc = profile?.cpf || profile?.cnpj || null;

  if (!proId) return (
    <AppLayout>
      <div className="flex justify-center py-20"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div>
    </AppLayout>
  );

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5">
        <h1 className="text-xl font-bold text-foreground mb-5">Financeiro</h1>
        <Tabs defaultValue="fiscal">
          <TabsList className="mb-4 w-full grid grid-cols-3">
            <TabsTrigger value="fiscal"><FileText className="w-3.5 h-3.5 mr-1" />Cadastro Fiscal</TabsTrigger>
            <TabsTrigger value="transactions"><DollarSign className="w-3.5 h-3.5 mr-1" />Extrato</TabsTrigger>
            <TabsTrigger value="fees"><TrendingUp className="w-3.5 h-3.5 mr-1" />Taxas</TabsTrigger>
          </TabsList>
          <TabsContent value="fiscal"><FiscalTab proId={proId} userDoc={userDoc} /></TabsContent>
          <TabsContent value="transactions"><TransactionsTab proId={proId} /></TabsContent>
          <TabsContent value="fees"><FeePreferencesTab proId={proId} /></TabsContent>
        </Tabs>
      </main>
    </AppLayout>
  );
};

export default ProfessionalFinancial;
