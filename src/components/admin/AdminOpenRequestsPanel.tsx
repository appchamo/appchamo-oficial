import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Search, Send, Users, MapPin, Clock, Tag, User } from "lucide-react";
import { cn } from "@/lib/utils";

// ---- tipos ----
interface ReqRow {
  id: string;
  client_id: string;
  category_id: string;
  description: string;
  neighborhood: string | null;
  city: string;
  state: string;
  urgency: string;
  status: string;
  max_professional_interests: number | null;
  created_at: string;
  updated_at: string | null;
  categories?: { name: string | null } | null;
}
interface Recipient { open_request_id: string; professional_id: string; user_id: string | null; }
interface Interest { open_request_id: string; professional_id: string; }
interface ProInfo { name: string; slug: string | null; }

// ---- rótulos ----
const STATUS_LABEL: Record<string, string> = { open: "Aberto", filled: "Atendido", closed: "Encerrado" };
const STATUS_CLS: Record<string, string> = {
  open: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  filled: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  closed: "bg-muted text-muted-foreground border-border",
};
const URGENCY_LABEL: Record<string, string> = { now: "Agora", today: "Hoje", flexible: "Flexível" };
const fmtDateTime = (s: string) => new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtDate = (s: string) => new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

export default function AdminOpenRequestsPanel() {
  const [loading, setLoading] = useState(true);
  const [reqs, setReqs] = useState<ReqRow[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [interests, setInterests] = useState<Interest[]>([]);
  const [clientNames, setClientNames] = useState<Map<string, string>>(new Map());
  const [proInfo, setProInfo] = useState<Map<string, ProInfo>>(new Map());
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sel, setSel] = useState<ReqRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: r } = await supabase
          .from("open_service_requests" as never)
          .select("id, client_id, category_id, description, neighborhood, city, state, urgency, status, max_professional_interests, created_at, updated_at, categories(name)")
          .order("created_at", { ascending: false })
          .limit(500);
        const reqRows = ((r as unknown) as ReqRow[]) || [];
        const ids = reqRows.map((x) => x.id);

        const [{ data: rc }, { data: it }] = await Promise.all([
          ids.length
            ? supabase.from("open_request_recipients" as never).select("open_request_id, professional_id, user_id").in("open_request_id", ids).limit(20000)
            : Promise.resolve({ data: [] }),
          ids.length
            ? supabase.from("open_service_request_interests" as never).select("open_request_id, professional_id").in("open_request_id", ids).limit(20000)
            : Promise.resolve({ data: [] }),
        ]);
        const rcRows = ((rc as unknown) as Recipient[]) || [];
        const itRows = ((it as unknown) as Interest[]) || [];

        // resolver nomes: clientes (profiles) e profissionais (professionals -> profiles)
        const proIds = Array.from(new Set([...rcRows, ...itRows].map((x) => x.professional_id)));
        const { data: pros } = proIds.length
          ? await supabase.from("professionals" as never).select("id, user_id, slug").in("id", proIds).limit(20000)
          : { data: [] };
        const proRows = ((pros as unknown) as { id: string; user_id: string; slug: string | null }[]) || [];
        const clientIds = Array.from(new Set(reqRows.map((x) => x.client_id)));
        const proUserIds = proRows.map((p) => p.user_id);
        const allUserIds = Array.from(new Set([...clientIds, ...proUserIds]));
        const { data: profs } = allUserIds.length
          ? await supabase.from("profiles" as never).select("user_id, full_name").in("user_id", allUserIds).limit(20000)
          : { data: [] };
        const profRows = ((profs as unknown) as { user_id: string; full_name: string | null }[]) || [];
        const nameByUser = new Map(profRows.map((p) => [p.user_id, (p.full_name || "").trim()]));

        const cNames = new Map<string, string>();
        for (const cid of clientIds) cNames.set(cid, nameByUser.get(cid) || "Cliente");
        const pInfo = new Map<string, ProInfo>();
        for (const p of proRows) pInfo.set(p.id, { name: nameByUser.get(p.user_id) || "Profissional", slug: p.slug });

        if (cancelled) return;
        setReqs(reqRows);
        setRecipients(rcRows);
        setInterests(itRows);
        setClientNames(cNames);
        setProInfo(pInfo);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const recByReq = useMemo(() => {
    const m = new Map<string, Recipient[]>();
    for (const x of recipients) { if (!m.has(x.open_request_id)) m.set(x.open_request_id, []); m.get(x.open_request_id)!.push(x); }
    return m;
  }, [recipients]);
  const intByReq = useMemo(() => {
    const m = new Map<string, Interest[]>();
    for (const x of interests) { if (!m.has(x.open_request_id)) m.set(x.open_request_id, []); m.get(x.open_request_id)!.push(x); }
    return m;
  }, [interests]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return reqs.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!t) return true;
      const cat = (r.categories?.name || "").toLowerCase();
      const cli = (clientNames.get(r.client_id) || "").toLowerCase();
      return cat.includes(t) || cli.includes(t) || r.city.toLowerCase().includes(t) || (r.description || "").toLowerCase().includes(t);
    });
  }, [reqs, q, statusFilter, clientNames]);

  const totals = useMemo(() => ({
    total: reqs.length,
    open: reqs.filter((r) => r.status === "open").length,
    filled: reqs.filter((r) => r.status === "filled").length,
  }), [reqs]);

  const StatCard = ({ label, value }: { label: string; value: number }) => (
    <div className="bg-card border rounded-xl px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>;
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        <StatCard label="Pedidos" value={totals.total} />
        <StatCard label="Abertos" value={totals.open} />
        <StatCard label="Atendidos" value={totals.filled} />
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="flex-1 flex items-center gap-2 border rounded-xl px-3 py-2.5 bg-card focus-within:ring-2 focus-within:ring-primary/30">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por cliente, categoria, cidade ou descrição" className="flex-1 bg-transparent text-sm outline-none" />
        </div>
        <div className="flex items-center gap-1.5">
          {([["all", "Todos"], ["open", "Abertos"], ["filled", "Atendidos"], ["closed", "Encerrados"]] as [string, string][]).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setStatusFilter(id)}
              className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold border transition-colors",
                statusFilter === id ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:text-foreground hover:bg-muted/60")}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card border rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Nenhum pedido encontrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b bg-muted/30">
                  <th className="px-3 py-2.5 font-medium">Data</th>
                  <th className="px-3 py-2.5 font-medium">Cliente</th>
                  <th className="px-3 py-2.5 font-medium">Categoria</th>
                  <th className="px-3 py-2.5 font-medium">Cidade/UF</th>
                  <th className="px-3 py-2.5 font-medium">Urgência</th>
                  <th className="px-3 py-2.5 font-medium text-center">Enviados</th>
                  <th className="px-3 py-2.5 font-medium text-center">Interessados</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const sent = recByReq.get(r.id)?.length || 0;
                  const inter = intByReq.get(r.id)?.length || 0;
                  return (
                    <tr key={r.id} onClick={() => setSel(r)} className="border-b last:border-0 hover:bg-muted/40 cursor-pointer">
                      <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{fmtDate(r.created_at)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap font-medium">{clientNames.get(r.client_id) || "Cliente"}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{r.categories?.name || "—"}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{r.city}/{r.state}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{URGENCY_LABEL[r.urgency] || r.urgency}</td>
                      <td className="px-3 py-2.5 text-center font-semibold">{sent}</td>
                      <td className="px-3 py-2.5 text-center font-semibold">{inter}</td>
                      <td className="px-3 py-2.5">
                        <span className={cn("inline-block rounded-full border px-2 py-0.5 text-xs font-medium", STATUS_CLS[r.status] || STATUS_CLS.closed)}>
                          {STATUS_LABEL[r.status] || r.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {sel && (() => {
            const recs = recByReq.get(sel.id) || [];
            const ints = intByReq.get(sel.id) || [];
            const interestedIds = new Set(ints.map((x) => x.professional_id));
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="text-base">{sel.categories?.name || "Pedido"} · {sel.city}/{sel.state}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 text-sm">
                  <div className="rounded-lg bg-muted/40 border p-3">
                    <p className="whitespace-pre-wrap">{sel.description}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Info icon={User} label="Cliente" value={clientNames.get(sel.client_id) || "Cliente"} />
                    <Info icon={Tag} label="Categoria" value={sel.categories?.name || "—"} />
                    <Info icon={MapPin} label="Local" value={`${sel.neighborhood ? sel.neighborhood + ", " : ""}${sel.city}/${sel.state}`} />
                    <Info icon={Clock} label="Urgência" value={URGENCY_LABEL[sel.urgency] || sel.urgency} />
                    <Info icon={Send} label="Enviado para" value={`${recs.length} profissionais`} />
                    <Info icon={Users} label="Interessados" value={`${ints.length}${sel.max_professional_interests ? " / " + sel.max_professional_interests : ""}`} />
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>Criado: {fmtDateTime(sel.created_at)}</span>
                    <span className={cn("inline-block rounded-full border px-2 py-0.5 font-medium", STATUS_CLS[sel.status] || STATUS_CLS.closed)}>
                      {STATUS_LABEL[sel.status] || sel.status}
                    </span>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1.5">Profissionais que receberam ({recs.length})</p>
                    {recs.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nenhum registrado.</p>
                    ) : (
                      <div className="flex flex-col gap-1 max-h-52 overflow-y-auto">
                        {recs.map((rc) => {
                          const info = proInfo.get(rc.professional_id);
                          const isInterested = interestedIds.has(rc.professional_id);
                          return (
                            <div key={rc.professional_id} className="flex items-center justify-between rounded-md border px-2.5 py-1.5">
                              <span className="truncate">{info?.name || "Profissional"}</span>
                              {isInterested && <span className="shrink-0 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 px-2 py-0.5 text-[11px] font-medium">Interessado</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground leading-tight">{label}</p>
        <p className="font-medium leading-tight break-words">{value}</p>
      </div>
    </div>
  );
}
