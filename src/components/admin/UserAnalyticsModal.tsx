// Modal de Analytics de um usuário (admin). Lê public.app_events e resume:
// minutos navegados, sessões, páginas acessadas, se chegou na Home, bugs e timeline.
import { useEffect, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Clock, MousePointerClick, Home, Bug, Activity, Loader2 } from "lucide-react";

interface AppEvent {
  id: number;
  type: string;
  path: string | null;
  label: string | null;
  meta?: any;
  platform: string | null;
  session_id: string | null;
  created_at: string;
}

export interface AnalyticsTarget {
  user_id: string;
  full_name?: string | null;
  email?: string | null;
}

const PAGE_NAMES: Record<string, string> = {
  "/home": "Início", "/search": "Busca", "/messages": "Mensagens", "/rewards": "Recompensas",
  "/profile": "Perfil", "/signup": "Cadastro", "/login": "Login", "/subscriptions": "Planos",
  "/notifications": "Notificações", "/community": "Comunidade",
};
const PRO_PATH_RE = /^\/(?:professional|pro)\/([^/?#]+)/;
const CAT_PATH_RE = /^\/category\/([^/?#]+)/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Deixa um slug/valor de categoria legível quando a busca no banco falha. */
function prettifyCategory(raw: string): string {
  let t = raw;
  try { t = decodeURIComponent(raw); } catch { /* mantém cru */ }
  if (!t.includes(" ") && t.includes("-")) t = t.replace(/-/g, " ");
  t = t.trim();
  return t.replace(/\b\p{L}/gu, (ch) => ch.toUpperCase());
}
function fmt(dt: string) {
  return new Date(dt).toLocaleString("pt-BR");
}

export default function UserAnalyticsModal({
  target, onClose,
}: { target: AnalyticsTarget | null; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<AppEvent[]>([]);
  // Nomes legíveis resolvidos a partir dos paths (id/slug → nome). Populam após os eventos.
  const [proNames, setProNames] = useState<Record<string, string>>({});
  const [catNames, setCatNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    setProNames({});
    setCatNames({});
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("app_events" as never)
        .select("id, type, path, label, meta, platform, session_id, created_at")
        .eq("user_id", target.user_id)
        .order("created_at", { ascending: false })
        .limit(1000);
      const list = ((data as unknown) as AppEvent[]) || [];
      if (cancelled) return;
      setEvents(list);
      setLoading(false);

      // Resolve nomes amigáveis em segundo plano — nunca bloqueia a renderização.
      const proKeys = new Set<string>();
      const catKeys = new Set<string>();
      for (const e of list) {
        const p = e.path || "";
        const pm = p.match(PRO_PATH_RE);
        if (pm) proKeys.add(pm[1]);
        const cm = p.match(CAT_PATH_RE);
        if (cm) catKeys.add(cm[1]);
      }

      // Profissionais: id/slug no path → nome. Mesma semântica do ProfessionalProfile
      // (professionals.id OU slug → profiles.full_name via user_id).
      if (proKeys.size) {
        try {
          const keys = Array.from(proKeys);
          const uuids = keys.filter((k) => UUID_RE.test(k));
          const slugs = keys.filter((k) => !UUID_RE.test(k));
          const rows: { id: string; slug: string | null; user_id: string }[] = [];
          if (uuids.length) {
            const { data: r } = await supabase.from("professionals").select("id, slug, user_id").in("id", uuids);
            if (r) rows.push(...((r as unknown) as typeof rows));
          }
          if (slugs.length) {
            const { data: r } = await supabase.from("professionals").select("id, slug, user_id").in("slug", slugs);
            if (r) rows.push(...((r as unknown) as typeof rows));
          }
          const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
          const nameByUser = new Map<string, string>();
          if (userIds.length) {
            const { data: profs } = await supabase
              .from("profiles_public" as any)
              .select("user_id, full_name")
              .in("user_id", userIds);
            (((profs as unknown) as { user_id: string; full_name: string | null }[]) || []).forEach((pr) => {
              if (pr.full_name) nameByUser.set(pr.user_id, pr.full_name);
            });
          }
          const map: Record<string, string> = {};
          for (const r of rows) {
            const nm = nameByUser.get(r.user_id);
            if (!nm) continue;
            if (proKeys.has(r.id)) map[r.id] = nm;
            if (r.slug && proKeys.has(r.slug)) map[r.slug] = nm;
          }
          if (!cancelled && Object.keys(map).length) setProNames(map);
        } catch { /* mantém path cru se falhar */ }
      }

      // Categorias: <x> no path → nome. Aceita nome URL-encoded e slug (categories.slug).
      if (catKeys.size) {
        try {
          const keys = Array.from(catKeys);
          const { data: cats } = await supabase.from("categories").select("name, slug");
          const rows = (((cats as unknown) as { name: string; slug: string }[]) || []);
          const bySlug = new Map<string, string>();
          const byNameLower = new Map<string, string>();
          rows.forEach((c) => {
            if (c.slug) bySlug.set(c.slug, c.name);
            if (c.name) byNameLower.set(c.name.toLowerCase(), c.name);
          });
          const map: Record<string, string> = {};
          for (const k of keys) {
            let decoded = k;
            try { decoded = decodeURIComponent(k); } catch { /* mantém cru */ }
            const hit =
              bySlug.get(k) ||
              bySlug.get(decoded) ||
              byNameLower.get(decoded.toLowerCase()) ||
              prettifyCategory(k);
            map[k] = hit;
          }
          if (!cancelled && Object.keys(map).length) setCatNames(map);
        } catch { /* mantém path cru se falhar */ }
      }
    })();
    return () => { cancelled = true; };
  }, [target]);

  // Rótulo legível do path — usa PAGE_NAMES + nomes resolvidos de perfis/categorias.
  const prettyPath = (p: string | null): string => {
    if (!p) return "—";
    if (PAGE_NAMES[p]) return PAGE_NAMES[p];
    const pm = p.match(PRO_PATH_RE);
    if (pm && proNames[pm[1]]) return `Perfil: ${proNames[pm[1]]}`;
    const cm = p.match(CAT_PATH_RE);
    if (cm && catNames[cm[1]]) return `Categoria: ${catNames[cm[1]]}`;
    return p;
  };

  const heartbeats = events.filter((e) => e.type === "heartbeat").length;
  const minutes = heartbeats; // ~1 heartbeat por minuto visível
  const sessions = new Set(events.map((e) => e.session_id).filter(Boolean)).size;
  const pageViews = events.filter((e) => e.type === "page_view");
  const reachedHome = events.some((e) => (e.path || "").startsWith("/home") || e.type === "reached_home");
  const errors = events.filter((e) => e.type === "error");
  const first = events.length ? events[events.length - 1].created_at : null;
  const last = events.length ? events[0].created_at : null;
  const platform = events.find((e) => e.platform)?.platform || "—";

  // páginas mais acessadas
  const pageCounts: Record<string, number> = {};
  for (const e of pageViews) {
    const k = e.path || "—";
    pageCounts[k] = (pageCounts[k] || 0) + 1;
  }
  const topPages = Object.entries(pageCounts).sort((a, b) => b[1] - a[1]).slice(0, 12);

  // 🔎 Buscas do cliente (termo/categoria) — agregadas por frequência, mais recentes primeiro em empate.
  const searchAgg = new Map<string, { query: string | null; category: string | null; count: number; last: string }>();
  for (const e of events) {
    if (e.type !== "action" || e.label !== "search") continue;
    const q = (e.meta?.query ?? null) as string | null;
    const cat = (e.meta?.category ?? null) as string | null;
    if (!q && !cat) continue;
    const key = `${(q || "").toLowerCase()}||${(cat || "").toLowerCase()}`;
    const prev = searchAgg.get(key);
    if (prev) {
      prev.count += 1;
      if (e.created_at > prev.last) prev.last = e.created_at;
    } else {
      searchAgg.set(key, { query: q, category: cat, count: 1, last: e.created_at });
    }
  }
  const searches = Array.from(searchAgg.values())
    .sort((a, b) => (b.count - a.count) || (b.last.localeCompare(a.last)))
    .slice(0, 12);

  // 👤 Perfis visitados — dedupe por profissional, com contagem, mais recentes primeiro.
  const profileAgg = new Map<string, { name: string; category: string | null; count: number; last: string }>();
  for (const e of events) {
    if (e.type !== "action" || e.label !== "profile_view") continue;
    const name = (e.meta?.professional_name ?? e.meta?.professional_id ?? null) as string | null;
    if (!name) continue;
    const cat = (e.meta?.category ?? null) as string | null;
    const key = String(e.meta?.professional_id ?? name);
    const prev = profileAgg.get(key);
    if (prev) {
      prev.count += 1;
      if (e.created_at > prev.last) prev.last = e.created_at;
    } else {
      profileAgg.set(key, { name, category: cat, count: 1, last: e.created_at });
    }
  }
  const profileViews = Array.from(profileAgg.values())
    .sort((a, b) => b.last.localeCompare(a.last))
    .slice(0, 12);

  const Stat = ({ icon, label, value, tint }: { icon: ReactNode; label: string; value: string; tint: string }) => (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className={`inline-flex items-center gap-1.5 text-xs font-medium ${tint}`}>{icon}{label}</div>
      <p className="text-xl font-bold text-foreground mt-1">{value}</p>
    </div>
  );

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>Analytics — {target?.full_name || "Usuário"}</DialogTitle>
          <DialogDescription className="break-all">
            {target?.email} · {events.length} eventos registrados · {platform}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-16 flex items-center justify-center text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando…
          </div>
        ) : events.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Sem dados de uso ainda. O rastreamento começa quando o usuário abrir o app a partir desta atualização.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat icon={<Clock className="w-3.5 h-3.5" />} label="Minutos" value={String(minutes)} tint="text-blue-600" />
              <Stat icon={<Activity className="w-3.5 h-3.5" />} label="Sessões" value={String(sessions)} tint="text-violet-600" />
              <Stat icon={<MousePointerClick className="w-3.5 h-3.5" />} label="Páginas vistas" value={String(pageViews.length)} tint="text-emerald-600" />
              <Stat icon={<Bug className="w-3.5 h-3.5" />} label="Bugs" value={String(errors.length)} tint={errors.length ? "text-red-600" : "text-muted-foreground"} />
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full ${reachedHome ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                <Home className="w-3 h-3" /> {reachedHome ? "Chegou na Home (cadastro concluído)" : "Não chegou na Home"}
              </span>
              {first && <span className="px-2.5 py-1 rounded-full bg-muted text-muted-foreground">1º acesso: {fmt(first)}</span>}
              {last && <span className="px-2.5 py-1 rounded-full bg-muted text-muted-foreground">Último: {fmt(last)}</span>}
            </div>

            {topPages.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Páginas mais acessadas</p>
                <div className="space-y-1">
                  {topPages.map(([path, count]) => {
                    const friendly = prettyPath(path);
                    const showRaw = friendly === path;
                    return (
                      <div key={path} className="flex items-center justify-between text-sm border-b border-border/60 py-1">
                        <span className="text-foreground">{friendly}{showRaw ? <span className="text-muted-foreground text-xs"> {path}</span> : null}</span>
                        <span className="text-muted-foreground font-medium">{count}x</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {errors.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-red-600 mb-2">Bugs / erros</p>
                <div className="space-y-1">
                  {errors.slice(0, 10).map((e) => (
                    <div key={e.id} className="text-xs border border-red-200 bg-red-50 rounded-lg p-2">
                      <span className="text-red-700">{e.label || "Erro"}</span>
                      <span className="text-muted-foreground block">{prettyPath(e.path)} · {fmt(e.created_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">🔎 Pesquisou por</p>
              {searches.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma busca registrada.</p>
              ) : (
                <div className="space-y-1">
                  {searches.map((s, i) => (
                    <div key={`${s.query || ""}-${s.category || ""}-${i}`} className="flex items-center justify-between text-sm border-b border-border/60 py-1">
                      <span className="text-foreground">
                        {s.query || <span className="text-muted-foreground">(sem termo)</span>}
                        {s.category && <span className="text-muted-foreground text-xs"> · {s.category}</span>}
                      </span>
                      {s.count > 1 && <span className="text-muted-foreground font-medium">{s.count}x</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">👤 Perfis que visitou</p>
              {profileViews.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum perfil visitado.</p>
              ) : (
                <div className="space-y-1">
                  {profileViews.map((p, i) => (
                    <div key={`${p.name}-${i}`} className="flex items-center justify-between text-sm border-b border-border/60 py-1">
                      <span className="text-foreground">
                        {p.name}
                        {p.category && <span className="text-muted-foreground text-xs"> · {p.category}</span>}
                      </span>
                      {p.count > 1 && <span className="text-muted-foreground font-medium">{p.count}x</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Histórico (mais recentes)</p>
              <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                {events.slice(0, 60).map((e) => (
                  <div key={e.id} className="flex items-center justify-between text-xs border-b border-border/40 py-1">
                    <span className="text-foreground">
                      <span className="inline-block min-w-[92px] font-medium">{e.type}</span>
                      <span className="text-muted-foreground">{e.label || prettyPath(e.path)}</span>
                    </span>
                    <span className="text-muted-foreground whitespace-nowrap ml-2">{fmt(e.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
