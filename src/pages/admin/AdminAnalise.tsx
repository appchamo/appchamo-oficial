import AdminLayout from "@/components/AdminLayout";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area,
} from "recharts";
import { Loader2, Users, UserCheck, Activity, AlertCircle, Search, Send, Clock, CheckCircle2 } from "lucide-react";

type Tab = "geral" | "cadastro";

interface IncompleteRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  created_at: string | null;
  signup_reminder_sent_at: string | null;
  signup_reminder_count: number | null;
}
const RESEND_MS = 24 * 60 * 60 * 1000;
const fmtAgo = (iso: string | null) => {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
};
const fmtIn = (iso: string) => {
  const diff = new Date(iso).getTime() - Date.now();
  const h = Math.ceil(diff / 3600000);
  return h <= 1 ? "~1h" : `${h}h`;
};

interface ProfileRow {
  user_type: string | null;
  accepted_terms_at: string | null;
  signup_completed_at: string | null;
  phone: string | null;
  address_city: string | null;
  last_seen_at: string | null;
  created_at: string | null;
}
interface EventRow {
  type: string;
  path: string | null;
  platform: string | null;
  created_at: string;
}

const COLORS = ["#ea580c", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ef4444", "#6b7280", "#14b8a6"];
const PAGE_NAMES: Record<string, string> = {
  "/home": "Início", "/search": "Busca", "/messages": "Mensagens", "/rewards": "Recompensas",
  "/profile": "Perfil", "/signup": "Cadastro", "/login": "Login", "/subscriptions": "Planos",
  "/notifications": "Notificações", "/community": "Comunidade", "/categories": "Categorias",
};
const pretty = (p: string | null) => (p ? PAGE_NAMES[p] || p : "—");

export default function AdminAnalise() {
  const [tab, setTab] = useState<Tab>("geral");
  const [loading, setLoading] = useState(true);
  const [reactBusy, setReactBusy] = useState(false);
  const [reactMsg, setReactMsg] = useState("");

  const sendReactivation = async (test: boolean) => {
    setReactBusy(true); setReactMsg("");
    try {
      const reqBody: Record<string, unknown> = { dry_run: false };
      if (test) {
        const { data: { user } } = await supabase.auth.getUser();
        reqBody.test_email = user?.email;
      } else if (!window.confirm("Enviar o e-mail \"termine seu cadastro\" para TODOS os cadastros incompletos? Isso envia e-mails reais.")) {
        setReactBusy(false); return;
      }
      const { data, error } = await supabase.functions.invoke("email-incomplete-signups", { body: reqBody });
      if (error) throw error;
      const d = data as { sent?: number; total?: number; failed?: number };
      setReactMsg(test ? "Teste enviado para o seu e-mail." : `Enviados: ${d.sent}/${d.total} (falhas: ${d.failed}).`);
    } catch (e) {
      setReactMsg("Erro ao enviar: " + ((e as Error)?.message || "tente novamente"));
    } finally {
      setReactBusy(false);
    }
  };
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [providers, setProviders] = useState<{ provider: string; total: number; concluiu: number; abriu: number }[]>([]);

  // ---- cadastros incompletos (lista por usuário) ----
  const [incompletes, setIncompletes] = useState<IncompleteRow[]>([]);
  const [incQ, setIncQ] = useState("");
  const [incShown, setIncShown] = useState(15);
  const [incBusy, setIncBusy] = useState<string | null>(null); // user_id em envio
  const [incMsg, setIncMsg] = useState<Record<string, string>>({});

  const loadIncompletes = async () => {
    const { data } = await supabase.from("profiles")
      .select("user_id, full_name, email, created_at, signup_reminder_sent_at, signup_reminder_count")
      .is("signup_completed_at", null).not("email", "is", null)
      .order("created_at", { ascending: false }).limit(3000);
    setIncompletes(((data as unknown) as IncompleteRow[]) || []);
  };
  useEffect(() => { loadIncompletes(); }, []);
  useEffect(() => { setIncShown(15); }, [incQ]);

  const sendToUser = async (u: IncompleteRow, force = false) => {
    setIncBusy(u.user_id); setIncMsg((m) => ({ ...m, [u.user_id]: "" }));
    try {
      const { data, error } = await supabase.functions.invoke("email-incomplete-signups", { body: { user_id: u.user_id, force } });
      if (error) throw error;
      const d = data as { ok?: boolean; error?: string; next_at?: string };
      if (d?.ok) {
        const nowIso = new Date().toISOString();
        setIncompletes((list) => list.map((x) => x.user_id === u.user_id
          ? { ...x, signup_reminder_sent_at: nowIso, signup_reminder_count: (x.signup_reminder_count || 0) + 1 } : x));
        setIncMsg((m) => ({ ...m, [u.user_id]: "✓ E-mail enviado." }));
      } else if (d?.error === "aguarde_24h") {
        setIncMsg((m) => ({ ...m, [u.user_id]: `Aguarde ${d.next_at ? fmtIn(d.next_at) : "24h"} para reenviar.` }));
      } else {
        setIncMsg((m) => ({ ...m, [u.user_id]: "Erro: " + (d?.error || "tente novamente") }));
      }
    } catch (e) {
      setIncMsg((m) => ({ ...m, [u.user_id]: "Erro: " + ((e as Error)?.message || "tente novamente") }));
    } finally {
      setIncBusy(null);
    }
  };

  const incFiltered = useMemo(() => {
    const t = incQ.trim().toLowerCase();
    if (!t) return incompletes;
    return incompletes.filter((u) => (u.full_name || "").toLowerCase().includes(t) || (u.email || "").toLowerCase().includes(t));
  }, [incompletes, incQ]);
  const incVisible = incQ.trim() ? incFiltered : incFiltered.slice(0, incShown);

  // Último envio automático (proxy: envio mais recente entre os incompletos).
  const lastReminderLabel = useMemo(() => {
    let max = 0;
    for (const u of incompletes) {
      const t = u.signup_reminder_sent_at ? new Date(u.signup_reminder_sent_at).getTime() : 0;
      if (t > max) max = t;
    }
    if (!max) return null;
    const d = new Date(max);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} às ${p(d.getHours())}h${p(d.getMinutes())}`;
  }, [incompletes]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: pData }, { data: eData }, { data: provData }] = await Promise.all([
        supabase.from("profiles").select("user_type, accepted_terms_at, signup_completed_at, phone, address_city, last_seen_at, created_at").limit(20000),
        supabase.from("app_events" as never).select("type, path, platform, created_at").order("created_at", { ascending: false }).limit(8000),
        supabase.rpc("admin_signup_breakdown" as never),
      ]);
      if (!cancelled) {
        setProfiles(((pData as unknown) as ProfileRow[]) || []);
        setEvents(((eData as unknown) as EventRow[]) || []);
        setProviders(((provData as unknown) as { provider: string; total: number; concluiu: number; abriu: number }[]) || []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ---- agregações ----
  const stats = useMemo(() => {
    const total = profiles.length;
    const has = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== "";
    const clientes = profiles.filter((p) => p.user_type === "client").length;
    const pros = profiles.filter((p) => p.user_type === "professional").length;
    const empresas = profiles.filter((p) => p.user_type === "company" || p.user_type === "enterprise").length;
    const outros = total - clientes - pros - empresas;
    const termos = profiles.filter((p) => has(p.accepted_terms_at)).length;
    const concluiu = profiles.filter((p) => has(p.signup_completed_at)).length;
    const telefone = profiles.filter((p) => has(p.phone)).length;
    const abriu = profiles.filter((p) => has(p.last_seen_at)).length;
    return { total, clientes, pros, empresas, outros, termos, concluiu, telefone, abriu };
  }, [profiles]);

  const tipoData = useMemo(() => ([
    { name: "Clientes", value: stats.clientes },
    { name: "Profissionais", value: stats.pros },
    { name: "Empresas", value: stats.empresas },
    ...(stats.outros > 0 ? [{ name: "Outros/Incompletos", value: stats.outros }] : []),
  ].filter((d) => d.value > 0)), [stats]);

  const cadastroData = useMemo(() => ([
    { name: "Concluíram", value: stats.concluiu },
    { name: "Não concluíram", value: Math.max(0, stats.total - stats.concluiu) },
  ].filter((d) => d.value > 0)), [stats]);

  // Plataforma: só app (iOS/Android). Web é o admin/site — não conta como uso do app.
  const plataformaData = useMemo(() => {
    let ios = 0, android = 0;
    for (const e of events) {
      if (e.platform === "ios") ios++;
      else if (e.platform === "android") android++;
    }
    return [
      { name: "iOS", value: ios },
      { name: "Android", value: android },
    ].filter((d) => d.value > 0);
  }, [events]);

  // Jornada: só páginas de usuário comum (exclui admin e suporte-desk).
  const isUserPath = (p: string | null) =>
    !!p && !p.startsWith("/admin") && !p.startsWith("/suporte-desk");
  const topPages = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of events) if (e.type === "page_view" && isUserPath(e.path)) { const k = e.path as string; m[k] = (m[k] || 0) + 1; }
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([path, qtd]) => ({ name: pretty(path), qtd }));
  }, [events]);

  const perDay = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of events) { const d = (e.created_at || "").slice(0, 10); if (d) m[d] = (m[d] || 0) + 1; }
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0])).slice(-14)
      .map(([d, qtd]) => ({ dia: d.slice(5), qtd }));
  }, [events]);

  const funnel = useMemo(() => {
    const steps = [
      { name: "Contas criadas", value: stats.total, fill: COLORS[0] },
      { name: "Aceitaram termos", value: stats.termos, fill: COLORS[1] },
      { name: "Preencheram telefone", value: stats.telefone, fill: COLORS[2] },
      { name: "Concluíram cadastro", value: stats.concluiu, fill: COLORS[3] },
      { name: "Abriram o app", value: stats.abriu, fill: COLORS[4] },
    ];
    return steps;
  }, [stats]);

  const Card = ({ title, children, sub }: { title: string; children: ReactNode; sub?: string }) => (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-sm font-semibold text-foreground mb-1">{title}</p>
      {sub && <p className="text-xs text-muted-foreground mb-2">{sub}</p>}
      {children}
    </div>
  );
  const Kpi = ({ icon, label, value }: { icon: ReactNode; label: string; value: string }) => (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">{icon}{label}</div>
      <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
    </div>
  );
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

  return (
    <AdminLayout title="Análise">
      <p className="text-sm text-muted-foreground mb-4">Usabilidade do app e funil de cadastro.</p>

      <div className="flex gap-2 mb-5">
        <button onClick={() => setTab("geral")} className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${tab === "geral" ? "bg-primary text-primary-foreground" : "bg-card border border-border text-foreground"}`}>Visão geral</button>
        <button onClick={() => setTab("cadastro")} className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${tab === "cadastro" ? "bg-primary text-primary-foreground" : "bg-card border border-border text-foreground"}`}>Fluxo de cadastro</button>
      </div>

      {loading ? (
        <div className="py-24 flex items-center justify-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando…</div>
      ) : tab === "geral" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Kpi icon={<Users className="w-3.5 h-3.5" />} label="Usuários" value={String(stats.total)} />
            <Kpi icon={<UserCheck className="w-3.5 h-3.5" />} label="Cadastro concluído" value={`${stats.concluiu} (${pct(stats.concluiu, stats.total)}%)`} />
            <Kpi icon={<Activity className="w-3.5 h-3.5" />} label="Abriram o app" value={String(stats.abriu)} />
            <Kpi icon={<AlertCircle className="w-3.5 h-3.5" />} label="Eventos coletados" value={String(events.length)} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card title="Tipos de conta">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={tipoData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                    {tipoData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip /><Legend />
                </PieChart>
              </ResponsiveContainer>
            </Card>
            <Card title="Cadastro concluído x não concluído">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={cadastroData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} label>
                    <Cell fill={COLORS[2]} /><Cell fill={COLORS[5]} />
                  </Pie>
                  <Tooltip /><Legend />
                </PieChart>
              </ResponsiveContainer>
            </Card>
            <Card title="Páginas mais acessadas (jornada)" sub="A partir do registro de uso (dados recentes).">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={topPages} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" /><YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12 }} />
                  <Tooltip /><Bar dataKey="qtd" fill={COLORS[0]} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
            <Card title="Plataforma (eventos)" sub="Web / iOS / Android.">
              {plataformaData.length ? (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={plataformaData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                      {plataformaData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip /><Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-muted-foreground py-12 text-center">Sem dados de uso ainda.</p>}
            </Card>
          </div>

          <Card title="Atividade por dia (últimos 14 dias)" sub="Total de eventos registrados.">
            {perDay.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={perDay}>
                  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={COLORS[0]} stopOpacity={0.6} /><stop offset="95%" stopColor={COLORS[0]} stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="dia" tick={{ fontSize: 12 }} /><YAxis />
                  <Tooltip /><Area type="monotone" dataKey="qtd" stroke={COLORS[0]} fill="url(#g)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-muted-foreground py-12 text-center">Sem dados de uso ainda.</p>}
          </Card>
        </div>
      ) : (
        // ---- Fluxo de cadastro ----
        <div className="space-y-4">
          <Card title="Funil de cadastro" sub="Quantas pessoas avançam em cada etapa (dados históricos dos perfis).">
            <div className="space-y-1.5 py-1">
              {funnel.map((s, i) => {
                const total = funnel[0].value || 1;
                const w = Math.max(30, (s.value / total) * 100);
                const nextW = i < funnel.length - 1 ? Math.max(30, (funnel[i + 1].value / total) * 100) : 0;
                const inset = Math.min(50, Math.max(0, ((1 - nextW / w) / 2) * 100));
                const convTotal = pct(s.value, total);
                const dropPrev = i === 0 ? 0 : 100 - pct(s.value, funnel[i - 1].value);
                return (
                  <div key={s.name} className="grid grid-cols-[42%_58%] gap-3 items-center">
                    <div className="flex justify-center">
                      <div
                        className="h-14 flex items-center justify-center text-white font-extrabold text-lg shadow-sm"
                        style={{
                          width: `${w}%`,
                          background: s.fill,
                          clipPath: `polygon(0 0, 100% 0, ${100 - inset}% 100%, ${inset}% 100%)`,
                        }}
                      >
                        {s.value}
                      </div>
                    </div>
                    <div className="rounded-lg bg-muted px-4 py-2.5">
                      <p className="text-sm font-semibold text-foreground leading-tight">{s.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {convTotal}% do total{i > 0 && dropPrev > 0 ? <span className="text-red-600 font-medium"> · −{dropPrev}% vs etapa anterior</span> : null}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title="Cadastro por método" sub="Google / Apple x e-mail e senha — e quantos concluíram.">
            {providers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Sem dados.</p>
            ) : (
              <div className="space-y-2">
                {[...providers].sort((a, b) => b.total - a.total).map((p) => {
                  const label = p.provider === "google" ? "Google" : p.provider === "apple" ? "Apple" : "E-mail e senha";
                  const soOauth = Math.max(0, p.total - p.concluiu);
                  return (
                    <div key={p.provider} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-semibold text-foreground">{label}</span>
                        <span className="text-sm text-muted-foreground">{p.total} contas</span>
                      </div>
                      <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden flex">
                        <div className="h-full bg-emerald-500" style={{ width: `${pct(p.concluiu, p.total)}%` }} title="Concluíram" />
                        <div className="h-full bg-red-400" style={{ width: `${pct(soOauth, p.total)}%` }} title="Só autenticaram" />
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-xs">
                        <span className="text-emerald-700">✓ Concluíram: <b>{p.concluiu}</b> ({pct(p.concluiu, p.total)}%)</span>
                        <span className="text-red-600">✗ Só autenticaram: <b>{soOauth}</b> ({pct(soOauth, p.total)}%)</span>
                        <span className="text-muted-foreground">Abriram o app: <b>{p.abriu}</b></span>
                      </div>
                    </div>
                  );
                })}
                <p className="text-[11px] text-muted-foreground pt-1">
                  "Só autenticaram" = entrou (Google/Apple/e-mail) mas não terminou o cadastro (sem termos/dados).
                </p>
              </div>
            )}
          </Card>

          <Card title="Conversão entre etapas">
            <div className="space-y-2">
              {funnel.map((s, i) => {
                const prev = i === 0 ? s.value : funnel[i - 1].value;
                const convTotal = pct(s.value, funnel[0].value);
                const convPrev = i === 0 ? 100 : pct(s.value, prev);
                const dropPrev = 100 - convPrev;
                return (
                  <div key={s.name} className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: s.fill }} />
                    <span className="flex-1 text-sm text-foreground">{s.name}</span>
                    <span className="text-sm font-semibold text-foreground w-16 text-right">{s.value}</span>
                    <span className="text-xs text-muted-foreground w-14 text-right">{convTotal}%</span>
                    <span className={`text-xs w-20 text-right ${i > 0 && dropPrev > 0 ? "text-red-600" : "text-muted-foreground"}`}>
                      {i > 0 ? `-${dropPrev}%` : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground mt-3">Coluna 1: total na etapa. Coluna 2: % sobre o total de contas. Coluna 3: queda em relação à etapa anterior.</p>
          </Card>

          <Card title="Reativar cadastros incompletos" sub="O e-mail “termine seu cadastro” é enviado automaticamente para quem iniciou (Google/Apple/e-mail) e não concluiu.">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] px-3.5 py-3">
              <p className="text-sm font-semibold text-emerald-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Envio automático ativo
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Todo dia às 10h · no máximo 3 lembretes por pessoa (não reenvia antes de 24h).
              </p>
              <p className="text-sm text-foreground mt-2">
                {lastReminderLabel
                  ? <>Último envio: <strong>{lastReminderLabel}</strong></>
                  : <span className="text-muted-foreground">Nenhum envio ainda — o primeiro será no próximo horário (10h).</span>}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                onClick={() => sendReactivation(true)}
                disabled={reactBusy}
                className="px-4 py-2 rounded-xl text-sm font-medium border border-border bg-card text-foreground disabled:opacity-60"
              >
                Enviar teste pra mim
              </button>
            </div>
            {reactBusy && <p className="text-xs text-muted-foreground mt-2">Enviando…</p>}
            {reactMsg && <p className="text-xs mt-2 text-foreground">{reactMsg}</p>}
          </Card>

          <Card title="Cadastros incompletos" sub={`${incompletes.length} pessoa(s) iniciaram e não concluíram. Envie individualmente; reenvio só após 24h.`}>
            <div className="relative mb-3">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={incQ} onChange={(e) => setIncQ(e.target.value)} placeholder="Buscar por nome ou e-mail…"
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div className="space-y-1.5">
              {incVisible.map((u) => {
                const lastAt = u.signup_reminder_sent_at ? new Date(u.signup_reminder_sent_at).getTime() : 0;
                const locked = !!lastAt && Date.now() - lastAt < RESEND_MS;
                const nextAt = lastAt ? new Date(lastAt + RESEND_MS).toISOString() : null;
                const busy = incBusy === u.user_id;
                const count = u.signup_reminder_count || 0;
                return (
                  <div key={u.user_id} className="flex items-center gap-3 rounded-xl border border-border p-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{u.full_name || "—"}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {count > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
                            <CheckCircle2 className="w-3 h-3" /> Enviado {fmtAgo(u.signup_reminder_sent_at)}{count > 1 ? ` · ${count}x` : ""}
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">Nunca enviado</span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <button
                        onClick={() => sendToUser(u)}
                        disabled={busy || locked}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-60 ${count > 0 ? "border border-border bg-card text-foreground" : "bg-primary text-primary-foreground"}`}
                        title={locked && nextAt ? `Reenvio liberado em ${fmtIn(nextAt)}` : ""}
                      >
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : locked ? <><Clock className="w-3.5 h-3.5" /> {nextAt ? fmtIn(nextAt) : "24h"}</>
                          : <><Send className="w-3.5 h-3.5" /> {count > 0 ? "Reenviar" : "Enviar"}</>}
                      </button>
                      {incMsg[u.user_id] && <p className="text-[10px] text-muted-foreground mt-1 max-w-[140px]">{incMsg[u.user_id]}</p>}
                    </div>
                  </div>
                );
              })}
              {incVisible.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">Nenhum cadastro incompleto.</p>}
            </div>
            {!incQ.trim() && incShown < incFiltered.length && (
              <button onClick={() => setIncShown((n) => n + 15)}
                className="w-full mt-2 py-2 rounded-xl text-sm font-medium text-primary border border-primary/30 hover:bg-primary/5 transition-colors">
                Ver mais ({incFiltered.length - incShown} restantes)
              </button>
            )}
            <p className="text-[11px] text-muted-foreground text-center pt-2">
              {incQ.trim() ? `${incFiltered.length} resultado(s)` : `Mostrando ${Math.min(incShown, incFiltered.length)} de ${incFiltered.length}`}
            </p>
          </Card>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            A maioria dos cadastros incompletos entra com Google/Apple (1 toque) e abandona antes dos termos/dados. O registro de uso (página Analytics do usuário) mostra, daqui pra frente, em qual tela cada pessoa para.
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
