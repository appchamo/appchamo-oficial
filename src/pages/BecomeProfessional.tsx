import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, ShieldCheck, Clock, Star, ChevronRight, User, Building2, MapPin, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { formatCpf, formatCnpj, validateCpf, validateCnpj } from "@/lib/formatters";
import { uploadProfessionalDocument } from "@/lib/uploadProfessionalDocument";
import StepDocuments from "@/components/signup/StepDocuments";
import StepProfile from "@/components/signup/StepProfile";
import { DocumentsNoticeModal } from "@/components/signup/DocumentsNoticeModal";

type Step = "intro" | "doc-id" | "doc-notice" | "documents" | "profile";
type DocType = "cpf" | "cnpj";

/**
 * Em rede fraca, um único upload de documento pode travar indefinidamente
 * (principalmente Android em 4G limitado). 45s por arquivo dá margem para
 * fotos pesadas (~5MB) sem prender a UI para sempre. Se estourar, o usuário
 * recebe toast com a falha e pode tentar de novo.
 */
const DOCUMENT_UPLOAD_TIMEOUT_MS = 45000;

function withUploadTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label}_timeout`)), ms);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((err) => {
        clearTimeout(t);
        reject(err);
      });
  });
}

function digitsOnly(v: string): string {
  return v.replace(/\D/g, "");
}

/** Máscara de CEP: 00000-000 */
function formatCep(v: string): string {
  return v
    .replace(/\D/g, "")
    .slice(0, 8)
    .replace(/(\d{5})(\d)/, "$1-$2");
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
  /**
   * Após preencher CPF/CNPJ válido aparecem os campos de nome de exibição
   * (ou nome fantasia, no caso de CNPJ) e CEP. CEP busca cidade no ViaCEP.
   */
  const [displayNameValue, setDisplayNameValue] = useState("");
  const [cepValue, setCepValue] = useState("");
  const [cepLoading, setCepLoading] = useState(false);
  /** Dados retornados pelo ViaCEP (auxiliam exibição da cidade carregada). */
  const [cepInfo, setCepInfo] = useState<{
    city: string;
    state: string;
    neighborhood: string;
    street: string;
  } | null>(null);
  const profileSubmitLockRef = useRef(false);
  /** Evita re-aplicar pré-preenchimento toda vez que profile/state mudar. */
  const docIdPrefilledRef = useRef(false);

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
    // Sempre passamos pela Etapa 1, mesmo que o profile já tenha CPF/CNPJ:
    // precisamos de nome de exibição + CEP (cidade) para virar profissional.
    docIdPrefilledRef.current = false;
    setStep("doc-id");
  };

  /** Troca o tipo de documento (CPF/CNPJ) pelos botões. Repõe o valor salvo no
   *  profile se existir, ou limpa o campo para o usuário digitar um novo.
   *  Ex.: perfil tem CPF cadastrado → se clicar em "CNPJ", limpa o campo pra
   *  digitar o CNPJ da empresa. Voltando pra "CPF", reaparece o CPF salvo. */
  const handleSelectDocType = (next: DocType) => {
    if (next === docType) return;
    setDocType(next);
    const saved =
      next === "cpf" ? digitsOnly(profile?.cpf ?? "") : digitsOnly(profile?.cnpj ?? "");
    const formatted =
      next === "cpf"
        ? saved.length === 11
          ? formatCpf(saved)
          : ""
        : saved.length === 14
          ? formatCnpj(saved)
          : "";
    setDocIdValue(formatted);
  };

  // Pré-preenche os campos da Etapa 1 quando ela aparece pela primeira vez,
  // usando o que já existe no profile (CPF/CNPJ, display_name, CEP).
  useEffect(() => {
    if (step !== "doc-id" || !profile || docIdPrefilledRef.current) return;
    docIdPrefilledRef.current = true;

    const cpfDigits = digitsOnly(profile.cpf ?? "");
    const cnpjDigits = digitsOnly(profile.cnpj ?? "");

    // Se a conta já nasceu como CNPJ, começa em CNPJ; senão começa em CPF
    // (mesmo se ainda não houver nenhum documento). O usuário pode trocar
    // manualmente pelos botões CPF/CNPJ.
    if (cnpjDigits.length === 14) {
      setDocType("cnpj");
      setDocIdValue(formatCnpj(cnpjDigits));
    } else {
      setDocType("cpf");
      if (cpfDigits.length === 11) setDocIdValue(formatCpf(cpfDigits));
    }

    if (profile.display_name) setDisplayNameValue(profile.display_name);
    else if (profile.full_name) setDisplayNameValue(profile.full_name);

    if (profile.address_zip) {
      const formattedCep = formatCep(profile.address_zip);
      setCepValue(formattedCep);
      if (profile.address_city && profile.address_state) {
        setCepInfo({
          city: profile.address_city,
          state: profile.address_state,
          neighborhood: profile.address_neighborhood ?? "",
          street: "",
        });
      }
    }
  }, [step, profile]);

  // Busca o endereço no ViaCEP quando o usuário completa os 8 dígitos do CEP.
  useEffect(() => {
    const cepDigits = digitsOnly(cepValue);
    if (cepDigits.length !== 8) {
      setCepInfo(null);
      return;
    }
    // Se já carregamos esse mesmo CEP (vindo do profile), não refaz a chamada.
    const profileCepDigits = digitsOnly(profile?.address_zip ?? "");
    if (
      cepInfo &&
      cepDigits === profileCepDigits &&
      profile?.address_city === cepInfo.city
    ) {
      return;
    }

    let cancelled = false;
    setCepLoading(true);
    (async () => {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`);
        const data = await res.json();
        if (cancelled) return;
        if (data?.erro) {
          setCepInfo(null);
          toast({
            title: "CEP não encontrado",
            description: "Verifique o número digitado e tente novamente.",
            variant: "destructive",
          });
          return;
        }
        setCepInfo({
          city: data.localidade ?? "",
          state: data.uf ?? "",
          neighborhood: data.bairro ?? "",
          street: data.logradouro ?? "",
        });
      } catch {
        if (!cancelled) {
          setCepInfo(null);
          toast({
            title: "Erro ao consultar CEP",
            description: "Verifique sua conexão e tente novamente.",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setCepLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // profile/cepInfo só são lidos para evitar refetch redundante; não devem disparar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cepValue]);

  const handleDocIdNext = async () => {
    const raw = digitsOnly(docIdValue);
    const isCpf = docType === "cpf";
    const expectedLen = isCpf ? 11 : 14;
    if (raw.length === 0) {
      toast({
        title: "Campo obrigatório",
        description: isCpf ? "Digite seu CPF." : "Digite o CNPJ.",
        variant: "destructive",
      });
      return;
    }
    if (raw.length !== expectedLen) {
      toast({
        title: "Documento incompleto",
        description: isCpf
          ? "Digite os 11 dígitos do CPF."
          : "Digite os 14 dígitos do CNPJ.",
        variant: "destructive",
      });
      return;
    }

    if (isCpf && !validateCpf(docIdValue)) {
      toast({ title: "CPF inválido", description: "Confira o número digitado.", variant: "destructive" });
      return;
    }
    if (!isCpf && !validateCnpj(docIdValue)) {
      toast({ title: "CNPJ inválido", description: "Confira o número digitado.", variant: "destructive" });
      return;
    }

    const trimmedName = displayNameValue.trim();
    if (trimmedName.length < 2) {
      toast({
        title: isCpf ? "Informe seu nome de exibição" : "Informe o nome fantasia",
        description: "Esse é o nome que vai aparecer no app.",
        variant: "destructive",
      });
      return;
    }

    const cepDigits = digitsOnly(cepValue);
    if (cepDigits.length !== 8) {
      toast({
        title: "CEP incompleto",
        description: "Digite os 8 dígitos do CEP para carregar a cidade.",
        variant: "destructive",
      });
      return;
    }
    if (!cepInfo?.city || !cepInfo?.state) {
      toast({
        title: "Cidade não carregada",
        description: "Aguarde a busca do CEP terminar antes de continuar.",
        variant: "destructive",
      });
      return;
    }

    setDocSaving(true);
    try {
      // Só checamos duplicidade se o documento mudou em relação ao já salvo.
      const profileCpf = digitsOnly(profile?.cpf ?? "");
      const profileCnpj = digitsOnly(profile?.cnpj ?? "");

      if (isCpf && raw !== profileCpf) {
        const { data: existing } = await supabase
          .from("profiles")
          .select("id")
          .eq("cpf", raw)
          .neq("user_id", user!.id)
          .limit(1);
        if (existing?.length) {
          toast({ title: "Este CPF já está cadastrado.", variant: "destructive" });
          return;
        }
      }
      if (!isCpf && raw !== profileCnpj) {
        const { data: existing } = await supabase
          .from("profiles")
          .select("id")
          .eq("cnpj", raw)
          .neq("user_id", user!.id)
          .limit(1);
        if (existing?.length) {
          toast({ title: "Este CNPJ já está cadastrado.", variant: "destructive" });
          return;
        }
      }

      const updatePayload: Record<string, unknown> = {
        display_name: trimmedName,
        address_zip: cepDigits,
        address_city: cepInfo.city,
        address_state: cepInfo.state,
      };
      // Só sobrescreve bairro/rua se o ViaCEP retornou — não apaga o que o usuário
      // já preencheu antes em outro fluxo (ex.: cadastro inicial).
      if (cepInfo.neighborhood) updatePayload.address_neighborhood = cepInfo.neighborhood;
      if (cepInfo.street) updatePayload.address_street = cepInfo.street;

      // Salvamos só o documento escolhido. Não limpamos o oposto: se um dia o
      // usuário tiver os dois (pessoa física + empresa), preservamos os dados.
      if (isCpf) updatePayload.cpf = raw;
      else updatePayload.cnpj = raw;

      const { error } = await supabase
        .from("profiles")
        .update(updatePayload as never)
        .eq("user_id", user!.id);
      if (error) throw error;

      setDocType(isCpf ? "cpf" : "cnpj");
      await refreshProfile();
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

      for (let i = 0; i < docFiles.length; i++) {
        const file = docFiles[i];
        let uploadedPath: string;
        try {
          const result = await withUploadTimeout(
            uploadProfessionalDocument(file, user.id),
            DOCUMENT_UPLOAD_TIMEOUT_MS,
            "upload",
          );
          uploadedPath = result.path;
        } catch (err) {
          const isTimeout = err instanceof Error && err.message === "upload_timeout";
          toast({
            title: isTimeout ? "Envio demorou demais" : "Falha no envio do documento",
            description: isTimeout
              ? `O arquivo ${i + 1} de ${docFiles.length} não foi enviado. Tente de novo em outra rede (ex.: Wi-Fi) ou use uma foto menor.`
              : err instanceof Error
                ? err.message
                : "Tente novamente.",
            variant: "destructive",
          });
          throw err;
        }

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

      {step === "doc-id" && (() => {
        const isCnpj = docType === "cnpj";
        const expectedLen = isCnpj ? 14 : 11;
        const docComplete = docIdLen === expectedLen;
        const cepDigits = digitsOnly(cepValue).length;
        const nameLabel = isCnpj ? "Nome fantasia" : "Nome de exibição";
        const nameHelper = isCnpj
          ? "Nome fantasia da empresa (como aparecerá no app)."
          : "Como seu nome aparecerá para os clientes no app.";
        const NameIcon = isCnpj ? Building2 : User;
        const canContinue =
          docComplete &&
          displayNameValue.trim().length >= 2 &&
          cepDigits === 8 &&
          !!cepInfo?.city &&
          !cepLoading &&
          !docSaving;

        return (
          <div className="min-h-screen bg-background flex flex-col items-center justify-start px-4 py-8">
            <div className="w-full max-w-sm">
              <div className="text-center mb-4">
                <h1 className="text-2xl font-extrabold text-gradient mb-1">Chamô</h1>
                <p className="text-sm text-muted-foreground">
                  Etapa 1 de 3 · <strong>Identificação</strong>
                </p>
                <button type="button" onClick={() => setStep("intro")} className="text-xs text-primary mt-1 hover:underline">
                  ← Voltar
                </button>
              </div>

              <div className="bg-card border border-primary/10 rounded-2xl p-5 shadow-card space-y-4 ring-1 ring-primary/5">
                <p className="text-xs text-muted-foreground leading-relaxed text-center px-1">
                  Para começar, informe seu <strong className="text-foreground font-semibold">CPF ou CNPJ</strong>,
                  o nome que aparecerá no app e seu CEP.
                </p>

                <div>
                  <label className="text-[11px] uppercase font-bold text-muted-foreground ml-1">
                    {isCnpj ? "CNPJ" : "CPF"}
                  </label>

                  {/* Seletor CPF / CNPJ — o tipo escolhido define o modo do input.
                      Mesma UX do cadastro inicial (StepBasicData). */}
                  <div className="flex gap-2 mt-1 mb-2">
                    <button
                      type="button"
                      onClick={() => handleSelectDocType("cpf")}
                      className={`px-3 py-1 text-xs rounded-lg border transition-colors ${
                        !isCnpj
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-transparent text-foreground hover:bg-muted"
                      }`}
                    >
                      CPF
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectDocType("cnpj")}
                      className={`px-3 py-1 text-xs rounded-lg border transition-colors ${
                        isCnpj
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-transparent text-foreground hover:bg-muted"
                      }`}
                    >
                      CNPJ
                    </button>
                  </div>

                  <div className="flex items-center gap-2 border rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-primary/30">
                    <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" aria-hidden />
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={docIdValue}
                      onChange={(e) =>
                        setDocIdValue(isCnpj ? formatCnpj(e.target.value) : formatCpf(e.target.value))
                      }
                      placeholder={isCnpj ? "00.000.000/0000-00" : "000.000.000-00"}
                      maxLength={isCnpj ? 18 : 14}
                      aria-label={isCnpj ? "Digite o CNPJ" : "Digite o CPF"}
                      className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
                    />
                  </div>
                  {docIdLen > 0 && docIdLen < expectedLen ? (
                    <p className="text-[11px] text-destructive font-medium mt-1">
                      {isCnpj ? "Complete os 14 dígitos do CNPJ." : "Complete os 11 dígitos do CPF."}
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {isCnpj
                        ? "Digite o CNPJ da empresa (14 dígitos)."
                        : "Digite seu CPF (11 dígitos)."}
                    </p>
                  )}
                </div>

                {docComplete && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div>
                      <label className="text-[11px] uppercase font-bold text-muted-foreground ml-1">
                        {nameLabel}
                      </label>
                      <div className="mt-1 flex items-center gap-2 border rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-primary/30">
                        <NameIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" aria-hidden />
                        <input
                          type="text"
                          autoComplete="off"
                          value={displayNameValue}
                          onChange={(e) => setDisplayNameValue(e.target.value)}
                          placeholder={isCnpj ? "Ex.: Padaria do Zé" : "Ex.: João Silva"}
                          maxLength={80}
                          aria-label={nameLabel}
                          className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">{nameHelper}</p>
                    </div>

                    <div>
                      <label className="text-[11px] uppercase font-bold text-muted-foreground ml-1">
                        CEP
                      </label>
                      <div className="mt-1 flex items-center gap-2 border rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-primary/30">
                        <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" aria-hidden />
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          value={cepValue}
                          onChange={(e) => setCepValue(formatCep(e.target.value))}
                          placeholder="00000-000"
                          maxLength={9}
                          aria-label="CEP"
                          className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
                        />
                        {cepLoading && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />}
                      </div>
                      {cepInfo?.city && cepInfo?.state ? (
                        <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/10">
                          <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                          <p className="text-xs text-foreground">
                            <strong>{cepInfo.city}</strong> · {cepInfo.state}
                            {cepInfo.neighborhood ? ` — ${cepInfo.neighborhood}` : ""}
                          </p>
                        </div>
                      ) : (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          A cidade será sua localização inicial no app.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => void handleDocIdNext()}
                  disabled={!canContinue}
                  className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {docSaving ? "Salvando…" : "Continuar"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
            onBack={() => setStep("doc-id")}
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
