import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, ShieldCheck, Clock, Star, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { formatCpfOuCnpj, validateCpf, validateCnpj } from "@/lib/formatters";
import { uploadProfessionalDocument } from "@/lib/uploadProfessionalDocument";
import StepDocuments from "@/components/signup/StepDocuments";
import StepProfile from "@/components/signup/StepProfile";
import { DocumentsNoticeModal } from "@/components/signup/DocumentsNoticeModal";

type Step = "intro" | "doc-id" | "doc-notice" | "documents" | "profile";
type DocType = "cpf" | "cnpj";

function digitsOnly(v: string): string {
  return v.replace(/\D/g, "");
}

function profileHasCompleteCpf(profile: { cpf?: string | null } | null | undefined): boolean {
  return digitsOnly(profile?.cpf ?? "").length === 11;
}

function profileHasCompleteCnpj(profile: { cnpj?: string | null } | null | undefined): boolean {
  return digitsOnly(profile?.cnpj ?? "").length === 14;
}

const BecomeProfessional = () => {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const [step, setStep] = useState<Step | null>(null);
  const [docType, setDocType] = useState<DocType>("cpf");
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [docIdValue, setDocIdValue] = useState("");
  const [docSaving, setDocSaving] = useState(false);
  /** Pulou a tela de CPF/CNPJ porque o perfil já tinha documento salvo. */
  const [skippedIdentifierStep, setSkippedIdentifierStep] = useState(false);
  const profileSubmitLockRef = useRef(false);

  const persistAvatarToProfile = useCallback(
    async (publicUrl: string) => {
      const trimmed = publicUrl?.trim();
      if (!user?.id || !trimmed) return;
      const { error } = await supabase.from("profiles").update({ avatar_url: trimmed }).eq("user_id", user.id);
      if (error) {
        console.warn("[BecomeProfessional] persist avatar:", error);
        return;
      }
      await refreshProfile();
    },
    [user?.id, refreshProfile],
  );

  useEffect(() => {
    if (profile && profile.user_type !== "client") {
      navigate("/home");
      return;
    }
    if (profile && step === null) {
      setStep("intro");
    }
  }, [profile, navigate, step]);

  const handleIntroContinue = () => {
    if (profileHasCompleteCpf(profile)) {
      setDocType("cpf");
      setSkippedIdentifierStep(true);
      setStep("doc-notice");
      return;
    }
    if (profileHasCompleteCnpj(profile)) {
      setDocType("cnpj");
      setSkippedIdentifierStep(true);
      setStep("doc-notice");
      return;
    }
    setSkippedIdentifierStep(false);
    setStep("doc-id");
  };

  const handleDocIdNext = async () => {
    const raw = digitsOnly(docIdValue);
    if (raw.length === 0) {
      toast({
        title: "Campo obrigatório",
        description: "Digite seu CPF ou CNPJ.",
        variant: "destructive",
      });
      return;
    }
    if (raw.length < 11) {
      toast({
        title: "Documento incompleto",
        description: "Digite os 11 dígitos do CPF ou os 14 dígitos do CNPJ.",
        variant: "destructive",
      });
      return;
    }
    if (raw.length >= 12 && raw.length <= 13) {
      toast({
        title: "Quantidade de dígitos inválida",
        description: "Só aceitamos CPF completo (11 dígitos) ou CNPJ completo (14 dígitos).",
        variant: "destructive",
      });
      return;
    }
    if (raw.length > 14) {
      toast({ title: "Documento inválido", description: "Verifique o número digitado.", variant: "destructive" });
      return;
    }

    setDocSaving(true);
    try {
      if (raw.length === 11) {
        if (!validateCpf(docIdValue)) {
          toast({ title: "CPF inválido", description: "Informe um CPF com 11 dígitos.", variant: "destructive" });
          return;
        }
        const { data: existing } = await supabase.from("profiles").select("id").eq("cpf", raw).limit(1);
        if (existing?.length) {
          toast({ title: "Este CPF já está cadastrado.", variant: "destructive" });
          return;
        }
        const { error } = await supabase.from("profiles").update({ cpf: raw }).eq("user_id", user!.id);
        if (error) throw error;
        setDocType("cpf");
      } else {
        if (!validateCnpj(docIdValue)) {
          toast({ title: "CNPJ inválido", description: "Informe um CNPJ com 14 dígitos.", variant: "destructive" });
          return;
        }
        const { data: existing } = await supabase.from("profiles").select("id").eq("cnpj", raw).limit(1);
        if (existing?.length) {
          toast({ title: "Este CNPJ já está cadastrado.", variant: "destructive" });
          return;
        }
        const { error } = await supabase.from("profiles").update({ cnpj: raw }).eq("user_id", user!.id);
        if (error) throw error;
        setDocType("cnpj");
      }
      await refreshProfile();
      setSkippedIdentifierStep(false);
      setStep("doc-notice");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Não foi possível salvar.";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setDocSaving(false);
    }
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
    if (!user) return;
    if (profileSubmitLockRef.current) return;
    profileSubmitLockRef.current = true;

    setLoading(true);

    try {
      const avatarFinal = profileData.avatarUrl?.trim() || profile?.avatar_url || null;
      if (!avatarFinal) {
        toast({
          title: "Foto de perfil obrigatória",
          description: "Adicione uma foto de perfil antes de finalizar.",
          variant: "destructive",
        });
        return;
      }

      if (docFiles.length === 0) {
        toast({
          title: "Documentos obrigatórios",
          description: "Volte à etapa de documentos e envie todos os arquivos solicitados.",
          variant: "destructive",
        });
        return;
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          user_type: "professional",
          avatar_url: avatarFinal,
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

      const { data: upsertedPro, error: upsertProError } = await supabase
        .from("professionals")
        .upsert({
          user_id: user.id,
          profile_status: "pending",
          active: false,
          category_id: profileData.categoryId || null,
          profession_id: profileData.professionId || null,
          experience: profileData.experience || null,
          services: profileData.services?.length ? profileData.services : null,
          bio: profileData.bio || null,
        } as any, { onConflict: "user_id" })
        .select("id")
        .single();

      if (upsertProError) throw upsertProError;

      professionalId = upsertedPro?.id ?? professionalId;

      if (!professionalId) {
        throw new Error("Não foi possível criar o registro profissional. Tente novamente.");
      }

      const { data: staleRows } = await supabase
        .from("professional_documents")
        .select("file_url")
        .eq("professional_id", professionalId)
        .eq("type", "identity")
        .eq("status", "pending");

      const stalePaths = (staleRows ?? [])
        .map((r) => r.file_url)
        .filter(
          (p): p is string =>
            typeof p === "string" && p.length > 0 && !/^https?:\/\//i.test(p),
        );
      if (stalePaths.length > 0) {
        await supabase.storage.from("uploads").remove(stalePaths);
      }
      await supabase
        .from("professional_documents")
        .delete()
        .eq("professional_id", professionalId)
        .eq("type", "identity")
        .eq("status", "pending");

      for (const file of docFiles) {
        const { path: uploadedPath } = await uploadProfessionalDocument(file, user.id);

        const { error: insertDocError } = await supabase
          .from("professional_documents")
          .insert({
            professional_id: professionalId,
            file_url: uploadedPath,
            type: "identity",
            status: "pending",
          });

        if (insertDocError) throw insertDocError;
      }

      if (professionalId) {
        await supabase.from("professionals").update({ doc_type: docType } as any).eq("id", professionalId);
        if (docType === "cnpj") {
          await supabase.from("profiles").update({ user_type: "company" }).eq("user_id", user.id);
        }
      }

      await refreshProfile();

      toast({
        title: "Solicitação enviada!",
        description: "Seu perfil profissional está em análise. Você continua no plano Free até contratar um plano pago.",
      });

      navigate("/home");
    } catch (err: any) {
      console.error("[BecomeProfessional] submit:", err);

      toast({
        title: "Erro",
        description: err?.message || "Erro inesperado",
        variant: "destructive",
      });
    } finally {
      profileSubmitLockRef.current = false;
      setLoading(false);
    }
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

  const docIdLen = digitsOnly(docIdValue).length;

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
                      CPF ou CNPJ, foto de documento com selfie e informações do seu perfil profissional.
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
                onClick={handleIntroContinue}
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

      {step === "doc-id" && (
        <div className="min-h-screen bg-background flex flex-col items-center justify-start px-4 py-8">
          <div className="w-full max-w-sm">
            <div className="text-center mb-4">
              <h1 className="text-2xl font-extrabold text-gradient mb-1">Chamô</h1>
              <p className="text-sm text-muted-foreground">Tornar-se profissional</p>
              <button type="button" onClick={() => setStep("intro")} className="text-xs text-primary mt-1 hover:underline">
                ← Voltar
              </button>
            </div>

            <div className="bg-card border rounded-2xl p-5 shadow-card space-y-5">
              <h2 className="text-base font-bold text-foreground">Digite seu CPF ou CNPJ</h2>

              <div>
                <label className="sr-only">CPF ou CNPJ (obrigatório)</label>
                <div className="flex items-center gap-2 border rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-primary/30">
                  <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" aria-hidden />
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={docIdValue}
                    onChange={(e) => setDocIdValue(formatCpfOuCnpj(e.target.value))}
                    placeholder="000.000.000-00 ou CNPJ"
                    maxLength={18}
                    aria-label="Digite seu CPF ou CNPJ"
                    className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">Digite seu CPF ou CNPJ</p>
                {docIdLen >= 12 && docIdLen <= 13 ? (
                  <p className="text-[11px] text-destructive font-medium mt-1">
                    Quantidade inválida: complete até 11 dígitos (CPF) ou até 14 (CNPJ).
                  </p>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => void handleDocIdNext()}
                disabled={docSaving || (docIdLen >= 12 && docIdLen <= 13)}
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 disabled:opacity-50"
              >
                {docSaving ? "Salvando…" : "Continuar"}
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
              if (skippedIdentifierStep) setStep("intro");
              else setStep("doc-id");
            }}
          />
        </div>
      )}

      {step === "documents" && (
        <StepDocuments
          documentType={docType}
          onNext={handleDocumentsNext}
          onBack={() => setStep("doc-notice")}
        />
      )}

      {step === "profile" && (
        <StepProfile
          accountType="professional"
          initialAvatarUrl={profile?.avatar_url}
          onAvatarUploaded={(url) => void persistAvatarToProfile(url)}
          onNext={handleProfileNext}
          onBack={() => setStep("documents")}
        />
      )}
    </>
  );
};

export default BecomeProfessional;
