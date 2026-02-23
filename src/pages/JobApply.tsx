import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { ArrowLeft, Send, Upload, Loader2, FileText } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const JobApply = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [jobOwnerId, setJobOwnerId] = useState<string | null>(null);
  const [jobTitle, setJobTitle] = useState("");
  
  const [form, setForm] = useState(() => {
    const saved = localStorage.getItem(`job_form_${id}`);
    return saved ? JSON.parse(saved) : { full_name: "", email: "", phone: "", description: "" };
  });

  useEffect(() => {
    localStorage.setItem(`job_form_${id}`, JSON.stringify(form));
  }, [form, id]);

  useEffect(() => {
    const loadData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/login");
        return;
      }
      
      const { data: jobData } = await supabase
        .from("job_postings")
        .select("title, professionals(user_id)")
        .eq("id", id!)
        .maybeSingle();

      if (jobData) {
        setJobTitle(jobData.title);
        setJobOwnerId((jobData as any).professionals?.user_id);
      }

      if (!form.full_name) {
        const { data: profile } = await supabase.from("profiles").select("full_name, email, phone").eq("user_id", user.id).maybeSingle();
        if (profile) {
          setForm((f: any) => ({ 
            ...f, 
            full_name: profile.full_name || "", 
            email: profile.email || "", 
            phone: profile.phone || "" 
          }));
        }
      }
      setLoading(false);
    };
    loadData();
  }, [id, navigate]);

  // ✅ TRAVA DE SEGURANÇA: Só aceita PDF
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast({ 
        title: "Arquivo inválido", 
        description: "Por favor, selecione apenas arquivos em formato PDF.", 
        variant: "destructive" 
      });
      e.target.value = ""; // Limpa o campo
      setResumeFile(null);
      return;
    }

    setResumeFile(file);
  };

  const handleApply = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !id) return;

    if (!form.full_name || !form.email || !form.phone) {
      toast({ title: "Preencha nome, email e telefone.", variant: "destructive" });
      return;
    }

    if (!resumeFile) {
      toast({ title: "O envio do currículo em PDF é obrigatório.", variant: "destructive" });
      return;
    }

    setApplying(true);
    
    try {
      const ext = resumeFile.name.split(".").pop();
      const path = `resumes/${user.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("uploads").upload(path, resumeFile);
      
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("uploads").getPublicUrl(path);

      const { error: insertError } = await supabase.from("job_applications").insert({
        job_id: id,
        applicant_id: user.id,
        full_name: form.full_name,
        email: form.email,
        phone: form.phone,
        resume_url: urlData.publicUrl,
        description: form.description || null,
      });

      if (insertError) throw insertError;

      if (jobOwnerId) {
        await supabase.from("notifications").insert({
          user_id: jobOwnerId,
          title: "Nova candidatura recebida",
          message: `${form.full_name} se candidatou para ${jobTitle}`,
          type: "job",
          link: "/my-jobs",
        } as any);
      }

      toast({ title: "Candidatura enviada com sucesso!" });
      localStorage.removeItem(`job_form_${id}`);
      navigate(`/jobs/${id}`);

    } catch (err) {
      toast({ title: "Erro ao processar candidatura.", variant: "destructive" });
    } finally {
      setApplying(false);
    }
  };

  if (loading) return <div className="p-10 text-center text-muted-foreground">Carregando formulário...</div>;

  return (
    <AppLayout>
      <main className="max-w-md mx-auto px-4 py-5">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>

        <h1 className="text-xl font-bold mb-6 text-foreground text-center">Finalizar Candidatura</h1>

        <div className="space-y-4 bg-card border p-5 rounded-2xl shadow-sm">
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase ml-1 block mb-1">Nome completo *</label>
            <input 
                value={form.full_name} 
                onChange={e => setForm({...form, full_name: e.target.value})} 
                className="w-full border rounded-xl px-4 py-3 bg-background outline-none focus:ring-2 focus:ring-primary/30" 
            />
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase ml-1 block mb-1">E-mail de contato *</label>
              <input 
                  type="email"
                  value={form.email} 
                  onChange={e => setForm({...form, email: e.target.value})} 
                  className="w-full border rounded-xl px-4 py-3 bg-background outline-none focus:ring-2 focus:ring-primary/30" 
              />
            </div>
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase ml-1 block mb-1">Telefone / WhatsApp *</label>
              <input 
                  type="tel"
                  value={form.phone} 
                  onChange={e => setForm({...form, phone: e.target.value})} 
                  className="w-full border rounded-xl px-4 py-3 bg-background outline-none focus:ring-2 focus:ring-primary/30" 
              />
            </div>
          </div>
          
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase ml-1 block mb-1">Currículo (PDF obrigatório) *</label>
            <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-6 cursor-pointer transition-all ${resumeFile ? 'border-primary bg-primary/5' : 'border-muted-foreground/20 hover:bg-muted/50'}`}>
              {resumeFile ? <FileText className="w-8 h-8 text-primary" /> : <Upload className="w-8 h-8 text-muted-foreground" />}
              <span className="text-sm font-medium text-foreground text-center px-2 truncate max-w-full">
                {resumeFile ? resumeFile.name : "Selecionar PDF"}
              </span>
              <input 
                type="file" 
                className="hidden" 
                accept="application/pdf" 
                onChange={handleFileChange} // ✅ Usando a função com a trava
              />
            </label>
          </div>

          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase ml-1 block mb-1">Apresentação adicional</label>
            <textarea 
                value={form.description} 
                onChange={e => setForm({...form, description: e.target.value})} 
                rows={3} 
                className="w-full border rounded-xl px-4 py-3 bg-background outline-none focus:ring-2 focus:ring-primary/30 resize-none" 
            />
          </div>

          <button 
            onClick={handleApply} 
            disabled={applying}
            className="w-full py-4 bg-primary text-primary-foreground rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {applying ? <Loader2 className="animate-spin w-5 h-5" /> : "Enviar Candidatura"}
          </button>
        </div>
      </main>
    </AppLayout>
  );
};

export default JobApply;