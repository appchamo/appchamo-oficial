import AdminLayout from "@/components/AdminLayout";
import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, MessageCircle, MessageSquare, AtSign, Heart, Megaphone } from "lucide-react";

type IgRow = {
  id: number;
  kind: string;
  from_username: string | null;
  from_id: string | null;
  incoming_text: string | null;
  reply_text: string | null;
  action: string | null;
  status: string | null;
  error: string | null;
  created_at: string;
};

const KIND = {
  dm:       { label: "Direct",     Icon: MessageCircle,  cls: "bg-primary/10 text-primary" },
  comment:  { label: "Comentário", Icon: MessageSquare,  cls: "bg-emerald-500/10 text-emerald-600" },
  mention:  { label: "Menção",     Icon: AtSign,         cls: "bg-violet-500/10 text-violet-600" },
  reaction: { label: "Reação",     Icon: Heart,          cls: "bg-pink-500/10 text-pink-600" },
  referral: { label: "Anúncio",    Icon: Megaphone,      cls: "bg-amber-500/10 text-amber-600" },
} as const;

const kindOf = (k: string) => (KIND as any)[k] || { label: k, Icon: MessageCircle, cls: "bg-muted text-muted-foreground" };

const statusBadge = (s: string | null) => {
  switch (s) {
    case "sent":    return { t: "Respondido", cls: "bg-emerald-500/15 text-emerald-600" };
    case "skipped": return { t: "Ignorado",   cls: "bg-muted text-muted-foreground" };
    case "logged":  return { t: "Registrado", cls: "bg-blue-500/10 text-blue-600" };
    case "error":   return { t: "Erro",        cls: "bg-destructive/10 text-destructive" };
    default:        return { t: "Processando", cls: "bg-amber-500/10 text-amber-600" };
  }
};

const fmt = (d: string) => new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const FILTERS = [
  { key: "all", label: "Tudo" },
  { key: "dm", label: "Direct" },
  { key: "comment", label: "Comentários" },
  { key: "mention", label: "Menções" },
  { key: "reaction", label: "Reações" },
  { key: "referral", label: "Anúncios" },
];

const AdminInstagram = () => {
  const [rows, setRows] = useState<IgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("ig_interactions")
      .select("id, kind, from_username, from_id, incoming_text, reply_text, action, status, error, created_at")
      .order("created_at", { ascending: false })
      .limit(300);
    setRows((data as IgRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => ({
    total: rows.length,
    respondidas: rows.filter((r) => r.status === "sent").length,
    ignoradas: rows.filter((r) => r.status === "skipped").length,
    erros: rows.filter((r) => r.status === "error").length,
  }), [rows]);

  const filtered = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => r.kind === filter)),
    [rows, filter],
  );

  return (
    <AdminLayout title="Instagram (IA)">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">Direct, comentários e menções respondidos automaticamente pela IA no @appchamo.</p>
        <button onClick={load} className="flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { n: stats.total, l: "Interações" },
          { n: stats.respondidas, l: "Respondidas" },
          { n: stats.ignoradas, l: "Ignoradas" },
          { n: stats.erros, l: "Erros" },
        ].map((s) => (
          <div key={s.l} className="bg-card border rounded-2xl p-4 text-center shadow-card">
            <p className="text-2xl font-bold text-foreground">{s.n}</p>
            <p className="text-xs text-muted-foreground">{s.l}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${filter === f.key ? "bg-primary text-primary-foreground" : "bg-card border text-foreground"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">Nenhuma interação ainda. Assim que chegar um direct ou comentário no @appchamo, aparece aqui.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((r) => {
            const k = kindOf(r.kind);
            const st = statusBadge(r.status);
            return (
              <div key={r.id} className="bg-card border rounded-xl p-3.5">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${k.cls}`}><k.Icon className="w-4 h-4" /></span>
                    <span className="text-sm font-semibold text-foreground">{k.label}</span>
                    {r.from_username && <span className="text-xs text-muted-foreground truncate">@{r.from_username}</span>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.cls}`}>{st.t}</span>
                    <span className="text-[10px] text-muted-foreground">{fmt(r.created_at)}</span>
                  </div>
                </div>
                {r.incoming_text && <p className="text-sm text-foreground/90">{r.incoming_text}</p>}
                {r.reply_text && (
                  <div className="mt-2 pl-3 border-l-2 border-primary/30">
                    <p className="text-[10px] font-semibold text-primary uppercase mb-0.5">Resposta da IA</p>
                    <p className="text-sm text-muted-foreground">{r.reply_text}</p>
                  </div>
                )}
                {r.error && <p className="mt-1.5 text-[11px] text-destructive">Erro: {r.error}</p>}
              </div>
            );
          })}
        </div>
      )}
    </AdminLayout>
  );
};

export default AdminInstagram;
