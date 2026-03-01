import AppLayout from "@/components/AppLayout";
import { Briefcase, Plus, Eye, EyeOff, Trash2, Users, ArrowLeft, Crown, MapPin, DollarSign, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Link, useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

interface JobPost {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  salary_range: string | null;
  requirements: string | null;
  active: boolean;
  created_at: string;
  applications_count: number;
}

interface Application {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  resume_url: string | null;
  description: string | null;
  status: string;
  created_at: string;
}

const MyJobPostings = () => {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [proId, setProId] = useState<string | null>(null);
  const [isBusinessPlan, setIsBusinessPlan] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [appsOpen, setAppsOpen] = useState<string | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [form, setForm] = useState({ title: "", description: "", location: "", salary_range: "", requirements: "" });
  const [saving, setSaving] = useState(false);

  const fetchJobs = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: pro } = await supabase.from("professionals").select("id").eq("user_id", user.id).maybeSingle();
    if (!pro) {
      setLoading(false);
      return;
    }
    setProId(pro.id);

    const { data: profile } = await supabase.from("profiles").select("user_type, job_posting_enabled").eq("user_id", user.id).maybeSingle();
    const { data: sub } = await supabase.from("subscriptions").select("plan_id").eq("user_id", user.id).maybeSingle();
    const businessCanPost = sub?.plan_id === "business" && profile?.user_type === "company";
    const adminAllowedPost = profile?.job_posting_enabled === true;
    setIsBusinessPlan(businessCanPost || adminAllowedPost);

    const { data } = await supabase
      .from("job_postings")
      .select("*")
      .eq("professional_id", pro.id)
      .order("created_at", { ascending: false });

    if (data) {
      const jobsWithCounts = await Promise.all(
        data.map(async (j: any) => {
          const { count } = await supabase
            .from("job_applications")
            .select("*", { count: "exact", head: true })
            .eq("job_id", j.id);
          return { ...j, applications_count: count || 0 };
        })
      );
      setJobs(jobsWithCounts);
    }
    setLoading(false);
  };

  useEffect(() => { fetchJobs(); }, []);

  const handleCreate = async () => {
    if (!proId || !form.title) {
      toast({ title: "Informe o título da vaga.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("job_postings").insert({
      professional_id: proId,
      title: form.title,
      description: form.description || null,
      location: form.location || null,
      salary_range: form.salary_range || null,
      requirements: form.requirements || null,
    });
    if (error) {
      toast({ title: "Erro ao criar vaga.", variant: "destructive" });
    } else {
      toast({ title: "Vaga publicada!" });
      setCreateOpen(false);
      setForm({ title: "", description: "", location: "", salary_range: "", requirements: "" });
      fetchJobs();
    }
    setSaving(false);
  };

  const handleDelete = async (jobId: string) => {
    await supabase.from("job_postings").delete().eq("id", jobId);
    toast({ title: "Vaga removida." });
    fetchJobs();
  };

  const handleToggle = async (jobId: string, active: boolean) => {
    await supabase.from("job_postings").update({ active: !active }).eq("id", jobId);
    toast({ title: active ? "Vaga pausada." : "Vaga ativada." });
    fetchJobs();
  };

  const openApplications = async (jobId: string) => {
    setAppsOpen(jobId);
    const { data } = await supabase
      .from("job_applications")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });
    setApplications((data || []) as Application[]);
  };

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5">
        <Link to="/pro" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Painel Profissional
        </Link>

        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-foreground">Minhas Vagas</h1>
            <p className="text-xs text-muted-foreground">{jobs.length} vagas publicadas</p>
          </div>
          <button
            onClick={() => {
              if (!isBusinessPlan) {
                toast({ title: "Recurso exclusivo do plano Business", description: "Faça upgrade para publicar vagas.", variant: "destructive" });
                navigate("/subscriptions");
                return;
              }
              setCreateOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /> Nova Vaga
          </button>
        </div>

        {!loading && proId && !isBusinessPlan && (
          <Link to="/subscriptions" className="flex items-center gap-3 p-4 rounded-2xl border border-primary/20 bg-primary/5 mb-5 hover:border-primary/40 transition-all">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Crown className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">Plano Business</p>
              <p className="text-xs text-muted-foreground">Faça upgrade para publicar vagas</p>
            </div>
            <ChevronRight className="w-4 h-4 text-primary" />
          </Link>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : !proId ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
              <Briefcase className="w-8 h-8 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium">Recurso para contas Business</p>
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
              <Briefcase className="w-8 h-8 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium">Nenhuma vaga publicada</p>
            <p className="text-xs">Clique em "Nova Vaga" para começar</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {jobs.map((job) => (
              <div key={job.id} className="bg-card border rounded-2xl overflow-hidden shadow-card">
                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-foreground truncate">{job.title}</h3>
                        <Badge variant={job.active ? "default" : "secondary"} className="text-[10px] flex-shrink-0">
                          {job.active ? "Ativa" : "Pausada"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {job.location && (
                          <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                            <MapPin className="w-2.5 h-2.5" /> {job.location}
                          </span>
                        )}
                        {job.salary_range && (
                          <span className="flex items-center gap-0.5 text-[11px] text-primary font-medium">
                            <DollarSign className="w-2.5 h-2.5" /> {job.salary_range}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(job.created_at).toLocaleDateString("pt-BR")}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex border-t divide-x">
                  <button
                    onClick={() => openApplications(job.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-primary hover:bg-muted/50 transition-colors"
                  >
                    <Users className="w-3.5 h-3.5" /> {job.applications_count} candidatura{job.applications_count !== 1 ? "s" : ""}
                  </button>
                  <button
                    onClick={() => handleToggle(job.id, job.active)}
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
                  >
                    {job.active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {job.active ? "Pausar" : "Ativar"}
                  </button>
                  <button
                    onClick={() => handleDelete(job.id)}
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium text-destructive hover:bg-destructive/5 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Briefcase className="w-4 h-4 text-primary" />
                </div>
                Publicar Vaga
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Título da vaga *</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Ex: Eletricista residencial"
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Descrição</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Localização</label>
                  <input
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="São Paulo, SP"
                    className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Faixa salarial</label>
                  <input
                    value={form.salary_range}
                    onChange={(e) => setForm({ ...form, salary_range: e.target.value })}
                    placeholder="R$ 2.000 - 3.500"
                    className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Requisitos</label>
                <textarea
                  value={form.requirements}
                  onChange={(e) => setForm({ ...form, requirements: e.target.value })}
                  rows={2}
                  placeholder="Liste os requisitos..."
                  className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
              </div>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? "Publicando..." : "Publicar vaga"}
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Applications Dialog */}
        <Dialog open={!!appsOpen} onOpenChange={(o) => !o && setAppsOpen(null)}>
          <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Candidaturas</DialogTitle>
            </DialogHeader>
            {applications.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-muted-foreground gap-2">
                <Users className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-sm">Nenhuma candidatura recebida</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {applications.map((app) => (
                  <div key={app.id} className="border rounded-xl p-4 space-y-1">
                    <p className="font-semibold text-sm text-foreground">{app.full_name}</p>
                    <p className="text-xs text-muted-foreground">{app.email}{app.phone ? ` · ${app.phone}` : ""}</p>
                    {app.description && <p className="text-xs text-muted-foreground mt-1.5">{app.description}</p>}
                    {app.resume_url && (
                      <a href={app.resume_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1">
                        📄 Ver currículo
                      </a>
                    )}
                    <p className="text-[10px] text-muted-foreground">{new Date(app.created_at).toLocaleDateString("pt-BR")}</p>
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </AppLayout>
  );
};

export default MyJobPostings;
