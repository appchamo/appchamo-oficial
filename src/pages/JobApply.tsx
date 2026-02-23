import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { ArrowLeft, Send, Upload, Loader2 } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const JobApply = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  
  // Aqui ele tenta recuperar o que você já digitou caso a página atualize
  const [form, setForm] = useState(() => {
    const saved = localStorage.getItem(`job_form_${id}`);
    return saved ? JSON.parse(saved) : { full_name: "", email: "", phone: "", description: "" };
  });

  // Toda vez que você digita, ele salva no "cartão de memória" do navegador
  useEffect(() => {
    localStorage.setItem(`job_form_${id}`, JSON.stringify(form));
  }, [form, id]);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/login");
        return;
      }
      
      // Se for a primeira vez abrindo, tenta puxar os dados do seu perfil
      if (!form.full_name) {
        const { data: profile } = await supabase.from("profiles").select("full_name, email, phone").eq("user_id", user.id).maybeSingle();
        if (profile) {
          setForm((f: any) => ({ ...f, full_name: profile.full_name || "", email: profile.email || "", phone: profile.phone || "" }));
        }
      }
      setLoading(false);
    };
    checkAuth();
  }, [id, navigate]);

  const handleApply = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !id) return;
    if (!form.full_name || !form.email) {
      toast({ title: "Preencha nome e email.", variant: "destructive" });
      return;
    }

    setApplying(true);
    let resume_url: string | null = null;

    if (resumeFile) {
      const ext = resumeFile.name.split(".").pop();
      const path = `resumes/${user.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("uploads").upload(path, resumeFile);
      if (uploadError) {
        toast({ title: "Erro ao enviar arquivo.", variant: "destructive" });
        setApplying(false);
        return;
      }
      const { data: urlData } = supabase.storage.from("uploads").getPublicUrl(path);
      resume_url = urlData.publicUrl;
    }

    const { error } = await supabase.from("job_applications").insert({
      job_id: id,
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
      localStorage.removeItem(`job_form_${id}`); // Limpa o rascunho após o sucesso
      navigate(`/jobs/${id}`);
    }
    setApplying(false);
  };

  if (loading) return <div className="p-10 text-center">Carregando...</div>;

  return (
    <AppLayout>
      <main className="max-w-md mx-auto px-4 py-5">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <ArrowLeft className="w-4 h-4" /> Voltar para a vaga
        </button>

        <h1 className="text-xl font-bold mb-6 text-foreground">Candidatura</h1>

        <div className="space-y-5 bg-card border p-5 rounded-2xl shadow-sm">
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase ml-1 block mb-1.5">Nome completo</label>
            <input 
                value={form.full_name} 
                onChange={e => setForm({...form, full_name: e.target.value})} 
                className="w-full border rounded-xl px-4 py-3 bg-background outline-none focus:ring-2 focus:ring-primary/30" 
            />
          </div>
          
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase ml-1 block mb-1.5">Currículo ou Foto (Opcional)</label>
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-6 cursor-pointer hover:bg-muted/50 transition-all border-muted-foreground/20">
              <Upload className="w-6 h-6 text-primary" />
              <span className="text-sm font-medium text-foreground text-center">
                {resumeFile ? resumeFile.name : "Clique para selecionar arquivo"}
              </span>
              <span className="text-[10px] text-muted-foreground uppercase">PDF, PNG ou JPG</span>
              <input 
                type="file" 
                className="hidden" 
                accept=".pdf,.png,.jpg,.jpeg" 
                onChange={e => setResumeFile(e.target.files?.[0] || null)} 
              />
            </label>
          </div>

          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase ml-1 block mb-1.5">Apresentação</label>
            <textarea 
                value={form.description} 
                onChange={e => setForm({...form, description: e.target.value})} 
                rows={4} 
                placeholder="Fale um pouco sobre sua experiência..."
                className="w-full border rounded-xl px-4 py-3 bg-background outline-none focus:ring-2 focus:ring-primary/30 resize-none" 
            />
          </div>

          <button 
            onClick={handleApply} 
            disabled={applying}
            className="w-full py-4 bg-primary text-primary-foreground rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-primary/20 active:scale-95 transition-transform"
          >
            {applying ? <Loader2 className="animate-spin w-5 h-5" /> : <><Send className="w-4 h-4" /> Enviar Candidatura</>}
          </button>
        </div>
      </main>
    </AppLayout>
  );
};

export default JobApply;