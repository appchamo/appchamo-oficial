import AdminLayout from "@/components/AdminLayout";
import AdminAnalise from "./AdminAnalise";
import { Eye, MousePointerClick, Users, ArrowDown, ArrowUp, Smartphone, TrendingUp, Phone, CreditCard, Star, Search as SearchIcon, UserPlus } from "lucide-react";
import { useState, useEffect, useMemo, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";

type SortDir = "desc" | "asc";

// ─── Helpers compartilhados (novas abas) ───
const RCOLORS = ["#ea580c", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ef4444", "#14b8a6", "#6b7280"];
const R_PERIODS = [
  { k: "7", label: "7 dias", days: 7 },
  { k: "30", label: "30 dias", days: 30 },
  { k: "90", label: "90 dias", days: 90 },
  { k: "all", label: "Tudo", days: 0 },
] as const;
const RSpinner = () => <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div>;
const PeriodBar = ({ value, onChange }: { value: string; onChange: (k: string) => void }) => (
  <div className="flex flex-wrap items-center gap-1.5">
    <span className="text-xs text-muted-foreground mr-1">Período:</span>
    {R_PERIODS.map((p) => (
      <button key={p.k} onClick={() => onChange(p.k)}
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${value === p.k ? "bg-primary text-primary-foreground" : "bg-card border text-foreground hover:bg-muted"}`}>
        {p.label}
      </button>
    ))}
  </div>
);
const RKpi = ({ icon, label, value }: { icon: ReactNode; label: string; value: string }) => (
  <div className="bg-card border rounded-xl p-4">
    <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">{icon}{label}</div>
    <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
  </div>
);
const RCard = ({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) => (
  <div className="bg-card border rounded-xl p-4">
    <p className="text-sm font-semibold text-foreground">{title}</p>
    {sub && <p className="text-xs text-muted-foreground mb-2">{sub}</p>}
    {children}
  </div>
);
const seriesByDay = (dates: (string | null)[], cutoff: number) => {
  const m: Record<string, number> = {};
  for (const iso of dates) {
    if (!iso) continue;
    if (cutoff && new Date(iso).getTime() < cutoff) continue;
    const d = iso.slice(0, 10);
    m[d] = (m[d] || 0) + 1;
  }
  return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0])).slice(-90).map(([d, qtd]) => ({ dia: d.slice(5), qtd }));
};

// ─── Crescimento ───
const GrowthTab = () => {
  const [rows, setRows] = useState<{ user_type: string | null; created_at: string | null }[]>([]);
  const [period, setPeriod] = useState("30");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("profiles").select("user_type, created_at").limit(20000);
      setRows((data as any) || []); setLoading(false);
    })();
  }, []);
  const days = R_PERIODS.find((p) => p.k === period)?.days ?? 0;
  const cutoff = days ? Date.now() - days * 86400000 : 0;
  const inPeriod = useMemo(() => rows.filter((r) => r.created_at && (!cutoff || new Date(r.created_at).getTime() >= cutoff)), [rows, cutoff]);
  const perDay = useMemo(() => seriesByDay(inPeriod.map((r) => r.created_at), 0), [inPeriod]);
  const byType = useMemo(() => {
    const t: Record<string, number> = {};
    for (const r of inPeriod) {
      const k = r.user_type === "client" ? "Clientes" : r.user_type === "professional" ? "Profissionais" : (r.user_type === "company" || r.user_type === "enterprise") ? "Empresas" : "Outros";
      t[k] = (t[k] || 0) + 1;
    }
    return Object.entries(t).map(([name, value]) => ({ name, value })).filter((d) => d.value > 0);
  }, [inPeriod]);
  if (loading) return <RSpinner />;
  return (
    <div className="space-y-4">
      <PeriodBar value={period} onChange={setPeriod} />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <RKpi icon={<Users className="w-3.5 h-3.5" />} label="Base total" value={String(rows.length)} />
        <RKpi icon={<TrendingUp className="w-3.5 h-3.5" />} label="Novos no período" value={String(inPeriod.length)} />
        <RKpi icon={<TrendingUp className="w-3.5 h-3.5" />} label="Média/dia" value={String(perDay.length ? Math.round(inPeriod.length / perDay.length) : 0)} />
      </div>
      <RCard title="Novos cadastros por dia">
        {perDay.length ? (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={perDay}>
              <defs><linearGradient id="rg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={RCOLORS[0]} stopOpacity={0.6} /><stop offset="95%" stopColor={RCOLORS[0]} stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="dia" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} />
              <Tooltip /><Area type="monotone" dataKey="qtd" name="Cadastros" stroke={RCOLORS[0]} fill="url(#rg)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : <p className="text-sm text-muted-foreground py-10 text-center">Sem dados no período.</p>}
      </RCard>
      <RCard title="Novos por tipo de conta (no período)">
        {byType.length ? (
          <ResponsiveContainer width="100%" height={240}>
            <PieChart><Pie data={byType} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>{byType.map((_, i) => <Cell key={i} fill={RCOLORS[i % RCOLORS.length]} />)}</Pie><Tooltip /><Legend /></PieChart>
          </ResponsiveContainer>
        ) : <p className="text-sm text-muted-foreground py-10 text-center">Sem dados no período.</p>}
      </RCard>
    </div>
  );
};

// ─── Serviços / Chamadas ───
const ServicesTab = () => {
  const [rows, setRows] = useState<{ status: string | null; created_at: string | null }[]>([]);
  const [period, setPeriod] = useState("30");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("service_requests").select("status, created_at").limit(20000);
      setRows((data as any) || []); setLoading(false);
    })();
  }, []);
  const days = R_PERIODS.find((p) => p.k === period)?.days ?? 0;
  const cutoff = days ? Date.now() - days * 86400000 : 0;
  const inPeriod = useMemo(() => rows.filter((r) => r.created_at && (!cutoff || new Date(r.created_at).getTime() >= cutoff)), [rows, cutoff]);
  const STATUS_LABEL: Record<string, string> = { pending: "Pendentes", accepted: "Aceitas", completed: "Concluídas", cancelled: "Canceladas" };
  const byStatus = useMemo(() => {
    const t: Record<string, number> = {};
    for (const r of inPeriod) { const k = STATUS_LABEL[r.status || ""] || (r.status || "Outros"); t[k] = (t[k] || 0) + 1; }
    return Object.entries(t).map(([name, value]) => ({ name, value }));
  }, [inPeriod]);
  const perDay = useMemo(() => seriesByDay(inPeriod.map((r) => r.created_at), 0), [inPeriod]);
  const total = inPeriod.length;
  const concluidas = inPeriod.filter((r) => r.status === "completed").length;
  const canceladas = inPeriod.filter((r) => r.status === "cancelled").length;
  const taxa = total ? Math.round((concluidas / total) * 100) : 0;
  if (loading) return <RSpinner />;
  return (
    <div className="space-y-4">
      <PeriodBar value={period} onChange={setPeriod} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <RKpi icon={<Phone className="w-3.5 h-3.5" />} label="Chamadas" value={String(total)} />
        <RKpi icon={<Phone className="w-3.5 h-3.5" />} label="Concluídas" value={String(concluidas)} />
        <RKpi icon={<Phone className="w-3.5 h-3.5" />} label="Canceladas" value={String(canceladas)} />
        <RKpi icon={<TrendingUp className="w-3.5 h-3.5" />} label="Taxa de conclusão" value={`${taxa}%`} />
      </div>
      <RCard title="Chamadas por status (no período)">
        {byStatus.length ? (
          <ResponsiveContainer width="100%" height={240}>
            <PieChart><Pie data={byStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>{byStatus.map((_, i) => <Cell key={i} fill={RCOLORS[i % RCOLORS.length]} />)}</Pie><Tooltip /><Legend /></PieChart>
          </ResponsiveContainer>
        ) : <p className="text-sm text-muted-foreground py-10 text-center">Sem chamadas no período.</p>}
      </RCard>
      <RCard title="Chamadas por dia">
        {perDay.length ? (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={perDay}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="dia" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="qtd" name="Chamadas" fill={RCOLORS[3]} radius={[4, 4, 0, 0]} /></BarChart>
          </ResponsiveContainer>
        ) : <p className="text-sm text-muted-foreground py-10 text-center">Sem chamadas no período.</p>}
      </RCard>
    </div>
  );
};

// ─── Assinaturas ───
const SubscriptionsTab = () => {
  const [rows, setRows] = useState<{ plan_id: string | null; status: string | null; started_at: string | null; created_at: string | null; courtesy: boolean | null }[]>([]);
  const [period, setPeriod] = useState("90");
  const [loading, setLoading] = useState(true);
  const PAID = ["vip", "pro", "business"];
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("subscriptions").select("plan_id, status, started_at, created_at, courtesy").limit(20000);
      setRows((data as any) || []); setLoading(false);
    })();
  }, []);
  const days = R_PERIODS.find((p) => p.k === period)?.days ?? 0;
  const cutoff = days ? Date.now() - days * 86400000 : 0;
  const ativasPagas = rows.filter((r) => String(r.status || "").toLowerCase() === "active" && PAID.includes(r.plan_id || ""));
  const pagantes = ativasPagas.filter((r) => r.courtesy !== true);   // pagantes de verdade
  const cortesias = ativasPagas.filter((r) => r.courtesy === true);  // cortesia (grátis)
  const byPlan = useMemo(() => {
    const t: Record<string, number> = {};
    for (const r of pagantes) { const k = (r.plan_id || "").toUpperCase(); t[k] = (t[k] || 0) + 1; }
    return Object.entries(t).map(([name, value]) => ({ name, value }));
  }, [pagantes]);
  const novasPagas = useMemo(() => {
    const dates = pagantes.map((r) => r.started_at || r.created_at).filter((d) => d && (!cutoff || new Date(d as string).getTime() >= cutoff)) as string[];
    return seriesByDay(dates, 0);
  }, [pagantes, cutoff]);
  if (loading) return <RSpinner />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <RKpi icon={<CreditCard className="w-3.5 h-3.5" />} label="Pagantes reais" value={String(pagantes.length)} />
        <RKpi icon={<CreditCard className="w-3.5 h-3.5" />} label="Cortesias (grátis)" value={String(cortesias.length)} />
        <RKpi icon={<CreditCard className="w-3.5 h-3.5" />} label="Total planos pagos ativos" value={String(ativasPagas.length)} />
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        <strong>Pagantes reais</strong> = quem paga de fato. <strong>Cortesias</strong> = plano pago liberado grátis pelo admin (não é receita). Bate com Financeiro → Assinantes.
      </div>
      <div className="grid grid-cols-3 gap-3">
        <RKpi icon={<CreditCard className="w-3.5 h-3.5" />} label="VIP (pagante)" value={String(pagantes.filter((r) => r.plan_id === "vip").length)} />
        <RKpi icon={<CreditCard className="w-3.5 h-3.5" />} label="Pro (pagante)" value={String(pagantes.filter((r) => r.plan_id === "pro").length)} />
        <RKpi icon={<CreditCard className="w-3.5 h-3.5" />} label="Business (pagante)" value={String(pagantes.filter((r) => r.plan_id === "business").length)} />
      </div>
      <RCard title="Pagantes reais por plano">
        {byPlan.length ? (
          <ResponsiveContainer width="100%" height={240}>
            <PieChart><Pie data={byPlan} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} label>{byPlan.map((_, i) => <Cell key={i} fill={RCOLORS[i % RCOLORS.length]} />)}</Pie><Tooltip /><Legend /></PieChart>
          </ResponsiveContainer>
        ) : <p className="text-sm text-muted-foreground py-10 text-center">Nenhum pagante real ainda.</p>}
      </RCard>
      <RCard title="Novos pagantes reais por dia">
        <PeriodBar value={period} onChange={setPeriod} />
        <div className="h-2" />
        {novasPagas.length ? (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={novasPagas}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="dia" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="qtd" name="Novos pagantes" fill={RCOLORS[2]} radius={[4, 4, 0, 0]} /></BarChart>
          </ResponsiveContainer>
        ) : <p className="text-sm text-muted-foreground py-10 text-center">Sem novos pagantes no período.</p>}
      </RCard>
    </div>
  );
};

// ─── Avaliações ───
const ReviewsTab = () => {
  const [rows, setRows] = useState<{ rating: number | null; created_at: string | null }[]>([]);
  const [period, setPeriod] = useState("90");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("reviews").select("rating, created_at").limit(20000);
      setRows((data as any) || []); setLoading(false);
    })();
  }, []);
  const days = R_PERIODS.find((p) => p.k === period)?.days ?? 0;
  const cutoff = days ? Date.now() - days * 86400000 : 0;
  const inPeriod = useMemo(() => rows.filter((r) => r.created_at && (!cutoff || new Date(r.created_at).getTime() >= cutoff)), [rows, cutoff]);
  const media = inPeriod.length ? (inPeriod.reduce((a, r) => a + (r.rating || 0), 0) / inPeriod.length) : 0;
  const dist = useMemo(() => {
    const t: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of inPeriod) { const n = Math.round(r.rating || 0); if (n >= 1 && n <= 5) t[n]++; }
    return [5, 4, 3, 2, 1].map((n) => ({ name: `${n} ★`, qtd: t[n] }));
  }, [inPeriod]);
  const perDay = useMemo(() => seriesByDay(inPeriod.map((r) => r.created_at), 0), [inPeriod]);
  if (loading) return <RSpinner />;
  return (
    <div className="space-y-4">
      <PeriodBar value={period} onChange={setPeriod} />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <RKpi icon={<Star className="w-3.5 h-3.5" />} label="Avaliações (total)" value={String(rows.length)} />
        <RKpi icon={<Star className="w-3.5 h-3.5" />} label="No período" value={String(inPeriod.length)} />
        <RKpi icon={<Star className="w-3.5 h-3.5" />} label="Nota média" value={media ? media.toFixed(1) : "—"} />
      </div>
      <RCard title="Distribuição de notas (no período)">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={dist} layout="vertical" margin={{ left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="name" width={40} tick={{ fontSize: 12 }} />
            <Tooltip /><Bar dataKey="qtd" name="Avaliações" fill={RCOLORS[1]} radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </RCard>
      <RCard title="Avaliações por dia">
        {perDay.length ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={perDay}><defs><linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={RCOLORS[1]} stopOpacity={0.6} /><stop offset="95%" stopColor={RCOLORS[1]} stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="dia" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} /><Tooltip /><Area type="monotone" dataKey="qtd" name="Avaliações" stroke={RCOLORS[1]} fill="url(#rev)" /></AreaChart>
          </ResponsiveContainer>
        ) : <p className="text-sm text-muted-foreground py-10 text-center">Sem avaliações no período.</p>}
      </RCard>
    </div>
  );
};

// ─── Clientes ───
const ClientsTab = () => {
  const [profs, setProfs] = useState<{ user_id: string; full_name: string | null; created_at: string | null; last_seen_at: string | null; address_city: string | null }[]>([]);
  const [reqs, setReqs] = useState<{ client_id: string | null }[]>([]);
  const [reviewers, setReviewers] = useState<Set<string>>(new Set());
  const [period, setPeriod] = useState("30");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const [p, r, rev] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, created_at, last_seen_at, address_city").eq("user_type", "client").limit(20000),
        supabase.from("service_requests").select("client_id").limit(50000),
        supabase.from("reviews").select("client_id").limit(50000),
      ]);
      setProfs((p.data as any) || []);
      setReqs((r.data as any) || []);
      setReviewers(new Set(((rev.data as any) || []).map((x: any) => x.client_id).filter(Boolean)));
      setLoading(false);
    })();
  }, []);
  const days = R_PERIODS.find((p) => p.k === period)?.days ?? 0;
  const cutoff = days ? Date.now() - days * 86400000 : 0;
  const novos = useMemo(() => profs.filter((r) => r.created_at && (!cutoff || new Date(r.created_at).getTime() >= cutoff)), [profs, cutoff]);
  const ativos = useMemo(() => profs.filter((r) => r.last_seen_at && (!cutoff || new Date(r.last_seen_at).getTime() >= cutoff)), [profs, cutoff]);
  const reqCount = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of reqs) { if (r.client_id) m[r.client_id] = (m[r.client_id] || 0) + 1; }
    return m;
  }, [reqs]);
  const jaChamaram = useMemo(() => new Set(reqs.map((r) => r.client_id).filter(Boolean)).size, [reqs]);
  const perDay = useMemo(() => seriesByDay(novos.map((r) => r.created_at), 0), [novos]);
  const byCity = useMemo(() => {
    const t: Record<string, number> = {};
    for (const r of profs) { const c = (r.address_city || "").trim() || "Sem cidade"; t[c] = (t[c] || 0) + 1; }
    return Object.entries(t).map(([name, qtd]) => ({ name, qtd })).sort((a, b) => b.qtd - a.qtd).slice(0, 10);
  }, [profs]);
  const topClientes = useMemo(() => {
    const nameMap = new Map(profs.map((p) => [p.user_id, p.full_name]));
    return Object.entries(reqCount).map(([id, qtd]) => ({ name: nameMap.get(id) || "—", qtd, reviewed: reviewers.has(id) }))
      .sort((a, b) => b.qtd - a.qtd).slice(0, 15);
  }, [reqCount, profs, reviewers]);
  if (loading) return <RSpinner />;
  return (
    <div className="space-y-4">
      <PeriodBar value={period} onChange={setPeriod} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <RKpi icon={<Users className="w-3.5 h-3.5" />} label="Clientes (total)" value={String(profs.length)} />
        <RKpi icon={<Users className="w-3.5 h-3.5" />} label="Novos no período" value={String(novos.length)} />
        <RKpi icon={<Users className="w-3.5 h-3.5" />} label="Ativos no período" value={String(ativos.length)} />
        <RKpi icon={<Phone className="w-3.5 h-3.5" />} label="Já fizeram chamada" value={String(jaChamaram)} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <RKpi icon={<Phone className="w-3.5 h-3.5" />} label="% que já chamou" value={profs.length ? `${Math.round((jaChamaram / profs.length) * 100)}%` : "—"} />
        <RKpi icon={<Star className="w-3.5 h-3.5" />} label="Clientes que avaliaram" value={String(reviewers.size)} />
        <RKpi icon={<Users className="w-3.5 h-3.5" />} label="Cidades" value={String(byCity.filter((c) => c.name !== "Sem cidade").length)} />
      </div>
      <RCard title="Novos clientes por dia">
        {perDay.length ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={perDay}><defs><linearGradient id="cli" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={RCOLORS[3]} stopOpacity={0.6} /><stop offset="95%" stopColor={RCOLORS[3]} stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="dia" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} /><Tooltip /><Area type="monotone" dataKey="qtd" name="Novos clientes" stroke={RCOLORS[3]} fill="url(#cli)" /></AreaChart>
          </ResponsiveContainer>
        ) : <p className="text-sm text-muted-foreground py-10 text-center">Sem novos clientes no período.</p>}
      </RCard>
      <RCard title="Clientes por cidade (top 10)">
        {byCity.length ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byCity} layout="vertical" margin={{ left: 20 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="qtd" name="Clientes" fill={RCOLORS[3]} radius={[0, 6, 6, 0]} /></BarChart>
          </ResponsiveContainer>
        ) : <p className="text-sm text-muted-foreground py-10 text-center">Sem dados de cidade.</p>}
      </RCard>
      <RCard title="Clientes que mais chamam (top 15)">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50"><th className="text-left p-2 font-medium text-muted-foreground">#</th><th className="text-left p-2 font-medium text-muted-foreground">Cliente</th><th className="text-left p-2 font-medium text-muted-foreground">Chamadas</th><th className="text-left p-2 font-medium text-muted-foreground">Avaliou?</th></tr></thead>
            <tbody>
              {topClientes.map((c, i) => (
                <tr key={i} className="border-b last:border-0"><td className="p-2 text-muted-foreground">{i + 1}</td><td className="p-2 text-foreground">{c.name}</td><td className="p-2 font-bold text-primary">{c.qtd}</td><td className="p-2">{c.reviewed ? "⭐ Sim" : "—"}</td></tr>
              ))}
              {!topClientes.length && <tr><td colSpan={4} className="text-center py-6 text-muted-foreground">Sem chamadas ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      </RCard>
    </div>
  );
};

// ─── Buscas (termos de pesquisa) ───
const SearchTermsTab = () => {
  const [rows, setRows] = useState<{ term: string | null; term_norm: string | null; results_count: number | null; created_at: string | null }[]>([]);
  const [period, setPeriod] = useState("30");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("search_events").select("term, term_norm, results_count, created_at").order("created_at", { ascending: false }).limit(50000);
      setRows((data as any) || []); setLoading(false);
    })();
  }, []);
  const days = R_PERIODS.find((p) => p.k === period)?.days ?? 0;
  const cutoff = days ? Date.now() - days * 86400000 : 0;
  const inPeriod = useMemo(() => rows.filter((r) => r.created_at && (!cutoff || new Date(r.created_at).getTime() >= cutoff)), [rows, cutoff]);
  const agg = useMemo(() => {
    const m: Record<string, { term: string; count: number; zero: number; totalResults: number }> = {};
    for (const r of inPeriod) {
      const k = (r.term_norm || r.term || "").trim();
      if (!k) continue;
      if (!m[k]) m[k] = { term: r.term || k, count: 0, zero: 0, totalResults: 0 };
      m[k].count++;
      m[k].totalResults += Number(r.results_count ?? 0);
      if (Number(r.results_count ?? 0) === 0) m[k].zero++;
    }
    return Object.values(m).sort((a, b) => b.count - a.count);
  }, [inPeriod]);
  const semResultado = useMemo(() => agg.filter((t) => t.totalResults === 0).sort((a, b) => b.count - a.count).slice(0, 20), [agg]);
  const perDay = useMemo(() => seriesByDay(inPeriod.map((r) => r.created_at), 0), [inPeriod]);
  if (loading) return <RSpinner />;
  return (
    <div className="space-y-4">
      <PeriodBar value={period} onChange={setPeriod} />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <RKpi icon={<SearchIcon className="w-3.5 h-3.5" />} label="Buscas (no período)" value={String(inPeriod.length)} />
        <RKpi icon={<SearchIcon className="w-3.5 h-3.5" />} label="Termos únicos" value={String(agg.length)} />
        <RKpi icon={<SearchIcon className="w-3.5 h-3.5" />} label="Termos sem resultado" value={String(agg.filter((t) => t.totalResults === 0).length)} />
      </div>
      {!rows.length && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
          Ainda sem buscas registradas. O log começa a coletar assim que a nova versão do app estiver publicada e as pessoas usarem a busca.
        </div>
      )}
      <RCard title="Buscas por dia">
        {perDay.length ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={perDay}><defs><linearGradient id="srch" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={RCOLORS[4]} stopOpacity={0.6} /><stop offset="95%" stopColor={RCOLORS[4]} stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="dia" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} /><Tooltip /><Area type="monotone" dataKey="qtd" name="Buscas" stroke={RCOLORS[4]} fill="url(#srch)" /></AreaChart>
          </ResponsiveContainer>
        ) : <p className="text-sm text-muted-foreground py-10 text-center">Sem buscas no período.</p>}
      </RCard>
      <RCard title="Termos mais buscados (top 30)" sub="Quantas vezes cada termo foi pesquisado.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50"><th className="text-left p-2 font-medium text-muted-foreground">#</th><th className="text-left p-2 font-medium text-muted-foreground">Termo</th><th className="text-left p-2 font-medium text-muted-foreground">Buscas</th><th className="text-left p-2 font-medium text-muted-foreground">Média result.</th></tr></thead>
            <tbody>
              {agg.slice(0, 30).map((t, i) => (
                <tr key={i} className="border-b last:border-0"><td className="p-2 text-muted-foreground">{i + 1}</td><td className="p-2 text-foreground">{t.term}</td><td className="p-2 font-bold text-primary">{t.count}</td><td className="p-2 text-muted-foreground">{(t.totalResults / t.count).toFixed(1)}</td></tr>
              ))}
              {!agg.length && <tr><td colSpan={4} className="text-center py-6 text-muted-foreground">Sem dados ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      </RCard>
      <RCard title="🔴 Buscas sem nenhum resultado (oportunidades)" sub="Gente procurou e não achou ninguém. Cada termo aqui é uma categoria/profissional que falta na plataforma.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50"><th className="text-left p-2 font-medium text-muted-foreground">#</th><th className="text-left p-2 font-medium text-muted-foreground">Termo</th><th className="text-left p-2 font-medium text-muted-foreground">Buscas sem achar</th></tr></thead>
            <tbody>
              {semResultado.map((t, i) => (
                <tr key={i} className="border-b last:border-0"><td className="p-2 text-muted-foreground">{i + 1}</td><td className="p-2 text-foreground">{t.term}</td><td className="p-2 font-bold text-red-600">{t.count}</td></tr>
              ))}
              {!semResultado.length && <tr><td colSpan={3} className="text-center py-6 text-muted-foreground">Nenhuma busca sem resultado. 🎉</td></tr>}
            </tbody>
          </table>
        </div>
      </RCard>
    </div>
  );
};

// ─── Views Tab ───
const ViewsTab = () => {
  const [categoryViews, setCategoryViews] = useState<{ name: string; count: number }[]>([]);
  const [proViews, setProViews] = useState<{ name: string; count: number }[]>([]);
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      // Category stats: count professionals per category
      const { data: cats } = await supabase.from("categories").select("id, name").eq("active", true);
      const { data: pros } = await supabase.from("professionals").select("id, category_id, user_id").eq("active", true);
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name");

      if (cats && pros) {
        const catMap = new Map(cats.map((c) => [c.id, c.name]));
        const catCounts: Record<string, number> = {};
        for (const p of pros) {
          const name = catMap.get(p.category_id || "") || "Sem categoria";
          catCounts[name] = (catCounts[name] || 0) + 1;
        }
        setCategoryViews(Object.entries(catCounts).map(([name, count]) => ({ name, count })));
      }

      if (pros && profiles) {
        const profMap = new Map(profiles?.map(p => [p.user_id, p.full_name]) || []);
        // Count service requests per professional
        const { data: reqs } = await supabase.from("service_requests").select("professional_id");
        const proCounts: Record<string, number> = {};
        const proNameMap: Record<string, string> = {};
        for (const p of pros) {
          proNameMap[p.id] = profMap.get(p.user_id) || "—";
          proCounts[p.id] = 0;
        }
        for (const r of (reqs || [])) {
          if (proCounts[r.professional_id] !== undefined) proCounts[r.professional_id]++;
        }
        setProViews(Object.entries(proCounts).map(([id, count]) => ({ name: proNameMap[id] || id, count })));
      }
      setLoading(false);
    };
    fetch();
  }, []);

  const sort = (arr: { name: string; count: number }[]) =>
    [...arr].sort((a, b) => sortDir === "desc" ? b.count - a.count : a.count - b.count);

  const SortBtn = () => (
    <button onClick={() => setSortDir(d => d === "desc" ? "asc" : "desc")} className="flex items-center gap-1 text-[11px] text-primary font-medium">
      {sortDir === "desc" ? <><ArrowDown className="w-3 h-3" /> Maior → Menor</> : <><ArrowUp className="w-3 h-3" /> Menor → Maior</>}
    </button>
  );

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Contagem de <strong>profissionais ativos</strong> por categoria (não são “visualizações” de ecrã).
      </p>
      <div className="flex items-center justify-between"><h3 className="font-semibold text-foreground text-sm">Profissionais ativos por categoria</h3><SortBtn /></div>
      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="divide-y">
          {sort(categoryViews).map((c, i) => (
            <div key={i} className="flex items-center justify-between p-3">
              <span className="text-sm text-foreground">{c.name}</span>
              <span className="text-sm font-bold text-primary">{c.count}</span>
            </div>
          ))}
          {categoryViews.length === 0 && <p className="text-center py-6 text-muted-foreground text-sm">Sem dados</p>}
        </div>
      </div>

      <div className="flex items-center justify-between"><h3 className="font-semibold text-foreground text-sm">Chamadas (pedidos) por profissional ativo</h3><SortBtn /></div>
      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="divide-y">
          {sort(proViews).slice(0, 20).map((p, i) => (
            <div key={i} className="flex items-center justify-between p-3">
              <span className="text-sm text-foreground">{p.name}</span>
              <span className="text-sm font-bold text-primary">{p.count}</span>
            </div>
          ))}
          {proViews.length === 0 && <p className="text-center py-6 text-muted-foreground text-sm">Sem dados</p>}
        </div>
      </div>
    </div>
  );
};

// ─── Clicks Tab ───
const ClicksTab = () => {
  const [sponsorClicks, setSponsorClicks] = useState<{ name: string; count: number }[]>([]);
  const [serviceRequests, setServiceRequests] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      // Sponsor clicks from sponsor_clicks table (accurate count)
      const { data: sponsors } = await supabase.from("sponsors").select("id, name").eq("active", true);
      if (sponsors) {
        const clickCounts: { name: string; count: number }[] = [];
        for (const s of sponsors) {
          const { count } = await supabase.from("sponsor_clicks").select("*", { count: "exact", head: true }).eq("sponsor_id", s.id);
          clickCounts.push({ name: s.name, count: count || 0 });
        }
        setSponsorClicks(clickCounts.sort((a, b) => b.count - a.count));
      }

      // Service request count = "chamadas" clicks
      const { count } = await supabase.from("service_requests").select("*", { count: "exact", head: true });
      setServiceRequests(count || 0);
      setLoading(false);
    };
    fetch();
  }, []);

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border rounded-xl p-4">
          <MousePointerClick className="w-5 h-5 text-primary mb-1" />
          <p className="text-xl font-bold text-foreground">{serviceRequests}</p>
          <p className="text-[11px] text-muted-foreground">Total de Chamadas</p>
        </div>
        <div className="bg-card border rounded-xl p-4">
          <Eye className="w-5 h-5 text-muted-foreground mb-1" />
          <p className="text-xl font-bold text-foreground">{sponsorClicks.reduce((a, b) => a + b.count, 0)}</p>
          <p className="text-[11px] text-muted-foreground">Cliques em Patrocinadores</p>
        </div>
      </div>

      <h3 className="font-semibold text-foreground text-sm">Cliques por Patrocinador</h3>
      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="divide-y">
          {sponsorClicks.map((s, i) => (
            <div key={i} className="flex items-center justify-between p-3">
              <span className="text-sm text-foreground">{s.name}</span>
              <span className="text-sm font-bold text-primary">{s.count}</span>
            </div>
          ))}
          {sponsorClicks.length === 0 && <p className="text-center py-6 text-muted-foreground text-sm">Sem dados</p>}
        </div>
      </div>
    </div>
  );
};

// ─── Professionals Tab ───
type ProRow = {
  user_id: string;
  name: string;
  services: number;
  rating: number;
  reviews: number;
  profile_views: number;
  profile_clicks: number;
  call_clicks: number;
  name_searches: number;
  requests: number;
};

type ProSortKey =
  | "name_searches"
  | "profile_clicks"
  | "requests"
  | "services"
  | "rating"
  | "reviews";

const ProfessionalsTab = () => {
  const [data, setData] = useState<ProRow[]>([]);
  const [sortBy, setSortBy] = useState<ProSortKey>("profile_clicks");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data: pros } = await supabase
        .from("professionals")
        .select("user_id, total_services, rating, total_reviews")
        .eq("active", true);
      if (!pros) { setLoading(false); return; }
      const userIds = pros.map((p) => p.user_id);

      const [profilesRes, countersRes, reqsRes] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name").in("user_id", userIds),
        (supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> })
          .from("professional_analytics_counters")
          .select("user_id, profile_views, profile_clicks, call_clicks, name_searches")
          .in("user_id", userIds),
        supabase.from("service_requests").select("professional_id"),
      ]);

      const nameMap = new Map((profilesRes.data || []).map((p) => [p.user_id, p.full_name]));

      type CounterRow = {
        user_id: string;
        profile_views: number | null;
        profile_clicks: number | null;
        call_clicks: number | null;
        name_searches: number | null;
      };
      const countersMap = new Map<string, CounterRow>();
      for (const c of (countersRes.data as CounterRow[] | null) || []) {
        countersMap.set(c.user_id, c);
      }

      // service_requests é contado pelo professional_id (PK na tabela professionals).
      // Precisamos mapear user_id ↔ professional_id.
      const { data: proIdRows } = await supabase
        .from("professionals")
        .select("id, user_id")
        .in("user_id", userIds);
      const proIdByUserId = new Map<string, string>();
      for (const row of proIdRows || []) proIdByUserId.set(row.user_id, row.id);

      const reqCountsByProId: Record<string, number> = {};
      for (const r of (reqsRes.data || []) as { professional_id: string }[]) {
        reqCountsByProId[r.professional_id] = (reqCountsByProId[r.professional_id] || 0) + 1;
      }

      setData(
        pros.map((p) => {
          const c = countersMap.get(p.user_id);
          const proId = proIdByUserId.get(p.user_id);
          return {
            user_id: p.user_id,
            name: nameMap.get(p.user_id) || "—",
            services: Number(p.total_services ?? 0),
            rating: Number(p.rating ?? 0),
            reviews: Number(p.total_reviews ?? 0),
            profile_views: Number(c?.profile_views ?? 0),
            profile_clicks: Number(c?.profile_clicks ?? 0),
            call_clicks: Number(c?.call_clicks ?? 0),
            name_searches: Number(c?.name_searches ?? 0),
            requests: Number((proId && reqCountsByProId[proId]) || 0),
          };
        }),
      );
      setLoading(false);
    };
    fetch();
  }, []);

  const sorted = [...data].sort((a, b) => Number(b[sortBy] ?? 0) - Number(a[sortBy] ?? 0));

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const sortOptions: { key: ProSortKey; label: string }[] = [
    { key: "name_searches", label: "Mais pesquisados" },
    { key: "profile_clicks", label: "Mais visitas" },
    { key: "requests", label: "Mais chamadas" },
    { key: "services", label: "Mais atendimentos" },
    { key: "rating", label: "Melhores avaliações" },
    { key: "reviews", label: "Mais reviews" },
  ];

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        <strong>Pesquisados</strong> = buscas pelo nome do pro.{" "}
        <strong>Visitas</strong> = quando alguém abre a página pública do perfil (<code className="text-[10px]">profile_clicks</code>; impressões de card no carrossel ficam em <code className="text-[10px]">profile_views</code> e não aparecem aqui).{" "}
        <strong>Chamadas</strong> = pedidos de serviço criados (<code className="text-[10px]">service_requests</code>).
      </p>

      <div className="flex flex-wrap gap-2">
        {sortOptions.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setSortBy(opt.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              sortBy === opt.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium text-muted-foreground">#</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Profissional</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Pesquisas</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Visitas</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Chamadas</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Atend.</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Avaliação</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Reviews</th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 30).map((p, i) => (
                <tr key={p.user_id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="p-3 text-xs text-muted-foreground">{i + 1}</td>
                  <td className="p-3 font-medium text-foreground text-xs md:text-sm">{p.name}</td>
                  <td className="p-3 text-xs tabular-nums">{p.name_searches}</td>
                  <td className="p-3 text-xs tabular-nums">{p.profile_clicks}</td>
                  <td className="p-3 text-xs tabular-nums">{p.requests}</td>
                  <td className="p-3 text-xs tabular-nums">{p.services}</td>
                  <td className="p-3 text-xs">⭐ {p.rating.toFixed(1)}</td>
                  <td className="p-3 text-xs tabular-nums">{p.reviews}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.length === 0 && <p className="text-center py-6 text-muted-foreground text-sm">Sem dados</p>}
      </div>
    </div>
  );
};

const FETCH_PAGE = 1000;

type ProfileLite = { user_id: string; full_name: string; email: string; user_type: string };
type SubLite = { user_id: string; plan_id: string; status: string; updated_at: string };
type UserDeviceRow = {
  user_id: string;
  device_id: string;
  device_name: string | null;
  last_active: string | null;
  push_token: string | null;
  platform: string | null;
};

type PrimaryDeviceBucket = "none" | "iphone" | "android" | "desktop" | "outro";

type AccountKindFilter = "all" | "client" | "professional" | "company" | "sponsor" | "pending";

type DeviceFilter = "all" | "none" | "iphone" | "android" | "desktop" | "outro";

async function paginateProfiles(): Promise<ProfileLite[]> {
  const out: ProfileLite[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("profiles")
      .select("user_id, full_name, email, user_type")
      .order("full_name", { ascending: true })
      .range(from, from + FETCH_PAGE - 1);
    if (error) {
      console.error("[AdminReports] profiles", error);
      break;
    }
    if (!data?.length) break;
    out.push(...(data as ProfileLite[]));
    if (data.length < FETCH_PAGE) break;
    from += FETCH_PAGE;
  }
  return out;
}

async function paginateSubscriptions(): Promise<SubLite[]> {
  const out: SubLite[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("user_id, plan_id, status, updated_at")
      .range(from, from + FETCH_PAGE - 1);
    if (error) {
      console.error("[AdminReports] subscriptions", error);
      break;
    }
    if (!data?.length) break;
    out.push(...(data as SubLite[]));
    if (data.length < FETCH_PAGE) break;
    from += FETCH_PAGE;
  }
  return out;
}

async function paginateUserDevices(): Promise<UserDeviceRow[]> {
  const out: UserDeviceRow[] = [];
  let from = 0;
  const client = supabase as unknown as {
    from: (t: string) => ReturnType<typeof supabase.from>;
  };
  for (;;) {
    const { data, error } = await client
      .from("user_devices")
      .select("user_id, device_id, device_name, last_active, push_token, platform")
      .range(from, from + FETCH_PAGE - 1);
    if (error) {
      console.error("[AdminReports] user_devices", error);
      break;
    }
    if (!data?.length) break;
    out.push(...(data as UserDeviceRow[]));
    if (data.length < FETCH_PAGE) break;
    from += FETCH_PAGE;
  }
  return out;
}

function bucketFromDeviceName(name: string | null): "iphone" | "android" | "desktop" | "outro" {
  const n = (name || "").toLowerCase().trim();
  if (!n) return "outro";
  if (
    n.includes("iphone") ||
    n.includes("ios") ||
    n.includes("ipad") ||
    n.includes("ipod") ||
    n.includes("apple") ||
    /\bios\b/.test(n)
  ) {
    return "iphone";
  }
  if (n.includes("android")) return "android";
  if (
    n.includes("samsung") ||
    n.includes("galaxy") ||
    /\bsm-/.test(n) ||
    n.includes("pixel") ||
    n.includes("xiaomi") ||
    n.includes("redmi") ||
    n.includes("poco") ||
    n.includes("huawei") ||
    n.includes("honor") ||
    n.includes("oppo") ||
    n.includes("realme") ||
    n.includes("oneplus") ||
    n.includes("motorola") ||
    n.includes("moto ") ||
    n.includes("nokia") ||
    n.includes("lg-") ||
    n.includes("asus") ||
    n.includes("zenfone") ||
    n.includes("sony") ||
    n.includes("xperia") ||
    n.includes("vivo") ||
    n.includes("nothing")
  ) {
    return "android";
  }
  if (n.includes("web") || n.includes("desktop") || n.includes("pwa") || n.includes("chrome")) {
    return "desktop";
  }
  return "outro";
}

/** Tokens APNs clássicos (64 hex) — comuns em registos antigos sem device_name útil. */
function inferIosFromPushToken(token: string | null | undefined): boolean {
  const t = (token || "").trim();
  return t.length === 64 && /^[a-f0-9]+$/i.test(t);
}

/** Tokens FCM: contêm ':' e são longos (~163 chars). Indicam Android. */
function inferAndroidFromPushToken(token: string | null | undefined): boolean {
  const t = (token || "").trim();
  if (!t) return false;
  if (t.includes(":")) return true;
  // token longo, claramente não é APNs (64 hex): provavelmente FCM → Android.
  if (t.length > 80 && !/^[a-f0-9]+$/i.test(t)) return true;
  return false;
}

function deviceBucketForRow(d: UserDeviceRow): "iphone" | "android" | "desktop" | "outro" {
  // 1) coluna `platform` explícita escrita pelo cliente nativo.
  const plat = (d.platform || "").toLowerCase();
  if (plat === "ios") return "iphone";
  if (plat === "android") return "android";
  if (plat === "web") return "desktop";

  // 2) fallback por device_name.
  const fromName = bucketFromDeviceName(d.device_name);
  if (fromName !== "outro") return fromName;

  // 3) fallback por formato do push token.
  if (inferIosFromPushToken(d.push_token)) return "iphone";
  if (inferAndroidFromPushToken(d.push_token)) return "android";
  return "outro";
}

function primaryDeviceInfo(devices: UserDeviceRow[]): { label: string; bucket: PrimaryDeviceBucket } {
  if (!devices.length) return { label: "—", bucket: "none" };
  const sorted = [...devices].sort(
    (a, b) => new Date(b.last_active || 0).getTime() - new Date(a.last_active || 0).getTime(),
  );
  for (const d of sorted) {
    const b = deviceBucketForRow(d);
    if (b === "iphone") return { label: "iPhone", bucket: "iphone" };
    if (b === "android") return { label: "Android", bucket: "android" };
    if (b === "desktop") return { label: "Web/Desktop", bucket: "desktop" };
  }
  const first = sorted[0];
  if (first.device_name?.trim()) return { label: first.device_name.trim(), bucket: "outro" };
  if (sorted.some((d) => d.push_token)) {
    return { label: "App móvel (plataforma não identificada)", bucket: "outro" };
  }
  return { label: "Outro", bucket: "outro" };
}

function formatSessionBreakdown(devices: UserDeviceRow[]): string {
  if (!devices.length) return "Sem registo no app (só web) ou ainda não abriu o app após a última atualização";
  const c = { iphone: 0, android: 0, desktop: 0, outro: 0 };
  for (const d of devices) {
    c[deviceBucketForRow(d)]++;
  }
  const parts: string[] = [];
  if (c.iphone) parts.push(`${c.iphone} iPhone${c.iphone > 1 ? "s" : ""}`);
  if (c.android) parts.push(`${c.android} Android${c.android > 1 ? "s" : ""}`);
  if (c.desktop) parts.push(`${c.desktop} web/desktop`);
  if (c.outro) parts.push(`${c.outro} outro${c.outro > 1 ? "s" : ""}`);
  return parts.join(" · ");
}

function userTypeBadge(userType: string): string {
  const t = (userType || "").toLowerCase();
  if (t === "professional") return "Profissional";
  if (t === "company" || t === "enterprise") return "Empresa";
  if (t === "client") return "Cliente";
  if (t === "pending_signup") return "Cadastro pendente";
  return userType || "—";
}

async function fetchSponsorUserIds(): Promise<Set<string>> {
  const out = new Set<string>();
  let from = 0;
  const client = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
  for (;;) {
    const { data, error } = await client
      .from("sponsors")
      .select("user_id")
      .not("user_id", "is", null)
      .range(from, from + FETCH_PAGE - 1);
    if (error) {
      console.error("[AdminReports] sponsors user_id", error);
      break;
    }
    if (!data?.length) break;
    for (const row of data as { user_id: string }[]) {
      if (row.user_id) out.add(row.user_id);
    }
    if (data.length < FETCH_PAGE) break;
    from += FETCH_PAGE;
  }
  return out;
}

function planBadgeForUser(subsByUser: Map<string, SubLite[]>, userId: string): string {
  const list = subsByUser.get(userId) || [];
  if (!list.length) return "Free (sem assinatura)";
  const rank = (s: SubLite) => {
    const paid = s.plan_id !== "free";
    if (s.status === "ACTIVE" && paid) return 5;
    if (s.status === "ACTIVE") return 4;
    if (s.status === "PENDING" && paid) return 3;
    if (s.status === "PENDING") return 2;
    return 1;
  };
  const sub = [...list].sort((a, b) => rank(b) - rank(a))[0];
  const names: Record<string, string> = { free: "Free", pro: "Pro", vip: "VIP", business: "Business" };
  const pn = names[sub.plan_id] || sub.plan_id;
  const paid = sub.plan_id !== "free";
  if (sub.status === "ACTIVE") return paid ? `Assinante · ${pn}` : "Free";
  if (sub.status === "PENDING") return paid ? `Pendente · ${pn}` : "Pendente (free)";
  return `${pn} · ${sub.status}`;
}

// ─── Devices Tab ───
const DevicesTab = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [deviceFilter, setDeviceFilter] = useState<DeviceFilter>("all");
  const [accountKindFilter, setAccountKindFilter] = useState<AccountKindFilter>("all");
  const [rows, setRows] = useState<
    {
      user_id: string;
      full_name: string;
      email: string;
      userType: string;
      userTypeRaw: string;
      isSponsor: boolean;
      plan: string;
      primary: string;
      primaryBucket: PrimaryDeviceBucket;
      breakdown: string;
      count: number;
    }[]
  >([]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const [profiles, subs, devices, sponsorIds] = await Promise.all([
          paginateProfiles(),
          paginateSubscriptions(),
          paginateUserDevices(),
          fetchSponsorUserIds(),
        ]);

        const subsByUser = new Map<string, SubLite[]>();
        for (const s of subs) {
          const arr = subsByUser.get(s.user_id) || [];
          arr.push(s);
          subsByUser.set(s.user_id, arr);
        }

        const devByUser = new Map<string, UserDeviceRow[]>();
        for (const d of devices) {
          const arr = devByUser.get(d.user_id) || [];
          arr.push(d);
          devByUser.set(d.user_id, arr);
        }

        const built = profiles.map((p) => {
          const devs = devByUser.get(p.user_id) || [];
          const isSponsor = sponsorIds.has(p.user_id);
          const primaryInfo = primaryDeviceInfo(devs);
          const profileLabel = userTypeBadge(p.user_type);
          return {
            user_id: p.user_id,
            full_name: p.full_name || "—",
            email: p.email || "—",
            userType: isSponsor ? "Patrocinador" : profileLabel,
            userTypeRaw: (p.user_type || "").toLowerCase(),
            isSponsor,
            plan: planBadgeForUser(subsByUser, p.user_id),
            primary: primaryInfo.label,
            primaryBucket: primaryInfo.bucket,
            breakdown: formatSessionBreakdown(devs),
            count: devs.length,
          };
        });
        setRows(built);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Erro ao carregar");
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (deviceFilter !== "all" && r.primaryBucket !== deviceFilter) return false;
      if (accountKindFilter !== "all") {
        if (accountKindFilter === "sponsor" && !r.isSponsor) return false;
        if (accountKindFilter !== "sponsor" && r.isSponsor) return false;
        if (accountKindFilter === "client" && r.userTypeRaw !== "client") return false;
        if (accountKindFilter === "professional" && r.userTypeRaw !== "professional") return false;
        if (accountKindFilter === "company" && r.userTypeRaw !== "company" && r.userTypeRaw !== "enterprise") return false;
        if (accountKindFilter === "pending" && r.userTypeRaw !== "pending_signup") return false;
      }
      if (!q) return true;
      return (
        r.full_name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.userType.toLowerCase().includes(q) ||
        r.plan.toLowerCase().includes(q) ||
        r.primary.toLowerCase().includes(q)
      );
    });
  }, [rows, query, deviceFilter, accountKindFilter]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive py-6">{error}</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Dados de <code className="text-[10px]">user_devices</code>: o <strong>app Android/iOS</strong> regista o aparelho ao abrir (e atualiza com push
        se ativo). <strong>Só usam o site no browser</strong> → costuma aparecer &quot;Sem app registado&quot; até haver registo nativo. Política admin
        SELECT em <code className="text-[10px]">user_devices</code> (migração).
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="space-y-1.5 min-w-[160px]">
          <label className="text-[11px] font-medium text-muted-foreground">Último uso (dispositivo)</label>
          <Select value={deviceFilter} onValueChange={(v) => setDeviceFilter(v as DeviceFilter)}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="none">Sem app registado</SelectItem>
              <SelectItem value="iphone">iPhone</SelectItem>
              <SelectItem value="android">Android</SelectItem>
              <SelectItem value="desktop">Web / desktop</SelectItem>
              <SelectItem value="outro">Outro / indeterminado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 min-w-[160px]">
          <label className="text-[11px] font-medium text-muted-foreground">Tipo de conta</label>
          <Select value={accountKindFilter} onValueChange={(v) => setAccountKindFilter(v as AccountKindFilter)}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="client">Cliente</SelectItem>
              <SelectItem value="professional">Profissional</SelectItem>
              <SelectItem value="company">Empresa</SelectItem>
              <SelectItem value="sponsor">Patrocinador</SelectItem>
              <SelectItem value="pending">Cadastro pendente</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 flex-1 min-w-[200px] max-w-md">
          <label className="text-[11px] font-medium text-muted-foreground">Pesquisa</label>
          <Input
            placeholder="Nome, e-mail, plano, texto do dispositivo…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {filtered.length} utilizador{filtered.length !== 1 ? "es" : ""}
        {(query.trim() || deviceFilter !== "all" || accountKindFilter !== "all") && ` (de ${rows.length})`}
      </p>
      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="overflow-x-auto max-h-[min(70vh,720px)] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-[1] bg-muted/95 backdrop-blur border-b">
              <tr>
                <th className="text-left p-3 font-medium text-muted-foreground whitespace-nowrap">Utilizador</th>
                <th className="text-left p-3 font-medium text-muted-foreground whitespace-nowrap">E-mail</th>
                <th className="text-left p-3 font-medium text-muted-foreground whitespace-nowrap">Tipo</th>
                <th className="text-left p-3 font-medium text-muted-foreground whitespace-nowrap">Plano</th>
                <th className="text-left p-3 font-medium text-muted-foreground whitespace-nowrap">Último uso (tipo)</th>
                <th className="text-left p-3 font-medium text-muted-foreground min-w-[200px]">Sessões / aparelhos</th>
                <th className="text-right p-3 font-medium text-muted-foreground whitespace-nowrap">#</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.user_id} className="border-b last:border-0 hover:bg-muted/30 transition-colors align-top">
                  <td className="p-3 font-medium text-foreground text-xs md:text-sm max-w-[160px] truncate" title={r.full_name}>
                    {r.full_name}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground max-w-[200px] truncate" title={r.email}>
                    {r.email}
                  </td>
                  <td className="p-3 text-xs whitespace-nowrap">
                    <span className="rounded-md bg-muted px-2 py-0.5 font-medium">{r.userType}</span>
                  </td>
                  <td className="p-3 text-xs whitespace-nowrap">
                    <span
                      className={`rounded-md px-2 py-0.5 font-medium ${
                        r.plan.includes("Assinante") ? "bg-primary/15 text-primary" : "bg-muted text-foreground"
                      }`}
                    >
                      {r.plan}
                    </span>
                  </td>
                  <td className="p-3 text-xs whitespace-nowrap font-medium">{r.primary}</td>
                  <td className="p-3 text-xs text-muted-foreground leading-snug">{r.breakdown}</td>
                  <td className="p-3 text-xs text-right tabular-nums">{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <p className="text-center py-8 text-muted-foreground text-sm">Nenhum resultado</p>}
      </div>
    </div>
  );
};

const AdminReports = () => {
  const [activeTab, setActiveTab] = useState("growth");

  return (
    <AdminLayout title="Relatórios">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4 flex flex-wrap w-full gap-1 h-auto min-h-10">
          <TabsTrigger value="growth" className="shrink-0">
            <TrendingUp className="w-3.5 h-3.5 mr-1" />
            Crescimento
          </TabsTrigger>
          <TabsTrigger value="signup" className="shrink-0">
            <UserPlus className="w-3.5 h-3.5 mr-1" />
            Cadastros & Jornada
          </TabsTrigger>
          <TabsTrigger value="clients" className="shrink-0">
            <Users className="w-3.5 h-3.5 mr-1" />
            Clientes
          </TabsTrigger>
          <TabsTrigger value="professionals" className="shrink-0">
            <Users className="w-3.5 h-3.5 mr-1" />
            Profissionais
          </TabsTrigger>
          <TabsTrigger value="search" className="shrink-0">
            <SearchIcon className="w-3.5 h-3.5 mr-1" />
            Buscas
          </TabsTrigger>
          <TabsTrigger value="services" className="shrink-0">
            <Phone className="w-3.5 h-3.5 mr-1" />
            Serviços
          </TabsTrigger>
          <TabsTrigger value="subs" className="shrink-0">
            <CreditCard className="w-3.5 h-3.5 mr-1" />
            Assinaturas
          </TabsTrigger>
          <TabsTrigger value="reviews" className="shrink-0">
            <Star className="w-3.5 h-3.5 mr-1" />
            Avaliações
          </TabsTrigger>
          <TabsTrigger value="views" className="shrink-0">
            <Eye className="w-3.5 h-3.5 mr-1" />
            Categorias
          </TabsTrigger>
          <TabsTrigger value="clicks" className="shrink-0">
            <MousePointerClick className="w-3.5 h-3.5 mr-1" />
            Patrocinadores
          </TabsTrigger>
          <TabsTrigger value="devices" className="shrink-0">
            <Smartphone className="w-3.5 h-3.5 mr-1" />
            Dispositivos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="growth"><GrowthTab /></TabsContent>
        <TabsContent value="signup"><AdminAnalise embedded /></TabsContent>
        <TabsContent value="clients"><ClientsTab /></TabsContent>
        <TabsContent value="professionals"><ProfessionalsTab /></TabsContent>
        <TabsContent value="search"><SearchTermsTab /></TabsContent>
        <TabsContent value="services"><ServicesTab /></TabsContent>
        <TabsContent value="subs"><SubscriptionsTab /></TabsContent>
        <TabsContent value="reviews"><ReviewsTab /></TabsContent>
        <TabsContent value="views"><ViewsTab /></TabsContent>
        <TabsContent value="clicks"><ClicksTab /></TabsContent>
        <TabsContent value="devices"><DevicesTab /></TabsContent>
      </Tabs>
    </AdminLayout>
  );
};

export default AdminReports;
