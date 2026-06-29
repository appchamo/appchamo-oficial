import AdminLayout from "@/components/AdminLayout";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users, MessageCircle, Mail, Search, Clock, MousePointerClick, Activity, Bug, Loader2, ChevronRight, Check, CheckCheck, ExternalLink, Inbox, Send, FileText, Trash2, AlertOctagon } from "lucide-react";

type Tab = "usuarios" | "whatsapp" | "email";

interface UserRow { user_id: string; full_name: string | null; email: string | null; user_type: string | null; last_seen_at: string | null; phone?: string | null; avatar_url?: string | null; }
const normalizeBR = (s: string | null) => { let d = (s || "").replace(/\D/g, ""); if (d.startsWith("55") && d.length >= 12) d = d.slice(2); return d; };
const initials = (name: string | null) => (name || "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
const typeLabel = (t: string | null | undefined) => t === "professional" ? "Profissional" : t === "company" || t === "enterprise" ? "Empresa" : t === "client" ? "Cliente" : "—";
// Botões dos templates (visual, igual WhatsApp)
const TEMPLATE_BUTTONS: Record<string, string[]> = { nova_chamada: ["Abrir no Chamô"], alerta_admin: [] };
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

interface WaMsg { id: number; to_phone: string | null; template: string | null; body: string | null; status: string | null; sent_at: string; read_at: string | null; delivered_at: string | null; user_id?: string | null; }
interface WaInb { id: number; from_phone: string | null; type: string | null; body: string | null; received_at: string; }
type ChatMsg = { dir: "in" | "out"; text: string; time: string; status: string; template?: string | null; userId?: string | null };
const onlyDigits = (s: string | null) => (s || "").replace(/\D/g, "");
const fmtPhone = (d: string) => {
  const m = d.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : (d ? `+${d}` : "—");
};
const fmtMailDate = (s: string | null) => { if (!s) return ""; const d = new Date(s); return isNaN(d.getTime()) ? s : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }); };
const EMAIL_FOLDERS = [
  { id: "INBOX", label: "Caixa de entrada", icon: Inbox },
  { id: "INBOX.Junk", label: "Spam", icon: AlertOctagon },
  { id: "INBOX.Sent", label: "Enviados", icon: Send },
  { id: "INBOX.Drafts", label: "Rascunhos", icon: FileText },
  { id: "INBOX.Trash", label: "Lixeira", icon: Trash2 },
];

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
    supabase.from("profiles").select("user_id, full_name, email, user_type, last_seen_at, phone, avatar_url")
      .order("last_seen_at", { ascending: false, nullsFirst: false }).limit(5000)
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
        supabase.from("wa_messages" as never).select("id, to_phone, template, body, status, sent_at, read_at, delivered_at, user_id").order("sent_at", { ascending: false }).limit(2000),
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
    for (const m of waMsgs) push(m.to_phone, { dir: "out", text: m.body || `[${m.template || "modelo"}]`, time: m.sent_at, status: m.read_at ? "read" : m.delivered_at ? "delivered" : (m.status || "sent"), template: m.template, userId: m.user_id ?? null });
    for (const i of waInbound) push(i.from_phone, { dir: "in", text: i.body || `(${i.type || "mensagem"})`, time: i.received_at, status: "in" });
    const list = Array.from(map.entries()).map(([phone, msgs]) => {
      msgs.sort((a, b) => a.time.localeCompare(b.time));
      const last = msgs[msgs.length - 1];
      const userId = msgs.find((m) => m.userId)?.userId ?? null;
      return { phone, msgs, last, userId };
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

  const profileByUserId = useMemo(() => {
    const m = new Map<string, UserRow>();
    for (const u of users) m.set(u.user_id, u);
    return m;
  }, [users]);
  const phoneProfiles = useMemo(() => {
    const m = new Map<string, UserRow[]>();
    for (const u of users) { const k = normalizeBR(u.phone || null); if (!k) continue; if (!m.has(k)) m.set(k, []); m.get(k)!.push(u); }
    return m;
  }, [users]);
  // Perfil da conversa: 1) usa o usuário vinculado ao envio; 2) senão, só identifica se o número pertencer a um único perfil.
  const profForConv = (c: { phone: string; userId: string | null }): UserRow | null => {
    if (c.userId && profileByUserId.has(c.userId)) return profileByUserId.get(c.userId)!;
    const arr = phoneProfiles.get(normalizeBR(c.phone)) || [];
    return arr.length === 1 ? arr[0] : null;
  };
  const clickedPhones = useMemo(() => {
    const s = new Set<string>();
    for (const i of waInbound) if (i.type === "button" || i.type === "interactive") s.add(normalizeBR(i.from_phone));
    return s;
  }, [waInbound]);
  const openUserProfile = (c: { phone: string; userId: string | null }) => { const p = profForConv(c); if (p) { setSelected(p); setTab("usuarios"); } };

  // ----- aba E-mail (IMAP) -----
  const [emFolder, setEmFolder] = useState<string>("INBOX");
  const [emMsgs, setEmMsgs] = useState<{ uid: string; date: string | null; subject: string; from: string; to: string; seen: boolean }[]>([]);
  const [emLoading, setEmLoading] = useState(false);
  const [emErr, setEmErr] = useState("");
  const [emSel, setEmSel] = useState<{ uid: string; date: string | null; subject: string; from: string; to: string } | null>(null);
  const [emBody, setEmBody] = useState("");
  const [emBodyType, setEmBodyType] = useState("text/plain");
  const [emBodyLoading, setEmBodyLoading] = useState(false);

  useEffect(() => {
    if (tab !== "email") return;
    let cancelled = false;
    (async () => {
      setEmLoading(true); setEmErr(""); setEmSel(null); setEmBody("");
      const { data, error } = await supabase.functions.invoke("email-imap", { body: { action: "fetch", folder: emFolder, limit: 40 } });
      if (cancelled) return;
      const d = data as { messages?: typeof emMsgs; error?: string } | null;
      if (error || d?.error) { setEmErr("Não foi possível ler a caixa." + (d?.error ? ` (${d.error})` : "")); setEmMsgs([]); }
      else setEmMsgs(d?.messages || []);
      setEmLoading(false);
    })();
    return () => { cancelled = true; };
  }, [tab, emFolder]);

  const openEmail = async (m: { uid: string; date: string | null; subject: string; from: string; to: string }) => {
    setEmSel(m); setEmBody(""); setEmBodyType("text/plain"); setEmBodyLoading(true);
    const { data } = await supabase.functions.invoke("email-imap", { body: { action: "body", folder: emFolder, uid: m.uid } });
    const d = data as { content?: string; contentType?: string } | null;
    setEmBody(d?.content || "(sem conteúdo)");
    setEmBodyType(d?.contentType || "text/plain");
    setEmBodyLoading(false);
  };

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
              {waFilteredConvs.map((c) => {
                const prof = profForConv(c);
                return (
                <button key={c.phone} onClick={() => setWaPhone(c.phone)}
                  className={`w-full text-left px-3 py-3 flex items-center gap-3 border-b border-border/40 transition-colors ${waPhone === c.phone ? "bg-primary/10" : "hover:bg-muted"}`}>
                  {prof?.avatar_url
                    ? <img src={prof.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                    : <div className="w-10 h-10 rounded-full bg-emerald-500/15 text-emerald-600 flex items-center justify-center shrink-0 text-sm font-bold">{prof ? initials(prof.full_name) : <MessageCircle className="w-5 h-5" />}</div>}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground truncate">{prof?.full_name || fmtPhone(c.phone)}</p>
                      <span className="text-[11px] text-muted-foreground shrink-0">{fmtTime(c.last.time)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{c.last.dir === "out" ? "✓ " : ""}{c.last.text}</p>
                  </div>
                </button>
                );
              })}
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
                {(() => {
                  const prof = profForConv(activeConv);
                  const clicked = clickedPhones.has(normalizeBR(activeConv.phone));
                  const anyRead = activeConv.msgs.some((m) => m.dir === "out" && m.status === "read");
                  return (
                    <div className="px-4 py-3 border-b border-border flex items-center gap-3">
                      <button onClick={() => openUserProfile(activeConv)} disabled={!prof} className="flex items-center gap-3 text-left disabled:cursor-default group">
                        {prof?.avatar_url
                          ? <img src={prof.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                          : <div className="w-10 h-10 rounded-full bg-emerald-500/15 text-emerald-600 flex items-center justify-center font-bold">{prof ? initials(prof.full_name) : <MessageCircle className="w-5 h-5" />}</div>}
                        <div>
                          <p className="text-sm font-semibold text-foreground group-hover:underline">{prof?.full_name || fmtPhone(activeConv.phone)}</p>
                          <p className="text-[11px] text-muted-foreground">{prof ? `${typeLabel(prof.user_type)} · ` : "Conta comercial · "}{fmtPhone(activeConv.phone)}</p>
                        </div>
                      </button>
                      <div className="ml-auto flex items-center gap-2">
                        {anyRead && <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 font-medium">Visualizou</span>}
                        {clicked && <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Clicou no botão</span>}
                        {prof && <span className="text-[11px] text-primary font-medium">ver perfil →</span>}
                      </div>
                    </div>
                  );
                })()}
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
                        {m.dir === "out" && m.template && (TEMPLATE_BUTTONS[m.template] || []).map((b, bi) => (
                          <div key={bi} className="mt-1.5 -mx-3 -mb-1 border-t border-white/25 pt-1.5 pb-0.5 text-center text-[13px] font-medium text-white flex items-center justify-center gap-1.5">
                            <ExternalLink className="w-3.5 h-3.5" />{b}
                          </div>
                        ))}
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
        <div className="rounded-2xl border border-border overflow-hidden bg-card grid grid-cols-1 md:grid-cols-[210px_340px_1fr] h-[74vh]">
          {/* Pastas */}
          <div className="border-r border-border p-2 space-y-1">
            {EMAIL_FOLDERS.map((f) => (
              <button key={f.id} onClick={() => setEmFolder(f.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors ${emFolder === f.id ? "bg-primary/10 text-primary font-semibold" : "hover:bg-muted text-foreground"}`}>
                <f.icon className="w-4 h-4 shrink-0" />{f.label}
              </button>
            ))}
          </div>

          {/* Lista */}
          <div className="border-r border-border flex flex-col min-h-0">
            {emLoading ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" />Lendo caixa…</div>
            ) : emErr ? (
              <div className="p-4 text-sm text-red-600">{emErr}</div>
            ) : (
              <div className="overflow-y-auto flex-1">
                {emMsgs.map((m) => (
                  <button key={m.uid} onClick={() => openEmail(m)}
                    className={`w-full text-left px-3 py-2.5 border-b border-border/40 transition-colors ${emSel?.uid === m.uid ? "bg-primary/10" : "hover:bg-muted"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm truncate ${m.seen ? "text-foreground" : "font-bold text-foreground"}`}>{(emFolder === "INBOX.Sent" ? m.to : m.from) || "—"}</p>
                      <span className="text-[11px] text-muted-foreground shrink-0">{fmtMailDate(m.date)}</span>
                    </div>
                    <p className={`text-xs truncate ${m.seen ? "text-muted-foreground" : "text-foreground font-medium"}`}>{m.subject}</p>
                  </button>
                ))}
                {emMsgs.length === 0 && <p className="text-xs text-muted-foreground text-center py-10">Pasta vazia.</p>}
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="flex flex-col min-h-0">
            {!emSel ? (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground"><Mail className="w-12 h-12 mb-3 opacity-30" /><p className="text-sm">Selecione um e-mail para ler.</p></div>
            ) : (
              <>
                <div className="px-5 py-3 border-b border-border">
                  <p className="text-base font-bold text-foreground">{emSel.subject}</p>
                  <p className="text-xs text-muted-foreground mt-1"><b>De:</b> {emSel.from}</p>
                  <p className="text-xs text-muted-foreground"><b>Para:</b> {emSel.to}</p>
                  {emSel.date && <p className="text-xs text-muted-foreground">{emSel.date}</p>}
                </div>
                <div className="flex-1 min-h-0">
                  {emBodyLoading ? (
                    <div className="flex items-center text-muted-foreground p-5"><Loader2 className="w-4 h-4 animate-spin mr-2" />Carregando mensagem…</div>
                  ) : emBodyType === "text/html" ? (
                    <iframe
                      title="email"
                      sandbox=""
                      className="w-full h-full border-0 bg-white"
                      srcDoc={`<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1a1a1a;margin:16px;font-size:14px;line-height:1.5}img{max-width:100%}</style></head><body>${emBody}</body></html>`}
                    />
                  ) : (
                    <pre className="whitespace-pre-wrap break-words text-sm text-foreground p-5" style={{ fontFamily: "inherit" }}>{emBody}</pre>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
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
