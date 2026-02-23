import { useParams, Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { ArrowLeft, MapPin, DollarSign, Clock, Briefcase, Send, Upload } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface JobData {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  salary_range: string | null;
  requirements: string | null;
  created_at: string;
  professional_id: string;
  company_name: string;
  company_avatar: string | null;
  company_user_id: string;
}

const JobDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState<JobData | null>(null);
  const [loading, setLoading] = useState(true);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", description: "" });
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [alreadyApplied, setAlreadyApplied] = useState(false);

  // ✅ BLINDAGEM ANDROID: Reabre o modal se a página recarregar após o upload
  useEffect(() => {
    const savedJobId = localStorage.getItem('reopen_job_apply_id');
    if (savedJobId && savedJobId === id) {
      setApplyOpen(true);
      localStorage.removeItem('reopen_job_apply_id');
      toast({ title: "Retornando à candidatura..." });
    }
  }, [id]);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("job_postings")
        .select("id, title, description, location, salary_range, requirements, created_at, professional_id, professionals(user_id)")
        .eq("id", id!)
        .maybeSingle();

      if (data) {
        const proUserId = (data as any).professionals?.user_id;
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, avatar_url")
          .eq("user_id", proUserId)
          .maybeSingle();

        setJob({
          ...data,
          company_name: profile?.full_name || "Empresa",
          company_avatar: profile?.avatar_url || null,
          company_user_id: proUserId,
        });

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { count } = await supabase
            .from("job_applications")
            .select("*", { count: "exact", head: true })
            .eq("job_id", data.id)
            .eq("applicant_id", user.id);
          if ((count || 0) > 0) setAlreadyApplied(true);

          const { data: myProfile } = await supabase
            .from("profiles")
            .select("full_name, email, phone")
            .eq("user_id", user.id)
            .maybeSingle();
          if (myProfile) {
            setForm((f) => ({
              ...f,
              full_name: myProfile.full_name || "",
              email: myProfile.email || "",
              phone: myProfile.phone || "",
            }));
          }
        }
      }
      setLoading(false);
    };
    if (id) load();
  }, [id]);

  const handleApply = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate("/login"); return; }
    if (!job) return;
    if (!form.full_name || !form.email) {
      toast({ title: "Preencha nome e email.", variant: "destructive" });
      return;
    }

    setApplying(true);
    let resume_url: string | null = null;

    if (resumeFile) {
      const ext = resumeFile.name.split(".").pop() || "pdf";
      const path = `resumes/${user.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("uploads").upload(path, resumeFile, { 
        contentType: resumeFile.type,
        upsert: true,
      });
      if (uploadError) {
        toast({ title: "Erro ao enviar currículo.", variant: "destructive" });
        setApplying(false);
        return;
      }
      const { data: urlData } = supabase.storage.from("uploads").getPublicUrl(path);
      resume_url = urlData.publicUrl;
    }

    const { error } = await supabase.from("job_applications").insert({
      job_id: job.id,
      applicant_id: user.id,
      full_name: form.full_name,
      email: form.email,
      phone: form.phone || null,
      resume_url,
      description: form.description || null,
    });

    if (error) {
      toast({ title: "Erro ao enviar candidatura.", variant: "destructive" });
    } else {
      toast({ title: "Candidatura enviada com sucesso!" });
      setAlreadyApplied(true);
      setApplyOpen(false);

      if (job.company_user_id) {
        await supabase.from("notifications").insert({
          user_id: job.company_user_id,
          title: "Nova candidatura recebida",
          message: `${form.full_name} se candidatou à vaga "${job.title}"`,
          type: "job",
          link: "/my-jobs",
        });
      }
    }
    setApplying(false);
  };

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return "Hoje";
    if (days === 1) return "Ontem";
    return `${days} dias atrás`;
  };

  if (loading)
    return (
      <AppLayout>
        <main className="max-w-screen-lg mx-auto px-4 py-10 text-center text-muted-foreground">Carregando...</main>
      </AppLayout>
    );
  if (!job)
    return (
      <AppLayout>
        <main className="max-w-screen-lg mx-auto px-4 py-10 text-center text-muted-foreground">Vaga não encontrada</main>
      </AppLayout>
    );

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5">
        <Link to="/jobs" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>

        <div className="bg-card border rounded-2xl p-5 shadow-card mb-4">
          <div className="flex items-start gap-3 mb-4">
            {job.company_avatar ? (
              <img src={job.company_avatar} alt="" className="w-12 h-12 rounded-xl object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center">
                <Briefcase className="w-6 h-6 text-primary" />
              </div>
            )}
            <div>
              <h1 className="text-lg font-bold text-foreground">{job.title}</h1>
              <p className="text-sm text-muted-foreground">{job.company_name}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mb-4">
            {job.location && (
              <span className="flex items-center gap-1 bg-muted px-2.5 py-1 rounded-full">
                <MapPin className="w-3 h-3" /> {job.location}
              </span>
            )}
            {job.salary_range && (
              <span className="flex items-center gap-1 bg-muted px-2.5 py-1 rounded-full">
                <DollarSign className="w-3 h-3" /> {job.salary_range}
              </span>
            )}
            <span className="flex items-center gap-1 bg-muted px-2.5 py-1 rounded-full">
              <Clock className="w-3 h-3" /> {timeAgo(job.created_at)}
            </span>
          </div>

          {alreadyApplied ? (
            <div className="w-full py-2.5 rounded-xl border text-center text-sm font-medium text-muted-foreground">
              ✓ Candidatura enviada
            </div>
          ) : (
            <button
              onClick={() => setApplyOpen(true)}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" /> Candidatar-se
            </button>
          )}
        </div>

        {job.description && (
          <div className="bg-card border rounded-2xl p-5 shadow-card mb-4">
            <h2 className="font-semibold text-foreground mb-2">Descrição</h2>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{job.description}</p>
          </div>
        )}

        {job.requirements && (
          <div className="bg-card border rounded-2xl p-5 shadow-card mb-4">
            <h2 className="font-semibold text-foreground mb-2">Requisitos</h2>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{job.requirements}</p>
          </div>
        )}

        <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Candidatar-se</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome completo *</label>
                <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Email *</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Telefone</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Currículo (PDF, imagem)</label>
                {/* ✅ BLINDAGEM: Salva ID da vaga no localStorage ao clicar para abrir a galeria */}
                <label 
                  onClick={() => localStorage.setItem('reopen_job_apply_id', id || "")}
                  className="flex items-center gap-2 border rounded-xl px-3 py-2.5 cursor-pointer hover:bg-muted transition-colors"
                >
                  <Upload className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground truncate">{resumeFile ? resumeFile.name : "Selecionar arquivo"}</span>
                  <input 
                    type="file" 
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" 
                    className="hidden" 
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setResumeFile(file);
                      if (file) localStorage.removeItem('reopen_job_apply_id');
                    }} 
                  />
                </label>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Descrição</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Conte um pouco sobre você e por que deseja esta vaga..." className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
              </div>
              <button onClick={handleApply} disabled={applying} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50">
                {applying ? "Enviando..." : "Enviar candidatura"}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </AppLayout>
  );
};

export default JobDetail;