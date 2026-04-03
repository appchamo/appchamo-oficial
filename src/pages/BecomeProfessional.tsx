import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FileText, ShieldCheck, Clock, Star, ChevronRight, User, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { formatCpf, validateCpf, formatCnpj, validateCnpj } from "@/lib/formatters";
import { getAccessTokenForEdgeFunctions } from "@/lib/getAccessTokenForEdgeFunctions";
import StepDocuments from "@/components/signup/StepDocuments";
import StepProfile from "@/components/signup/StepProfile";
import { DocumentsNoticeModal } from "@/components/signup/DocumentsNoticeModal";

type Step = "intro" | "doc-type" | "cpf" | "cnpj" | "doc-notice" | "documents" | "profile";
type DocType = "cpf" | "cnpj";

// Regra de acesso antecipado: cadastros antes de 15/04 ganham plano grátis por 3 meses
// O prazo começa a contar a partir de 15/04 → expira em 15/07/2026
const EARLY_ACCESS_CUTOFF = new Date("2026-04-15T00:00:00");
const EARLY_ACCESS_EXPIRES = new Date("2026-07-15T00:00:00");

const BecomeProfessional = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, profile, refreshProfile } = useAuth();
  const [step, setStep] = useState<Step | null>(null);
  const [docType, setDocType] = useState<DocType>("cpf");
  const [referralCodeInput, setReferralCodeInput] = useState("");
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [cpfValue, setCpfValue] = useState("");
  const [cnpjValue, setCnpjValue] = useState("");
  const [docSaving, setDocSaving] = useState(false);
  const [cameFromDocStep, setCameFromDocStep] = useState(false);
  const profileSubmitLockRef = useRef(false);

  const isEarlyAccess = new Date() < EARLY_ACCESS_CUTOFF;

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

  useEffect(() => {
    const r = searchParams.get("ref")?.trim() || searchParams.get("referral")?.trim();
    if (r) setReferralCodeInput(r.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12));
  }, [searchParams]);

  const handleCpfNext = async () => {
    const raw = cpfValue.replace(/\D/g, "");
    if (!validateCpf(cpfValue)) {
      toast({ title: "CPF inválido", description: "Informe um CPF com 11 dígitos.", variant: "destructive" });
      return;
    }
    setDocSaving(true);
    try {
      const { data: existing } = await supabase.from("profiles").select("id").eq("cpf", raw).limit(1);
      if (existing?.length) {
        toast({ title: "Este CPF já está cadastrado.", variant: "destructive" });
        setDocSaving(false);
        return;
      }
      const { error } = await supabase.from("profiles").update({ cpf: raw }).eq("user_id", user!.id);
      if (error) throw error;
      await refreshProfile();
      setCameFromDocStep(true);
      setStep("doc-notice");
    } catch (err: any) {
      toast({ title: "Erro", description: err?.message || "Não foi possível salvar o CPF.", variant: "destructive" });
    }
    setDocSaving(false);
  };

  const handleCnpjNext = async () => {
    const raw = cnpjValue.replace(/\D/g, "");
    if (!validateCnpj(cnpjValue)) {
      toast({ title: "CNPJ inválido", description: "Informe um CNPJ com 14 dígitos.", variant: "destructive" });
      return;
    }
    setDocSaving(true);
    try {
      const { data: existing } = await supabase.from("profiles").select("id").eq("cnpj", raw).limit(1);
      if (existing?.length) {
        toast({ title: "Este CNPJ já está cadastrado.", variant: "destructive" });
        setDocSaving(false);
        return;
      }
      const { error } = await supabase.from("profiles").update({ cnpj: raw }).eq("user_id", user!.id);
      if (error) throw error;
      await refreshProfile();
      setCameFromDocStep(true);
      setStep("doc-notice");
    } catch (err: any) {
      toast({ title: "Erro", description: err?.message || "Não foi possível salvar o CNPJ.", variant: "destructive" });
    }
    setDocSaving(false);
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

      // Upsert do registro profissional: o trigger já cria a linha ao mudar user_type,
      // mas usamos upsert para garantir idempotência e atualizar os dados do perfil.
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

      const accessToken = await getAccessTokenForEdgeFunctions();
      if (!accessToken) throw new Error("Sessão expirada. Faça login novamente.");

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
        const formData = new FormData();
        formData.append("file", file);
        formData.append("userId", user.id);

        const uploadUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-document`;

        const uploadRes = await fetch(uploadUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: formData,
        });

        const uploadResult = await uploadRes.json();

        if (!uploadRes.ok || !uploadResult.path) {
          throw new Error(uploadResult.error || `Falha ao enviar documento (${uploadRes.status}). Tente novamente.`);
        }

        const { error: insertDocError } = await supabase
          .from("professional_documents")
          .insert({
            professional_id: professionalId,
            file_url: uploadResult.path,
            type: "identity",
            status: "pending",
          });

        if (insertDocError) throw insertDocError;
      }

      // ──────────────────────────────────────────────────────────────
      // PROMOÇÃO DE LANÇAMENTO: acesso antecipado (até 14/04/2026)
      // CPF → plano VIP por 3 meses (contagem a partir de 15/04/2026)
      // CNPJ → plano Business por 3 meses (contagem a partir de 15/04)
      // ──────────────────────────────────────────────────────────────
      if (isEarlyAccess && professionalId) {
        const planId = docType === "cnpj" ? "business" : "vip";
        const userTypeForPlan = docType === "cnpj" ? "company" : "professional";

        // 1. Salva doc_type no registro do profissional
        await supabase.from("professionals").update({
          doc_type: docType,
          profile_status: "pending",
          active: false,
          early_access: true,
        } as any).eq("id", professionalId);

        // 2. Concede plano pré-ativo (começa a contar em 15/04, expira 15/07/2026)
        await supabase.from("subscriptions").upsert({
          user_id: user.id,
          plan_id: planId,
          status: "ACTIVE",
          expires_at: EARLY_ACCESS_EXPIRES.toISOString(),
        }, { onConflict: "user_id" });

        // 3. Ajusta user_type conforme plano
        if (userTypeForPlan === "company") {
          await supabase.from("profiles").update({ user_type: "company" }).eq("user_id", user.id);
        }

        // 4. Marca que modal de early access deve ser mostrado após tutorial
        localStorage.setItem(`early_access_modal_${user.id}`, "pending");
      } else if (professionalId) {
        await supabase.from("professionals").update({ doc_type: docType } as any).eq("id", professionalId);
        if (docType === "cnpj") {
          await supabase.from("profiles").update({ user_type: "company" }).eq("user_id", user.id);
        }
      }

      await refreshProfile();

      const refTrim = referralCodeInput.trim();
      if (refTrim.length >= 6) {
        const { data: refData, error: refErr } = await supabase.rpc("apply_referral_code", { p_raw_code: refTrim });
        if (refErr) {
          console.warn("apply_referral_code:", refErr);
        } else if (refData && typeof refData === "object" && "ok" in refData && (refData as { ok?: boolean }).ok === false) {
          const err = (refData as { error?: string }).error;
          if (err === "code_not_found") {
            toast({ title: "Código de convite não encontrado", description: "Confira o código com quem te convidou.", variant: "destructive" });
          } else if (err === "self_referral") {
            toast({ title: "Código inválido", description: "Você não pode usar o próprio código.", variant: "destructive" });
          }
        }
      }

      const planLabel = docType === "cnpj" ? "Business" : "VIP";
      toast({
        title: isEarlyAccess ? `Bem-vindo ao Chamô ${planLabel}! 🎉` : "Solicitação enviada!",
        description: isEarlyAccess
          ? `Você ganhou acesso antecipado ao plano ${planLabel}!`
          : "Seu perfil profissional está em análise.",
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

                <div className="rounded-xl border border-dashed border-primary/25 bg-primary/5 p-3 space-y-2">
                  <label className="text-xs font-semibold text-foreground">Código de convite (opcional)</label>
                  <input
                    type="text"
                    value={referralCodeInput}
                    onChange={(e) => setReferralCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))}
                    placeholder="Ex.: ABC12XY8"
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono tracking-wider outline-none focus:ring-2 focus:ring-primary/30"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Se alguém do Chamô te convidou, informe o código. Ao concluir com um código válido, você e quem indicou ganham cupons pelo Indique e ganhe (sorteio e, para quem indicou, desconto quando houver lote na plataforma). Se depois você assinar um plano pago, quem indicou pode receber também a comissão de 5% na primeira cobrança (uma vez).
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setStep("doc-type")}
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

      {step === "doc-type" && (
        <div className="min-h-screen bg-background flex flex-col items-center justify-start px-4 py-8">
          <div className="w-full max-w-sm">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-extrabold text-gradient mb-1">Chamô</h1>
              <p className="text-sm text-muted-foreground">Tornar-se profissional</p>
              <button type="button" onClick={() => setStep("intro")} className="text-xs text-primary mt-1 hover:underline">← Voltar</button>
            </div>

            <div className="bg-card border rounded-2xl p-5 shadow-card space-y-5">
              <div>
                <h2 className="text-base font-bold text-foreground mb-1">Tipo de cadastro</h2>
                <p className="text-xs text-muted-foreground">Escolha como deseja se cadastrar. Isso define seu plano de acesso antecipado.</p>
              </div>

              {isEarlyAccess && (
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
                  <p className="text-xs text-amber-700 dark:text-amber-400 font-semibold">🎁 Acesso antecipado ativo!</p>
                  <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
                    CPF → <strong>Plano VIP grátis por 3 meses</strong><br />
                    CNPJ → <strong>Plano Business grátis por 3 meses</strong><br />
                    <span className="opacity-80">Válido para cadastros até 14/04/2026. Prazo conta de 15/04 a 15/07/2026.</span>
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => { setDocType("cpf"); setStep(profile?.cpf ? "doc-notice" : "cpf"); setCameFromDocStep(true); }}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors"
                >
                  <User className="w-8 h-8 text-primary" />
                  <span className="text-sm font-bold text-foreground">CPF</span>
                  <span className="text-[10px] text-muted-foreground text-center">Pessoa Física</span>
                  {isEarlyAccess && (
                    <span className="text-[10px] font-semibold text-amber-600 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">VIP grátis</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => { setDocType("cnpj"); setStep(profile?.cnpj ? "doc-notice" : "cnpj"); setCameFromDocStep(true); }}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-violet-400/30 bg-violet-500/5 hover:bg-violet-500/10 transition-colors"
                >
                  <Building2 className="w-8 h-8 text-violet-500" />
                  <span className="text-sm font-bold text-foreground">CNPJ</span>
                  <span className="text-[10px] text-muted-foreground text-center">Pessoa Jurídica</span>
                  {isEarlyAccess && (
                    <span className="text-[10px] font-semibold text-violet-600 bg-violet-100 dark:bg-violet-900/30 px-2 py-0.5 rounded-full">Business grátis</span>
                  )}
                </button>
              </div>
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
              if (cameFromDocStep) setStep(docType === "cnpj" ? "cnpj" : "cpf");
              else setStep("doc-type");
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
              <button type="button" onClick={() => setStep("doc-type")} className="text-xs text-primary mt-1 hover:underline">← Voltar</button>
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
                disabled={docSaving}
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 disabled:opacity-50"
              >
                {docSaving ? "Salvando…" : "Continuar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === "cnpj" && (
        <div className="min-h-screen bg-background flex flex-col items-center justify-start px-4 py-8">
          <div className="w-full max-w-sm">
            <div className="text-center mb-4">
              <h1 className="text-2xl font-extrabold text-gradient mb-1">Chamô</h1>
              <p className="text-sm text-muted-foreground">Tornar-se profissional · <strong>CNPJ</strong></p>
              <button type="button" onClick={() => setStep("doc-type")} className="text-xs text-primary mt-1 hover:underline">← Voltar</button>
            </div>
            <div className="bg-card border rounded-2xl p-5 shadow-card space-y-4">
              <p className="text-sm text-muted-foreground">Para continuar, cadastre seu CNPJ.</p>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">CNPJ *</label>
                <div className="flex items-center gap-2 border rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-primary/30">
                  <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <input
                    type="text"
                    value={cnpjValue}
                    onChange={(e) => setCnpjValue(formatCnpj(e.target.value))}
                    placeholder="00.000.000/0001-00"
                    maxLength={18}
                    className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleCnpjNext}
                disabled={docSaving}
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 disabled:opacity-50"
              >
                {docSaving ? "Salvando…" : "Continuar"}
              </button>
            </div>
          </div>
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
