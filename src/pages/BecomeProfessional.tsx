import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, ShieldCheck, Clock, Star, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { formatCpf, validateCpf } from "@/lib/formatters";
import StepDocuments from "@/components/signup/StepDocuments";
import StepProfile from "@/components/signup/StepProfile";
import { DocumentsNoticeModal } from "@/components/signup/DocumentsNoticeModal";

type Step = "intro" | "cpf" | "doc-notice" | "documents" | "profile";

const BecomeProfessional = () => {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const [step, setStep] = useState<Step | null>(null);
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [cpfValue, setCpfValue] = useState("");
  const [cpfSaving, setCpfSaving] = useState(false);
  const [cameFromCpfStep, setCameFromCpfStep] = useState(false);

  const needsCpf = profile && profile.user_type === "client" && !profile.cpf && !profile.cnpj;

  useEffect(() => {
    if (profile && profile.user_type !== "client") {
      navigate("/home");
      return;
    }
    if (profile && step === null) {
      setStep("intro");
    }
  }, [profile, navigate, step]);

  const handleCpfNext = async () => {
    const raw = cpfValue.replace(/\D/g, "");
    if (!validateCpf(cpfValue)) {
      toast({ title: "CPF inválido", description: "Informe um CPF com 11 dígitos.", variant: "destructive" });
      return;
    }
    setCpfSaving(true);
    try {
      const { data: existing } = await supabase.from("profiles").select("id").eq("cpf", raw).limit(1);
      if (existing?.length) {
        toast({ title: "Este CPF já está cadastrado.", variant: "destructive" });
        setCpfSaving(false);
        return;
      }
      const { error } = await supabase.from("profiles").update({ cpf: raw }).eq("user_id", user!.id);
      if (error) throw error;
      await refreshProfile();
      setCameFromCpfStep(true);
      setStep("doc-notice");
    } catch (err: any) {
      toast({ title: "Erro", description: err?.message || "Não foi possível salvar o CPF.", variant: "destructive" });
    }
    setCpfSaving(false);
  };

  const handleDocumentsNext = (files: File[]) => {
    setDocFiles(files);
    setStep("profile");
  };

  const handleProfileNext = async (profileData: {
    avatarUrl: string;
    categoryId?: string;
    professionId?: string;
    experience?: string;
    services?: string[];
    bio?: string;
  }) => {
    console.log("🚀 HANDLE PROFILE NEXT EXECUTANDO");
    console.log("📦 ARQUIVOS PARA UPLOAD:", docFiles);

    if (!user) return;

    setLoading(true);

    try {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          user_type: "professional",
          avatar_url: profileData.avatarUrl || profile?.avatar_url,
        })
        .eq("user_id", user.id);

      if (profileError) throw profileError;

      const { data: existingPro, error: existingProError } = await supabase
        .from("professionals")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingProError) throw existingProError;

      let professionalId = existingPro?.id;

      if (!professionalId) {
        const { data: createdPro, error: createProError } = await supabase
          .from("professionals")
          .insert({
            user_id: user.id,
            profile_status: "pending",
            category_id: profileData.categoryId || null,
            profession_id: profileData.professionId || null,
            experience: profileData.experience || null,
            services: profileData.services?.length ? profileData.services : null,
            bio: profileData.bio || null,
          } as any)
          .select("id")
          .single();

        if (createProError) throw createProError;

        professionalId = createdPro.id;
      }

      if (professionalId && docFiles.length > 0) {
        for (const file of docFiles) {
          const ext = file.name.split(".").pop() || "jpg";

          const fileName = `documents/${user.id}/${Date.now()}_${Math.random()
            .toString(36)
            .slice(2)}.${ext}`;

          console.log("📝 ARQUIVO SENDO SALVO:", fileName);

          const { error: uploadError } = await supabase.storage
            .from("uploads")
            .upload(fileName, file, {
              contentType: file.type,
              upsert: false,
            });

          if (uploadError) throw uploadError;

          const { error: insertDocError } = await supabase
            .from("professional_documents")
            .insert({
              professional_id: professionalId,
              file_url: fileName,
              type: "identity",
              status: "pending",
            });

          if (insertDocError) throw insertDocError;
        }
      }

      await refreshProfile();

      toast({
        title: "Solicitação enviada!",
        description: "Seu perfil profissional está em análise.",
      });

      navigate("/home");
    } catch (err: any) {
      console.error("❌ ERRO:", err);

      toast({
        title: "Erro",
        description: err?.message || "Erro inesperado",
        variant: "destructive",
      });
    }

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-extrabold text-gradient mb-3">Chamô</h1>
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Processando...</p>
        </div>
      </div>
    );
  }

  if (step === null) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      {step === "intro" && (
        <div className="min-h-screen bg-background flex flex-col items-center justify-start px-4 py-8">
          <div className="w-full max-w-sm">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-extrabold text-gradient mb-1">Chamô</h1>
              <p className="text-sm text-muted-foreground">Tornar-se profissional</p>
              <button type="button" onClick={() => navigate("/home")} className="text-xs text-primary mt-1 hover:underline">
                ← Voltar ao início
              </button>
            </div>

            <div className="bg-card border rounded-2xl p-6 shadow-card space-y-5">
              <div className="flex flex-col items-center text-center gap-2">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-1">
                  <ShieldCheck className="w-7 h-7 text-primary" />
                </div>
                <h2 className="text-lg font-bold text-foreground">Antes de começar</h2>
                <p className="text-sm text-muted-foreground">
                  Para se tornar profissional na Chamô, precisaremos de alguns dados de identificação e documentos.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/50">
                  <FileText className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Documentos solicitados</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      CPF, foto de documento com selfie e informações do seu perfil profissional.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/50">
                  <Clock className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Análise em até 24h</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Seu cadastro passará por uma análise interna. Você receberá uma notificação quando for aprovado.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/50">
                  <Star className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Planos disponíveis após aprovação</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Durante a análise, você terá acesso ao plano <strong>Free</strong>. Os planos pagos (Pro, VIP, Business) são liberados após aprovação.
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setStep(needsCpf ? "cpf" : "doc-notice")}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
              >
                Entendi, quero continuar
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => navigate("/home")}
                className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Voltar
              </button>
            </div>
          </div>
        </div>
      )}

      {step === "doc-notice" && (
        <div className="min-h-screen bg-background flex flex-col items-center justify-start px-4 py-8">
          <div className="w-full max-w-sm text-center mb-4">
            <h1 className="text-2xl font-extrabold text-gradient mb-1">Chamô</h1>
            <p className="text-sm text-muted-foreground">Tornar-se profissional</p>
            <button type="button" onClick={() => navigate("/home")} className="text-xs text-primary mt-1 hover:underline">
              ← Voltar ao início
            </button>
          </div>
          <DocumentsNoticeModal
            open
            onContinue={() => setStep("documents")}
            onBack={() => {
              if (cameFromCpfStep) setStep("cpf");
              else navigate("/home");
            }}
          />
        </div>
      )}

      {step === "cpf" && (
        <div className="min-h-screen bg-background flex flex-col items-center justify-start px-4 py-8">
          <div className="w-full max-w-sm">
            <div className="text-center mb-4">
              <h1 className="text-2xl font-extrabold text-gradient mb-1">Chamô</h1>
              <p className="text-sm text-muted-foreground">Tornar-se profissional · <strong>CPF</strong></p>
              <button type="button" onClick={() => navigate("/home")} className="text-xs text-primary mt-1 hover:underline">← Voltar</button>
            </div>
            <div className="bg-card border rounded-2xl p-5 shadow-card space-y-4">
              <p className="text-sm text-muted-foreground">Para continuar, cadastre seu CPF (obrigatório para profissionais).</p>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">CPF *</label>
                <div className="flex items-center gap-2 border rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-primary/30">
                  <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <input
                    type="text"
                    value={cpfValue}
                    onChange={(e) => setCpfValue(formatCpf(e.target.value))}
                    placeholder="000.000.000-00"
                    maxLength={14}
                    className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleCpfNext}
                disabled={cpfSaving}
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 disabled:opacity-50"
              >
                {cpfSaving ? "Salvando…" : "Continuar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === "documents" && (
        <StepDocuments
          documentType="cpf"
          onNext={handleDocumentsNext}
          onBack={() => setStep("doc-notice")}
        />
      )}

      {step === "profile" && (
        <StepProfile
          accountType="professional"
          onNext={handleProfileNext}
          onBack={() => setStep("documents")}
        />
      )}
    </>
  );
};

export default BecomeProfessional;
