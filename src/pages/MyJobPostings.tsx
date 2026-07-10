import AppLayout from "@/components/AppLayout";
import { Briefcase, Plus, Eye, EyeOff, Trash2, Users, ArrowLeft, Crown, MapPin, DollarSign, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { fetchViaCep } from "@/lib/viacep";

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
  const { user } = useAuth();
  const [jobs, setJobs] = useState<JobPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [proId, setProId] = useState<string | null>(null);
  const [sponsorId, setSponsorId] = useState<string | null>(null);
  // canPost: tem conta de profissional/empresa/patrocinador. unlimited: plano pago/admin/patrocinador.
  const [canPost, setCanPost] = useState(false);
  const [unlimited, setUnlimited] = useState(false);
  const FREE_JOB_LIMIT = 1;
  const [createOpen, setCreateOpen] = useState(false);
  const [appsOpen, setAppsOpen] = useState<string | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [form, setForm] = useState({
    title: "",
    description: "",
    cep: "",
    location: "", // "Cidade - UF"
    city: "",
    state: "",
    salary_range: "",
    requirements: "",
  });
  const [saving, setSaving] = useState(false);
  const [searchingCep, setSearchingCep] = useState(false);

  const fetchJobs = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;

    const { data: pro } = await supabase.from("professionals").select("id").eq("user_id", authUser.id).maybeSingle();
    const { data: spRow } = await supabase.from("sponsors").select("id").eq("user_id", authUser.id).maybeSingle();
    const sid = spRow?.id ?? null;
    setProId(pro?.id ?? null);
    setSponsorId(sid);

    if (!pro?.id && !sid) {
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase.from("profiles").select("user_type, job_posting_enabled").eq("user_id", authUser.id).maybeSingle();
    const { data: sub } = await supabase.from("subscriptions").select("plan_id, status").eq("user_id", authUser.id).maybeSingle();
    // Profissional ou empresa pode publicar (free = 1 vaga; pago = ilimitado).
    const isPaid = !!sub && ["pro", "vip", "business"].includes(String(sub.plan_id)) && String(sub.status || "").toLowerCase() === "active";
    const adminAllowedPost = profile?.job_posting_enabled === true;
    setCanPost(!!pro?.id || !!sid);
    setUnlimited(isPaid || adminAllowedPost || !!sid);

    const orFilter = [
      pro?.id ? `professional_id.eq.${pro.id}` : null,
      sid ? `sponsor_id.eq.${sid}` : null,
    ]
      .filter(Boolean)
      .join(",");

    const { data } = await supabase
      .from("job_postings")
      .select("*")
      .or(orFilter)
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

  const notifyJobPostingsChanged = () => {
    try {
      window.dispatchEvent(new Event("chamo-job-postings-changed"));
    } catch {
      void 0;
    }
  };

  useEffect(() => {
    void fetchJobs();
  }, [user?.id]);

  const formatCepInput = (val: string) => {
    const clean = val.replace(/\D/g, "").slice(0, 8);
    const masked = clean.replace(/^(\d{5})(\d)/, "$1-$2");
    return masked;
  };

  const handleCepChange = async (val: string) => {
    const masked = formatCepInput(val);
    const clean = val.replace(/\D/g, "").slice(0, 8);
    setForm((prev) => ({ ...prev, cep: masked }));

    if (clean.length !== 8) {
      setForm((prev) => ({ ...prev, location: "", city: "", state: "" }));
      return;
    }

    setSearchingCep(true);
    try {
      const data = await fetchViaCep(clean);
      if (!data?.localidade || !data?.uf) {
        toast({ title: "CEP não encontrado", description: "Verifique o CEP e tente novamente.", variant: "destructive" });
        setForm((prev) => ({ ...prev, location: "", city: "", state: "" }));
        return;
      }
      const city = data.localidade;
      const state = data.uf;
      setForm((prev) => ({
        ...prev,
        city,
        state,
        location: `${city}/${state}`,
      }));
    } catch {
      toast({ title: "Erro ao buscar CEP", variant: "destructive" });
      setForm((prev) => ({ ...prev, location: "", city: "", state: "" }));
    } finally {
      setSearchingCep(false);
    }
  };

  const handleCreate = async () => {
    if (!form.title) {
      toast({ title: "Informe o título da vaga.", variant: "destructive" });
      return;
    }
    if (!proId && !sponsorId) {
      toast({ title: "Não foi possível identificar a sua conta.", variant: "destructive" });
      return;
    }
    if (!form.location || !form.city || !form.state) {
      toast({ title: "Informe um CEP válido para definir a localização da vaga.", variant: "destructive" });
      return;
    }
    const activeCount = jobs.filter((j) => j.active).length;
    if (!unlimited && activeCount >= FREE_JOB_LIMIT) {
      toast({ title: "Limite do plano grátis", description: "No plano grátis você pode ter 1 vaga ativa. Assine um plano para publicar mais.", variant: "destructive" });
      navigate("/subscriptions");
      return;
    }
    setSaving(true);
    const uf = (form.state ?? "").trim().toUpperCase().slice(0, 2) || null;
    const row: Record<string, unknown> = {
      title: form.title,
      description: form.description || null,
      location: form.location || null,
      city: (form.city ?? "").trim() || null,
      state: uf,
      salary_range: form.salary_range || null,
      requirements: form.requirements || null,
    };
    if (proId) row.professional_id = proId;
    if (sponsorId && !proId) row.sponsor_id = sponsorId;

    const { data: createdJob, error } = await supabase
      .from("job_postings")
      .insert(row as any)
      .select("id")
      .maybeSingle();
    if (error || !createdJob?.id) {
      const isLimit = String(error?.message || "").includes("free_job_limit");
      toast(isLimit
        ? { title: "Limite do plano grátis", description: "No plano grátis você pode ter 1 vaga ativa. Assine um plano para publicar mais.", variant: "destructive" }
        : { title: "Erro ao criar vaga.", variant: "destructive" });
    } else {
      // Notificar usuários da mesma cidade
      try {
        const { data: authUser } = await supabase.auth.getUser();
        const publisherId = authUser?.user?.id;

        // Busca avatar do publicador para exibir na notificação push
        let publisherAvatar: string | null = null;
        let publisherName = "Alguém";
        if (publisherId) {
          const { data: pubProfile } = await supabase
            .from("profiles")
            .select("avatar_url, full_name, display_name")
            .eq("user_id", publisherId)
            .maybeSingle();
          const p = pubProfile as { avatar_url?: string | null; full_name?: string | null; display_name?: string | null } | null;
          publisherAvatar = p?.avatar_url ?? null;
          const dn = (p?.display_name ?? "").trim();
          const fn = (p?.full_name ?? "").trim();
          publisherName = dn || fn || publisherName;
        }

        // App focado em Patrocínio: notifica quem é da cidade da vaga
        // + quem ainda não definiu cidade no perfil (quase sempre locais).
        const [{ data: cityRec }, { data: noCityRec }] = await Promise.all([
          supabase.from("profiles").select("user_id")
            .eq("address_city", form.city)
            .eq("address_state", form.state)
            .neq("user_id", publisherId ?? ""),
          supabase.from("profiles").select("user_id")
            .or("address_city.is.null,address_city.eq.")
            .neq("user_id", publisherId ?? ""),
        ]);
        const seenIds = new Set<string>();
        const recipients = [...(cityRec || []), ...(noCityRec || [])].filter((r: any) => {
          if (!r?.user_id || seenIds.has(r.user_id)) return false;
          seenIds.add(r.user_id);
          return true;
        });

        const rows =
          (recipients || []).map((r: any) => ({
            user_id: r.user_id,
            title: `${publisherName} publicou uma vaga`,
            message: `Confira a nova vaga "${form.title}" na sua região.`,
            type: "job",
            link: `/jobs/${createdJob.id}`,
            image_url: publisherAvatar,
          })) || [];

        if (rows.length > 0) {
          await supabase.from("notifications").insert(rows as any);
        }
      } catch (e) {
        // Se falhar a notificação, a vaga já existe.
        console.warn("[MyJobPostings] Falha ao notificar usuários da cidade:", e);
      }

      toast({ title: "Vaga publicada!" });
      notifyJobPostingsChanged();
      setCreateOpen(false);
      setForm({ title: "", description: "", cep: "", location: "", city: "", state: "", salary_range: "", requirements: "" });
      fetchJobs();
    }
    setSaving(false);
  };

  const handleDelete = async (jobId: string) => {
    await supabase.from("job_postings").delete().eq("id", jobId);
    toast({ title: "Vaga removida." });
    notifyJobPostingsChanged();
    fetchJobs();
  };

  const handleToggle = async (jobId: string, active: boolean) => {
    // Reativar uma vaga estando no limite do plano grátis (já com 1 ativa) não é permitido.
    if (!active && !unlimited) {
      const activeCount = jobs.filter((j) => j.active).length;
      if (activeCount >= FREE_JOB_LIMIT) {
        toast({ title: "Limite do plano grátis", description: "No plano grátis você pode ter 1 vaga ativa. Pause a outra ou assine um plano.", variant: "destructive" });
        navigate("/subscriptions");
        return;
      }
    }
    const { error } = await supabase.from("job_postings").update({ active: !active }).eq("id", jobId);
    if (error) {
      const isLimit = String(error?.message || "").includes("free_job_limit");
      toast(isLimit
        ? { title: "Limite do plano grátis", description: "No plano grátis você pode ter 1 vaga ativa. Assine um plano para publicar mais.", variant: "destructive" }
        : { title: "Erro ao atualizar vaga.", variant: "destructive" });
      return;
    }
    toast({ title: active ? "Vaga pausada." : "Vaga ativada." });
    notifyJobPostingsChanged();
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
        <Link
          to={proId ? "/pro" : "/"}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground bg-muted hover:bg-muted/80 px-3 py-1.5 rounded-xl mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> {proId ? "Painel Profissional" : "Início"}
        </Link>

        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-foreground">Minhas Vagas</h1>
            <p className="text-xs text-muted-foreground">{jobs.length} vagas publicadas</p>
          </div>
          <button
            onClick={() => {
              if (!canPost) {
                toast({ title: "Disponível para profissionais e empresas", description: "Crie um perfil de profissional ou empresa para publicar vagas.", variant: "destructive" });
                return;
              }
              const activeCount = jobs.filter((j) => j.active).length;
              if (!unlimited && activeCount >= FREE_JOB_LIMIT) {
                toast({ title: "Limite do plano grátis", description: "No plano grátis você pode ter 1 vaga ativa. Assine um plano para publicar mais.", variant: "destructive" });
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

        {!loading && canPost && !unlimited && (
          <Link to="/subscriptions" className="flex items-center gap-3 p-4 rounded-2xl border border-primary/20 bg-primary/5 mb-5 hover:border-primary/40 transition-all">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Crown className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">Plano grátis: 1 vaga ativa</p>
              <p className="text-xs text-muted-foreground">Assine um plano e publique vagas ilimitadas</p>
            </div>
            <ChevronRight className="w-4 h-4 text-primary" />
          </Link>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : !proId && !sponsorId ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3 text-center px-4">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
              <Briefcase className="w-8 h-8 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium">Minhas vagas</p>
            <p className="text-xs max-w-xs">
              Disponível para profissionais e empresas. Crie seu perfil para publicar vagas.
            </p>
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
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">CEP *</label>
                  <input
                    value={form.cep}
                    onChange={(e) => handleCepChange(e.target.value)}
                    placeholder="00000-000"
                    inputMode="numeric"
                    className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  {searchingCep && <p className="text-[10px] text-muted-foreground mt-1">Buscando cidade...</p>}
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
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Cidade/UF</label>
                  <input
                    value={form.location}
                    disabled
                    placeholder="Preencha o CEP"
                    className="w-full border rounded-xl px-3 py-2.5 text-sm bg-muted/30 outline-none focus:ring-2 focus:ring-primary/10"
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
