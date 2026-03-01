import AppLayout from "@/components/AppLayout";
import { Briefcase, MapPin, DollarSign, Clock, Search, Building2, ChevronRight, FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface JobPosting {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  salary_range: string | null;
  created_at: string;
  company_name: string;
  company_avatar: string | null;
}

interface MyApplication {
  id: string;
  job_id: string;
  created_at: string;
  description: string | null;
  job_title: string;
  job_location: string | null;
  job_salary_range: string | null;
  company_name: string;
}

const Jobs = () => {
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [myCandidaturasOpen, setMyCandidaturasOpen] = useState(false);
  const [myApplications, setMyApplications] = useState<MyApplication[]>([]);
  const [loadingMyApps, setLoadingMyApps] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("job_postings")
        .select("id, title, description, location, salary_range, created_at, professionals(user_id)")
        .eq("active", true)
        .order("created_at", { ascending: false });

      if (data) {
        const userIds = data.map((j: any) => j.professionals?.user_id).filter(Boolean);
        const { data: profiles } = await supabase
          .from("profiles_public" as any)
          .select("user_id, full_name, avatar_url")
          .in("user_id", userIds) as { data: { user_id: string; full_name: string; avatar_url: string | null }[] | null };

        const mapped = data.map((j: any) => {
          const prof = profiles?.find((p) => p.user_id === j.professionals?.user_id);
          return {
            id: j.id,
            title: j.title,
            description: j.description,
            location: j.location,
            salary_range: j.salary_range,
            created_at: j.created_at,
            company_name: prof?.full_name || "Empresa",
            company_avatar: prof?.avatar_url || null,
          };
        });
        setJobs(mapped);
      }
      setLoading(false);
    };
    load();
  }, []);

  const filtered = jobs.filter(
    (j) =>
      j.title.toLowerCase().includes(search.toLowerCase()) ||
      j.company_name.toLowerCase().includes(search.toLowerCase()) ||
      (j.location || "").toLowerCase().includes(search.toLowerCase())
  );

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return "Agora";
    if (hours < 24) return `${hours}h atrás`;
    const days = Math.floor(diff / 86400000);
    if (days === 1) return "Ontem";
    return `${days}d atrás`;
  };

  const loadMyCandidaturas = async () => {
    setMyCandidaturasOpen(true);
    setLoadingMyApps(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoadingMyApps(false);
      return;
    }
    const { data: apps } = await supabase
      .from("job_applications")
      .select("id, job_id, created_at, description")
      .eq("applicant_id", user.id)
      .order("created_at", { ascending: false });
    if (!apps?.length) {
      setMyApplications([]);
      setLoadingMyApps(false);
      return;
    }
    const jobIds = [...new Set((apps as { job_id: string }[]).map((a) => a.job_id))];
    const { data: jobRows } = await supabase
      .from("job_postings")
      .select("id, title, location, salary_range, professional_id")
      .in("id", jobIds);
    const proIds = [...new Set((jobRows || []).map((j: any) => j.professional_id).filter(Boolean))];
    let companyMap: Record<string, string> = {};
    if (proIds.length > 0) {
      const { data: pros } = await supabase.from("professionals").select("id, user_id").in("id", proIds);
      const userIds = (pros || []).map((p: any) => p.user_id);
      const { data: profiles } = await supabase.from("profiles_public" as any).select("user_id, full_name").in("user_id", userIds);
      const userToName = new Map((profiles || []).map((p: any) => [p.user_id, p.full_name || "Empresa"]));
      companyMap = Object.fromEntries((pros || []).map((p: any) => [p.id, userToName.get(p.user_id) || "Empresa"]));
    }
    const jobMap = Object.fromEntries((jobRows || []).map((j: any) => [j.id, j]));
    const result: MyApplication[] = (apps as { id: string; job_id: string; created_at: string; description: string | null }[]).map((a) => {
      const job = jobMap[a.job_id];
      return {
        id: a.id,
        job_id: a.job_id,
        created_at: a.created_at,
        description: a.description,
        job_title: job?.title ?? "Vaga",
        job_location: job?.location ?? null,
        job_salary_range: job?.salary_range ?? null,
        company_name: job ? companyMap[job.professional_id] ?? "Empresa" : "Empresa",
      };
    });
    setMyApplications(result);
    setLoadingMyApps(false);
  };

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-bold text-foreground">Vagas</h1>
            <p className="text-xs text-muted-foreground">{filtered.length} oportunidades</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl gap-1.5"
              onClick={loadMyCandidaturas}
            >
              <FileText className="w-3.5 h-3.5" />
              Minhas candidaturas
            </Button>
            <Badge variant="secondary" className="text-xs gap-1">
              <Briefcase className="w-3 h-3" /> {jobs.length}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-2 border rounded-xl px-3 py-2.5 bg-card focus-within:ring-2 focus-within:ring-primary/30 mb-5">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar vagas, empresas ou cidades..."
            className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
              <Briefcase className="w-8 h-8 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium">Nenhuma vaga disponível</p>
            <p className="text-xs">Volte em breve para novas oportunidades</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((job) => (
              <Link
                key={job.id}
                to={`/jobs/${job.id}`}
                className="flex items-center gap-3 bg-card border rounded-2xl p-4 hover:border-primary/30 hover:shadow-card transition-all active:scale-[0.99]"
              >
                {job.company_avatar ? (
                  <img src={job.company_avatar} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-6 h-6 text-primary" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground text-sm truncate">{job.title}</h3>
                  <p className="text-xs text-muted-foreground truncate">{job.company_name}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    {job.location && (
                      <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        <MapPin className="w-2.5 h-2.5" /> {job.location}
                      </span>
                    )}
                    {job.salary_range && (
                      <span className="flex items-center gap-0.5 text-[11px] text-primary font-medium bg-primary/10 px-2 py-0.5 rounded-full">
                        <DollarSign className="w-2.5 h-2.5" /> {job.salary_range}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground">{timeAgo(job.created_at)}</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              </Link>
            ))}
          </div>
        )}

        <Dialog open={myCandidaturasOpen} onOpenChange={setMyCandidaturasOpen}>
          <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto rounded-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                Minhas candidaturas
              </DialogTitle>
            </DialogHeader>
            {loadingMyApps ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
              </div>
            ) : myApplications.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-muted-foreground gap-2">
                <FileText className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-sm">Você ainda não se candidatou a nenhuma vaga</p>
                <p className="text-xs">Explore as vagas acima e candidate-se</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {myApplications.map((app) => (
                  <Link
                    key={app.id}
                    to={`/jobs/${app.job_id}`}
                    onClick={() => setMyCandidaturasOpen(false)}
                    className="flex flex-col gap-1 border rounded-xl p-4 hover:bg-muted/30 transition-colors text-left"
                  >
                    <p className="font-semibold text-sm text-foreground">{app.job_title}</p>
                    <p className="text-xs text-muted-foreground">{app.company_name}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      {app.job_location && (
                        <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                          <MapPin className="w-2.5 h-2.5" /> {app.job_location}
                        </span>
                      )}
                      {app.job_salary_range && (
                        <span className="flex items-center gap-0.5 text-[11px] text-primary font-medium">
                          <DollarSign className="w-2.5 h-2.5" /> {app.job_salary_range}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Candidatura em {new Date(app.created_at).toLocaleDateString("pt-BR")}
                    </p>
                    <span className="text-xs text-primary font-medium mt-1 inline-flex items-center gap-0.5">
                      Ver vaga <ChevronRight className="w-3 h-3" />
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </AppLayout>
  );
};

export default Jobs;
