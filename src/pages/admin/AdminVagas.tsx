import AdminLayout from "@/components/AdminLayout";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Briefcase, Trash2, Eye, EyeOff, Search, Loader2, Users } from "lucide-react";

interface JobRow {
  id: string; title: string; description: string | null; active: boolean; created_at: string;
  city: string | null; state: string | null; salary_range: string | null;
  professional_id: string | null; sponsor_id: string | null;
}

const AdminVagas = () => {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [owners, setOwners] = useState<Record<string, string>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("job_postings")
        .select("id, title, description, active, created_at, city, state, salary_range, professional_id, sponsor_id")
        .order("created_at", { ascending: false })
        .limit(1000);
      const list = (data || []) as JobRow[];
      setJobs(list);

      const proIds = [...new Set(list.map((j) => j.professional_id).filter(Boolean))] as string[];
      const spIds = [...new Set(list.map((j) => j.sponsor_id).filter(Boolean))] as string[];
      const [{ data: pros }, { data: sps }] = await Promise.all([
        proIds.length ? supabase.from("professionals").select("id, user_id").in("id", proIds) : Promise.resolve({ data: [] as any[] }),
        spIds.length ? supabase.from("sponsors").select("id, user_id").in("id", spIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      const proMap = new Map((pros || []).map((p: any) => [p.id, p.user_id]));
      const spMap = new Map((sps || []).map((s: any) => [s.id, s.user_id]));
      const userIds = [...new Set([...(pros || []).map((p: any) => p.user_id), ...(sps || []).map((s: any) => s.user_id)])];
      const { data: profs } = userIds.length ? await supabase.from("profiles").select("user_id, full_name").in("user_id", userIds) : { data: [] as any[] };
      const nameByUser = new Map((profs || []).map((p: any) => [p.user_id, (p.full_name || "").trim() || "—"]));
      const ownMap: Record<string, string> = {};
      for (const j of list) {
        const uid = j.professional_id ? proMap.get(j.professional_id) : j.sponsor_id ? spMap.get(j.sponsor_id) : null;
        ownMap[j.id] = uid ? (nameByUser.get(uid) || "—") : "—";
      }
      setOwners(ownMap);

      const ids = list.map((j) => j.id);
      if (ids.length) {
        const { data: apps } = await supabase.from("job_applications").select("job_id").in("job_id", ids);
        const c: Record<string, number> = {};
        for (const a of (apps || []) as any[]) c[a.job_id] = (c[a.job_id] || 0) + 1;
        setCounts(c);
      }
    } catch (e) {
      toast({ title: "Erro ao carregar vagas", description: (e as Error)?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return jobs;
    return jobs.filter((j) =>
      (j.title || "").toLowerCase().includes(t) ||
      (owners[j.id] || "").toLowerCase().includes(t) ||
      (j.city || "").toLowerCase().includes(t));
  }, [jobs, q, owners]);

  const toggleActive = async (j: JobRow) => {
    setBusy(j.id);
    const { error } = await supabase.from("job_postings").update({ active: !j.active }).eq("id", j.id);
    setBusy(null);
    if (error) { toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" }); return; }
    setJobs((prev) => prev.map((x) => (x.id === j.id ? { ...x, active: !x.active } : x)));
    toast({ title: j.active ? "Vaga pausada." : "Vaga ativada." });
  };
  const del = async (id: string) => {
    setBusy(id);
    const { error } = await supabase.from("job_postings").delete().eq("id", id);
    setBusy(null);
    if (error) { toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" }); return; }
    setJobs((prev) => prev.filter((x) => x.id !== id));
    setConfirmDel(null);
    toast({ title: "Vaga excluída." });
  };

  return (
    <AdminLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5">
        <h1 className="text-xl font-bold mb-1 flex items-center gap-2"><Briefcase className="w-6 h-6 text-primary" /> Vagas</h1>
        <p className="text-sm text-muted-foreground mb-4">Gerencie e modere as vagas de emprego · {jobs.length} no total.</p>
        <div className="flex items-center gap-2 border rounded-xl px-3 py-2.5 bg-card mb-4">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por título, dono ou cidade" className="flex-1 bg-transparent text-sm outline-none" />
        </div>
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Nenhuma vaga encontrada.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((j) => (
              <div key={j.id} className="border rounded-2xl bg-card p-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-foreground truncate">{j.title}</h3>
                  <span className={`text-[10px] rounded-full px-2 py-0.5 font-medium ${j.active ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>{j.active ? "Ativa" : "Pausada"}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Por {owners[j.id] || "—"} · {[j.city, j.state].filter(Boolean).join("/")} · {new Date(j.created_at).toLocaleDateString("pt-BR")}
                </p>
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><Users className="w-3 h-3" /> {counts[j.id] || 0} candidatura(s)</p>
                {j.description ? <p className="text-sm text-foreground mt-2 line-clamp-2 whitespace-pre-wrap">{j.description}</p> : null}
                <div className="flex gap-2 mt-3">
                  <button onClick={() => toggleActive(j)} disabled={busy === j.id} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted/60 disabled:opacity-50">
                    {j.active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />} {j.active ? "Pausar" : "Ativar"}
                  </button>
                  {confirmDel === j.id ? (
                    <div className="flex-1 flex gap-2">
                      <button onClick={() => setConfirmDel(null)} className="flex-1 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted/60">Cancelar</button>
                      <button onClick={() => del(j.id)} disabled={busy === j.id} className="flex-1 rounded-lg bg-destructive text-destructive-foreground px-3 py-2 text-sm font-semibold hover:bg-destructive/90">{busy === j.id ? "..." : "Confirmar"}</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDel(j.id)} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-destructive/30 text-destructive px-3 py-2 text-sm font-semibold hover:bg-destructive/5">
                      <Trash2 className="w-4 h-4" /> Excluir
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </AdminLayout>
  );
};

export default AdminVagas;
