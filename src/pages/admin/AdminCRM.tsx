import AdminLayout from "@/components/AdminLayout";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users, MessageCircle, Mail, Search, Clock, MousePointerClick, Activity, Bug, Loader2, ChevronRight, Check, CheckCheck } from "lucide-react";

type Tab = "usuarios" | "whatsapp" | "email";

interface UserRow { user_id: string; full_name: string | null; email: string | null; user_type: string | null; last_seen_at: string | null; }
interface EventRow { id: number; type: string; path: string | null; label: string | null; platform: string | null; session_id: string | null; created_at: string; }

const PAGE_NAMES: Record<string, string> = {
  "/home": "Início", "/search": "Busca", "/messages": "Mensagens", "/rewards": "Recompensas",
  "/profile": "Perfil", "/signup": "Cadastro", "/login": "Login", "/subscriptions": "Planos",
  "/notifications": "Notificações", "/community": "Comunidade", "/categories": "Categorias",
};
const pretty = (p: string | null) => (p ? PAGE_NAMES[p] || p : "—");
const fmtDur = (sec: number) => {
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60); const s = Math.round(sec % 60);
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60); return `${h}h ${m % 60}m`;
};
const fmtDateTime = (s: string) => new Date(s).toLocaleString("pt-BR");
const fmtDate = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
const fmtTime = (s: string) => new Date(s).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

interface WaMsg { id: number; to_phone: string | null; template: string | null; body: string | null; status: string | null; sent_at: string; read_at: string | null; delivered_at: string | null; }
interface WaInb { id: number; from_phone: string | null; type: string | null; body: string | null; received_at: string; }
type ChatMsg = { dir: "in" | "out"; text: string; time: string; status: string };
const onlyDigits = (s: string | null) => (s || "").replace(/\D/g, "");
const fmtPhone = (d: string) => {
  const m = d.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : (d ? `+${d}` : "—");
};

const GAP_CAP = 30 * 60; // tempo máximo atribuído a um intervalo entre eventos (s)

function computeJourney(events: EventRow[]) {
  const asc = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const sessions = new Set(asc.map((e) => e.session_id).filter(Boolean)).size;
  const heartbeats = asc.filter((e) => e.type === "heartbeat").length;
  const errors = asc.filter((e) => e.type === "error");
  const pageTime: Record<string, number> = {};
  const byDay: Record<string, { sec: number; pages: Record<string, number>; events: number }> = {};
  let currentPath: string | null = null;
  let totalSec = 0;

  for (let i = 0; i < asc.length; i++) {
    const e = asc[i];
    if (e.type === "page_view") currentPath = e.path;
    const day = e.created_at.slice(0, 10);
    byDay[day] = byDay[day] || { sec: 0, pages: {}, events: 0 };
    byDay[day].events++;
    const next = asc[i + 1];
    if (next && next.session_id === e.session_id) {
      const gap = (new Date(next.created_at).getTime() - new Date(e.created_at).getTime()) / 1000;
      const capped = Math.max(0, Math.min(gap, GAP_CAP));
      totalSec += capped;
      const key = currentPath || "—";
      pageTime[key] = (pageTime[key] || 0) + capped;
      byDay[day].sec += capped;
      byDay[day].pages[key] = (byDay[day].pages[key] || 0) + capped;
    }
  }

  const topPages = Object.entries(pageTime).sort((a, b) => b[1] - a[1]);
  const days = Object.entries(byDay).sort((a, b) => b[0].localeCompare(a[0]));
  const first = asc.length ? asc[0].created_at : null;
  const last = asc.length ? asc[asc.length - 1].created_at : null;
  const platform = asc.find((e) => e.platform && e.platform !== "web")?.platform || asc.find((e) => e.platform)?.platform || "—";
  return { sessions, heartbeats, errors, totalSec, topPages, days, first, last, platform, pageViews: asc.filter((e) => e.type === "page_view").length };
}

export default function AdminCRM() {
  const [tab, setTab] = useState<Tab>("usuarios");

  // ----- aba Usuários -----
  const [users, setUsers] = useState<UserRow[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  useEffect(() => {
    supabase.from("profiles").select("user_id, full_name, email, user_type, last_seen_at")
      .order("last_seen_at", { ascending: false, nullsFirst: false }).limit(2000)
      .then(({ data }) => setUsers(((data as unknown) as UserRow[]) || []));
  }, []);

  useEffect(() => {
    if (!selected) { setEvents([]); return; }
    let cancelled = false;
    setLoadingEvents(true);
    supabase.from("app_events" as never).select("id, type, path, label, platform, session_id, created_at")
      .eq("user_id", selected.user_id).order("created_at", { ascending: false }).limit(3000)
      .then(({ data }) => { if (!cancelled) { setEvents(((data as unknown) as EventRow[]) || []); setLoadingEvents(false); } });
    return () => { cancelled = true; };
  }, [selected]);

  // ----- aba WhatsApp -----
  const [waMsgs, setWaMsgs] = useState<WaMsg[]>([]);
  const [waInbound, setWaInbound] = useState<WaInb[]>([]);
  const [waLoaded, setWaLoaded] = useState(false);
  const [waPhone, setWaPhone] = useState<string | null>(null);
  const [waSearch, setWaSearch] = useState("");
  useEffect(() => {
    if (tab !== "whatsapp" || waLoaded) return;
    (async () => {
      const [{ data: m }, { data: inb }] = await Promise.all([
        supabase.from("wa_messages" as never).select("id, to_phone, template, body, status, sent_at, read_at, delivered_at").order("sent_at", { ascending: false }).limit(2000),
        supabase.from("wa_inbound" as never).select("id, from_phone, type, body, received_at").order("received_at", { ascending: false }).limit(2000),
      ]);
      setWaMsgs(((m as unknown) as WaMsg[]) || []);
      setWaInbound(((inb as unknown) as WaInb[]) || []);
      setWaLoaded(true);
    })();
  }, [tab, waLoaded]);

  // Conversas estilo WhatsApp Web (agrupadas por telefone)
  const conversations = useMemo(() => {
    const map = new Map<string, ChatMsg[]>();
    const push = (phone: string | null, msg: ChatMsg) => {
      const k = onlyDigits(phone);
      if (!k) return;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(msg);
    };
    for (const m of waMsgs) push(m.to_phone, { dir: "out", text: m.body || `[${m.template || "modelo"}]`, time: m.sent_at, status: m.read_at ? "read" : m.delivered_at ? "delivered" : (m.status || "sent") });
    for (const i of waInbound) push(i.from_phone, { dir: "in", text: i.body || `(${i.type || "mensagem"})`, time: i.received_at, status: "in" });
    const list = Array.from(map.entries()).map(([phone, msgs]) => {
      msgs.sort((a, b) => a.time.localeCompare(b.time));
      const last = msgs[msgs.length - 1];
      return { phone, msgs, last };
    });
    list.sort((a, b) => b.last.time.localeCompare(a.last.time));
    return list;
  }, [waMsgs, waInbound]);

  const waFilteredConvs = useMemo(() => {
    const t = onlyDigits(waSearch);
    if (!t) return conversations;
    return conversations.filter((c) => c.phone.includes(t));
  }, [conversations, waSearch]);

  const activeConv = useMemo(() => conversations.find((c) => c.phone === waPhone) || null, [conversations, waPhone]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return users.slice(0, 60);
    return users.filter((u) => (u.full_name || "").toLowerCase().includes(t) || (u.email || "").toLowerCase().includes(t)).slice(0, 60);
  }, [users, q]);

  const j = useMemo(() => computeJourney(events), [events]);

  const tabs: { key: Tab; label: string; icon: ReactNode }[] = [
    { key: "usuarios", label: "Usuários", icon: <Users className="w-4 h-4" /> },
    { key: "whatsapp", label: "WhatsApp", icon: <MessageCircle className="w-4 h-4" /> },
    { key: "email", label: "E-mail", icon: <Mail className="w-4 h-4" /> },
  ];

  return (
    <AdminLayout title="CRM">
      <div className="flex gap-2 mb-5">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${tab === t.key ? "bg-primary text-primary-foreground" : "bg-card border border-border text-foreground"}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {tab === "usuarios" && (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
          {/* lista */}
          <div className="rounded-2xl border border-border bg-card p-3 h-[70vh] flex flex-col">
            <div className="relative mb-2">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar usuário…"
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div className="overflow-y-auto flex-1 -mx-1 px-1">
              {filtered.map((u) => (
                <button key={u.user_id} onClick={() => setSelected(u)}
                  className={`w-full text-left px-3 py-2 rounded-xl mb-1 transition-colors ${selected?.user_id === u.user_id ? "bg-primary/10 border border-primary/30" : "hover:bg-muted"}`}>
                  <p className="text-sm font-medium text-foreground truncate">{u.full_name || "—"}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                </button>
              ))}
              {filtered.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">Nenhum usuário.</p>}
            </div>
          </div>

          {/* jornada */}
          <div className="rounded-2xl border border-border bg-card p-4 min-h-[70vh]">
            {!selected ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-24">
                <Users className="w-10 h-10 mb-3 opacity-40" />
                <p className="text-sm">Selecione um usuário para ver a jornada completa.</p>
              </div>
            ) : loadingEvents ? (
              <div className="h-full flex items-center justify-center text-muted-foreground py-24"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando…</div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-foreground">{selected.full_name || "—"}</h2>
                  <p className="text-sm text-muted-foreground break-all">{selected.email} · {selected.user_type || "—"} · {j.platform}</p>
                </div>

                {events.length === 0 ? (
                  <div className="rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">
                    Sem dados de uso ainda para este usuário. O rastreamento começa quando ele abrir o app a partir da atualização recente.
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <Kpi icon={<Clock className="w-3.5 h-3.5" />} label="Tempo total" value={fmtDur(j.totalSec)} />
                      <Kpi icon={<Activity className="w-3.5 h-3.5" />} label="Sessões" value={String(j.sessions)} />
                      <Kpi icon={<MousePointerClick className="w-3.5 h-3.5" />} label="Páginas vistas" value={String(j.pageViews)} />
                      <Kpi icon={<Bug className="w-3.5 h-3.5" />} label="Bugs" value={String(j.errors.length)} />
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2">Tempo por página (total)</p>
                      <div className="space-y-1.5">
                        {j.topPages.slice(0, 10).map(([path, sec]) => {
                          const max = j.topPages[0]?.[1] || 1;
                          return (
                            <div key={path} className="flex items-center gap-2">
                              <span className="w-28 text-xs text-foreground truncate shrink-0">{pretty(path)}</span>
                              <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                                <div className="h-full bg-primary rounded-full" style={{ width: `${(sec / max) * 100}%` }} />
                              </div>
                              <span className="text-xs text-muted-foreground w-16 text-right">{fmtDur(sec)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2">Por dia</p>
                      <div className="space-y-2">
                        {j.days.slice(0, 14).map(([day, d]) => (
                          <details key={day} className="rounded-xl border border-border">
                            <summary className="flex items-center justify-between px-3 py-2 cursor-pointer text-sm">
                              <span className="font-medium text-foreground flex items-center gap-1"><ChevronRight className="w-3 h-3" /> {fmtDate(day)}</span>
                              <span className="text-xs text-muted-foreground">{fmtDur(d.sec)} · {d.events} eventos</span>
                            </summary>
                            <div className="px-3 pb-2 space-y-1">
                              {Object.entries(d.pages).sort((a, b) => b[1] - a[1]).map(([p, s]) => (
                                <div key={p} className="flex items-center justify-between text-xs">
                                  <span className="text-foreground">{pretty(p)}</span>
                                  <span className="text-muted-foreground">{fmtDur(s)}</span>
                                </div>
                              ))}
                            </div>
                          </details>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2">Linha do tempo</p>
                      <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                        {events.slice(0, 80).map((e) => (
                          <div key={e.id} className="flex items-center justify-between text-xs border-b border-border/40 py-1">
                            <span className="text-foreground"><span className="inline-block min-w-[88px] font-medium">{e.type}</span><span className="text-muted-foreground">{e.label || pretty(e.path)}</span></span>
                            <span className="text-muted-foreground whitespace-nowrap ml-2">{fmtDateTime(e.created_at)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "whatsapp" && (
        <div className="rounded-2xl border border-border overflow-hidden bg-card grid grid-cols-1 md:grid-cols-[340px_1fr] h-[74vh]">
          {/* Lista de conversas */}
          <div className="border-r border-border flex flex-col min-h-0">
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={waSearch} onChange={(e) => setWaSearch(e.target.value)} placeholder="Pesquisar conversa…"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              {waFilteredConvs.map((c) => (
                <button key={c.phone} onClick={() => setWaPhone(c.phone)}
                  className={`w-full text-left px-3 py-3 flex items-center gap-3 border-b border-border/40 transition-colors ${waPhone === c.phone ? "bg-primary/10" : "hover:bg-muted"}`}>
                  <div className="w-10 h-10 rounded-full bg-emerald-500/15 text-emerald-600 flex items-center justify-center shrink-0"><MessageCircle className="w-5 h-5" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground truncate">{fmtPhone(c.phone)}</p>
                      <span className="text-[11px] text-muted-foreground shrink-0">{fmtTime(c.last.time)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{c.last.dir === "out" ? "✓ " : ""}{c.last.text}</p>
                  </div>
                </button>
              ))}
              {waFilteredConvs.length === 0 && <p className="text-xs text-muted-foreground text-center py-12">Nenhuma conversa ainda.<br />Os WhatsApps enviados aparecem aqui.</p>}
            </div>
          </div>

          {/* Thread */}
          <div className="flex flex-col min-h-0">
            {!activeConv ? (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                <MessageCircle className="w-12 h-12 mb-3 opacity-30" />
                <p className="text-sm">Selecione uma conversa para ver as mensagens.</p>
              </div>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-border flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-500/15 text-emerald-600 flex items-center justify-center"><MessageCircle className="w-5 h-5" /></div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{fmtPhone(activeConv.phone)}</p>
                    <p className="text-[11px] text-muted-foreground">Conta comercial · {activeConv.msgs.length} mensagens</p>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-muted/30">
                  {activeConv.msgs.map((m, idx) => (
                    <div key={idx} className={`flex ${m.dir === "out" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm ${m.dir === "out" ? "bg-emerald-600 text-white rounded-br-sm" : "bg-card text-foreground rounded-bl-sm border border-border"}`}>
                        <p className="whitespace-pre-wrap break-words">{m.text}</p>
                        <div className={`flex items-center gap-1 justify-end mt-1 text-[10px] ${m.dir === "out" ? "text-white/80" : "text-muted-foreground"}`}>
                          <span>{fmtTime(m.time)}</span>
                          {m.dir === "out" && (
                            m.status === "read" ? <CheckCheck className="w-3.5 h-3.5 text-sky-300" />
                              : m.status === "delivered" ? <CheckCheck className="w-3.5 h-3.5" />
                              : m.status === "failed" ? <span className="text-red-200 font-bold">!</span>
                              : <Check className="w-3.5 h-3.5" />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-4 py-2.5 border-t border-border text-center text-[11px] text-muted-foreground">
                  Somente leitura · ✓ enviada · ✓✓ entregue · <span className="text-sky-500">✓✓</span> lida · respostas chegam pelo webhook
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {tab === "email" && (
        <Placeholder
          icon={<Mail className="w-10 h-10" />}
          title="Caixa de e-mail estilo Gmail (em montagem)"
          lines={[
            "Enviados: dá pra montar já — basta eu registrar cada e-mail que o sistema dispara.",
            "Caixa de entrada e Spam: precisam CONECTAR a caixa de e-mail (IMAP ou API do provedor). Só com o SMTP de envio atual não dá pra ler recebidos.",
            "Me diz qual e-mail conectar (ex.: o do appchamo.com) e o tipo de acesso, que eu integro a visualização completa (entrada/spam/enviados/lixeira).",
          ]}
        />
      )}
    </AdminLayout>
  );
}

function Kpi({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">{icon}{label}</div>
      <p className="text-lg font-bold text-foreground mt-1">{value}</p>
    </div>
  );
}

function Placeholder({ icon, title, lines }: { icon: ReactNode; title: string; lines: string[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 max-w-2xl">
      <div className="text-primary mb-3">{icon}</div>
      <h2 className="text-lg font-bold text-foreground mb-3">{title}</h2>
      <ul className="space-y-2">
        {lines.map((l, i) => (
          <li key={i} className="text-sm text-muted-foreground flex gap-2"><span className="text-primary">•</span><span>{l}</span></li>
        ))}
      </ul>
    </div>
  );
}
