import { useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  ShieldCheck, Lock, EyeOff, UserCheck, ArrowLeft, Camera, ScanFace,
  IdCard, Car, Plane, CheckCircle2, Loader2, FileCheck2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import DocumentCamera from "@/components/signup/DocumentCamera";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type DocType = "identidade" | "passaporte" | "cnh";
type Slot = "front" | "back" | "selfie";

const DOC_TYPES: { key: DocType; name: string; desc: string; Icon: typeof IdCard }[] = [
  { key: "identidade", name: "Identidade (RG)", desc: "Carteira de identidade", Icon: IdCard },
  { key: "cnh", name: "CNH", desc: "Carteira de motorista", Icon: Car },
  { key: "passaporte", name: "Passaporte", desc: "Documento de viagem", Icon: Plane },
];
const DOC_TYPE_LABELS: Record<DocType, { front: string; back: string }> = {
  identidade: { front: "Identidade (RG) — frente", back: "Identidade (RG) — verso" },
  cnh: { front: "CNH — frente", back: "CNH — verso" },
  passaporte: { front: "Passaporte — página da foto", back: "Passaporte — verso" },
};
const SELFIE_LABEL = "Reconhecimento facial (selfie)";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

const VerificarIdentidade = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, refreshProfile } = useAuth();
  const from = (location.state as { from?: string } | null)?.from || "/home";

  const [step, setStep] = useState<"intro" | "docs">("intro");
  const [termsOpen, setTermsOpen] = useState(false);
  const [termsRead, setTermsRead] = useState(false);
  const [docType, setDocType] = useState<DocType | null>(null);

  const [files, setFiles] = useState<Partial<Record<Slot, { file: File; preview: string }>>>({});
  const [cameraOpen, setCameraOpen] = useState(false);
  const [currentSlot, setCurrentSlot] = useState<Slot>("front");
  const [submitting, setSubmitting] = useState(false);

  const goBack = () => navigate(from);

  // Já verificado? Não precisa refazer.
  const alreadyVerified = !!profile?.identity_verified;

  const openCamera = (slot: Slot) => { setCurrentSlot(slot); setCameraOpen(true); };

  const handleCapture = (file: File, preview: string) => {
    setFiles((prev) => {
      const old = prev[currentSlot];
      if (old?.preview.startsWith("blob:")) URL.revokeObjectURL(old.preview);
      return { ...prev, [currentSlot]: { file, preview } };
    });
    setCameraOpen(false);
  };

  const acceptTerms = () => { setTermsOpen(false); setStep("docs"); };

  // Validação na hora da foto: a IA confere se o documento bate com o tipo escolhido.
  const validateDoc = useCallback(async (file: File): Promise<{ ok: boolean; message?: string }> => {
    if (!docType || currentSlot === "selfie") return { ok: true };
    try {
      const image = await fileToDataUrl(file);
      const { data, error } = await supabase.functions.invoke("classify-document", {
        body: { image, expected_type: docType, side: currentSlot },
      });
      if (error) return { ok: true }; // fail-open: não trava por erro de rede
      if (data && data.ok === false) return { ok: false, message: String(data.reason || "Documento não confere.") };
      return { ok: true };
    } catch {
      return { ok: true };
    }
  }, [docType, currentSlot]);

  const uploadKyc = useCallback(async (uid: string, file: File, kind: Slot) => {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${uid}/${kind}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("kyc").upload(path, file, {
      contentType: file.type || "image/jpeg",
      upsert: true,
    });
    if (error) throw error;
    return path;
  }, []);

  const allReady = !!(docType && files.front && files.back && files.selfie);

  const handleConclude = async () => {
    if (!allReady || !docType) return;
    const uid = user?.id ?? (await supabase.auth.getUser()).data.user?.id;
    if (!uid) { navigate("/login", { state: { from: "/verificar-identidade" } }); return; }
    setSubmitting(true);
    try {
      const [frontPath, backPath, selfiePath] = await Promise.all([
        uploadKyc(uid, files.front!.file, "front"),
        uploadKyc(uid, files.back!.file, "back"),
        uploadKyc(uid, files.selfie!.file, "selfie"),
      ]);

      const { error: rpcErr } = await supabase.rpc("submit_identity_verification", {
        p_doc_type: docType,
        p_front: frontPath,
        p_back: backPath,
        p_selfie: selfiePath,
      });
      if (rpcErr) throw rpcErr;

      // Checagem de qualidade por IA (não bloqueia — apenas sinaliza no admin).
      (async () => {
        try {
          const selfie = await fileToDataUrl(files.selfie!.file);
          const document = await fileToDataUrl(files.front!.file);
          await supabase.functions.invoke("analyze-selfie-quality", {
            body: { selfie, document, doc_type: docType, user_id: uid },
          });
        } catch { /* best-effort */ }
      })();

      await refreshProfile();
      toast({ title: "Identidade verificada!", description: "Agora você já pode chamar profissionais." });
      navigate(from);
    } catch (e) {
      toast({
        title: "Não foi possível concluir",
        description: e instanceof Error ? e.message : "Tente novamente em instantes.",
        variant: "destructive",
      });
      setSubmitting(false);
    }
  };

  const idFrontLabel = docType ? DOC_TYPE_LABELS[docType].front : "Documento (frente)";
  const idBackLabel = docType ? DOC_TYPE_LABELS[docType].back : "Documento (verso)";
  const cameraLabel = currentSlot === "selfie" ? SELFIE_LABEL : currentSlot === "front" ? idFrontLabel : idBackLabel;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border/60 px-4 py-3 flex items-center gap-3">
        <button onClick={goBack} className="p-2 -ml-2 rounded-full hover:bg-muted transition-colors" aria-label="Voltar">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <p className="text-sm font-bold text-foreground leading-tight">Verificação de identidade</p>
          <p className="text-[11px] text-muted-foreground leading-tight">Segurança da comunidade Chamô</p>
        </div>
      </div>

      <div className="flex-1 w-full max-w-md mx-auto px-4 py-6">
        {alreadyVerified ? (
          <div className="flex flex-col items-center text-center gap-4 py-12">
            <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <ShieldCheck className="w-8 h-8 text-emerald-500" />
            </div>
            <h1 className="text-xl font-extrabold text-foreground">Você já está verificado</h1>
            <p className="text-sm text-muted-foreground">Sua identidade já foi verificada. Pode chamar profissionais normalmente.</p>
            <Button className="rounded-xl mt-2" onClick={goBack}>Voltar</Button>
          </div>
        ) : step === "intro" ? (
          /* ETAPA 1 — Explicação */
          <div className="space-y-6">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <ShieldCheck className="w-9 h-9 text-primary" />
              </div>
              <h1 className="text-2xl font-extrabold text-foreground leading-tight">
                Verifique sua identidade
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Para chamar um profissional, pedimos uma verificação rápida. É simples e leva menos de 2 minutos.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <p className="text-xs font-bold text-foreground uppercase tracking-wide">Por que isso é importante?</p>
              <Feature Icon={ShieldCheck} title="Mais segurança pra todos"
                text="Reduz golpes e perfis falsos. Você conversa com pessoas de verdade." />
              <Feature Icon={UserCheck} title="Confiança nas duas pontas"
                text="Profissionais atendem sabendo que quem chama é uma pessoa verificada." />
              <Feature Icon={Lock} title="Seus dados são protegidos"
                text="Documentos ficam guardados de forma segura e criptografada." />
              <Feature Icon={EyeOff} title="Nada é exposto ao público"
                text="Seu documento e sua selfie NUNCA aparecem no seu perfil nem para outros usuários. Uso interno, apenas para a verificação." />
            </div>

            <div className="rounded-xl bg-muted/50 border border-border/60 p-3">
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Você vai precisar de um documento com foto (RG, CNH ou passaporte) e fazer um reconhecimento facial pela câmera.
              </p>
            </div>

            <Button className="w-full rounded-xl h-12 text-sm font-bold" onClick={() => { setTermsRead(false); setTermsOpen(true); }}>
              Começar verificação
            </Button>
          </div>
        ) : (
          /* ETAPA 3 — Documentos (frente/verso) + reconhecimento facial */
          <div className="space-y-4">
            <div className="space-y-1">
              <h1 className="text-lg font-extrabold text-foreground">Envie seu documento</h1>
              <p className="text-xs text-muted-foreground">Tire a foto da frente, do verso e faça o reconhecimento facial.</p>
            </div>

            {docType && (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-primary/[0.06] border border-primary/15 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  {(() => {
                    const T = DOC_TYPES.find((t) => t.key === docType)!;
                    return <T.Icon className="w-4 h-4 text-primary shrink-0" />;
                  })()}
                  <span className="text-xs font-semibold text-foreground truncate">
                    Documento: {DOC_TYPES.find((t) => t.key === docType)!.name}
                  </span>
                </div>
                <button onClick={() => setDocType(null)} className="text-[11px] font-semibold text-primary hover:underline shrink-0">
                  Trocar tipo
                </button>
              </div>
            )}

            {docType && (
              <>
                <SlotCard label={idFrontLabel} icon="camera" data={files.front} onShoot={() => openCamera("front")} />
                <SlotCard label={idBackLabel} icon="camera" data={files.back} onShoot={() => openCamera("back")} />
                <SlotCard label={SELFIE_LABEL} icon="face" data={files.selfie} onShoot={() => openCamera("selfie")} />

                <Button
                  className="w-full rounded-xl h-12 text-sm font-bold mt-2"
                  disabled={!allReady || submitting}
                  onClick={handleConclude}
                >
                  {submitting ? (<><Loader2 className="w-5 h-5 animate-spin mr-2" /> Concluindo…</>) : "Concluir verificação"}
                </Button>
                <p className="text-center text-[11px] text-muted-foreground">
                  Ao concluir, seus dados são analisados e sua conta é liberada para chamar profissionais.
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* ETAPA 2 — Modal único de Termos + Política de Privacidade */}
      <Dialog open={termsOpen} onOpenChange={setTermsOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCheck2 className="w-5 h-5 text-primary" /> Termos e Política de Privacidade
            </DialogTitle>
            <DialogDescription>
              Leia e aceite para prosseguir com a verificação de identidade.
            </DialogDescription>
          </DialogHeader>

          <div
            className="flex-1 overflow-y-auto rounded-xl border border-border bg-muted/30 p-3 text-[12px] leading-relaxed text-foreground/90 space-y-3"
            onScroll={(e) => {
              const el = e.currentTarget;
              if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setTermsRead(true);
            }}
          >
            <TermsBody />
          </div>

          {!termsRead && (
            <p className="text-[11px] text-muted-foreground text-center">Role até o fim para habilitar o botão.</p>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <Button variant="outline" className="rounded-xl w-full sm:w-auto" onClick={() => setTermsOpen(false)}>
              Cancelar
            </Button>
            <Button className="rounded-xl w-full sm:w-auto" disabled={!termsRead} onClick={acceptTerms}>
              Li e aceito
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ETAPA 3 (parte 1) — Modal obrigatório de tipo de documento */}
      {step === "docs" && docType === null && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 px-4 pb-6 pt-safe-top">
          <div className="w-full max-w-sm rounded-3xl bg-card border border-border shadow-xl p-5 space-y-4">
            <div className="text-center space-y-1">
              <h2 className="text-lg font-extrabold text-foreground">Qual documento você vai usar?</h2>
              <p className="text-xs text-muted-foreground">Escolha o tipo. Depois pedimos a <strong>frente</strong> e o <strong>verso</strong>.</p>
            </div>
            <div className="space-y-2.5">
              {DOC_TYPES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setDocType(t.key)}
                  className="flex w-full items-center gap-3 rounded-2xl border-2 border-primary/20 bg-card px-4 py-3.5 text-left hover:border-primary/50 hover:bg-primary/[0.04] active:scale-[0.99] transition-all"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                    <t.Icon className="w-5 h-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-foreground">{t.name}</span>
                    <span className="block text-[11px] text-muted-foreground">{t.desc}</span>
                  </span>
                </button>
              ))}
            </div>
            <button onClick={() => setStep("intro")} className="w-full py-2.5 rounded-xl border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
              Voltar
            </button>
          </div>
        </div>
      )}

      {cameraOpen && (
        <DocumentCamera
          label={cameraLabel}
          facing={currentSlot === "selfie" ? "user" : "environment"}
          onCapture={handleCapture}
          onClose={() => setCameraOpen(false)}
          validate={currentSlot === "selfie" ? undefined : validateDoc}
        />
      )}
    </div>
  );
};

function Feature({ Icon, title, text }: { Icon: typeof ShieldCheck; title: string; text: string }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
        <Icon className="w-5 h-5" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-foreground leading-tight">{title}</p>
        <p className="text-xs text-muted-foreground leading-snug mt-0.5">{text}</p>
      </div>
    </div>
  );
}

function SlotCard({
  label, icon, data, onShoot,
}: { label: string; icon: "camera" | "face"; data?: { file: File; preview: string }; onShoot: () => void }) {
  return (
    <div className={cn("rounded-2xl border p-4 space-y-3", data ? "border-emerald-500/40 bg-emerald-500/[0.04]" : "border-border/80 bg-gradient-to-b from-primary/[0.06] to-transparent")}>
      <p className="text-sm font-semibold text-foreground">{label}</p>
      {data ? (
        <div className="flex items-center gap-3 rounded-xl bg-card border border-border/60 p-2">
          <div className="relative w-[4.5rem] h-[3.25rem] rounded-lg overflow-hidden border border-border/50 bg-muted flex items-center justify-center shrink-0">
            <img src={data.preview} alt="" className="w-full h-full object-cover" />
            <div className="absolute top-0.5 right-0.5 bg-emerald-500 rounded-full">
              <CheckCircle2 className="w-3.5 h-3.5 text-white" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Foto enviada</p>
            <button onClick={onShoot} className="text-[11px] font-semibold text-primary hover:underline mt-1">Tirar outra</button>
          </div>
        </div>
      ) : (
        <button
          onClick={onShoot}
          className="group flex w-full items-center justify-center gap-3 py-4 px-2 rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90 active:scale-[0.98] transition-all"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
            {icon === "face" ? <ScanFace className="w-5 h-5" /> : <Camera className="w-5 h-5" />}
          </span>
          <span className="text-sm font-bold">{icon === "face" ? "Fazer reconhecimento facial" : "Abrir câmera"}</span>
        </button>
      )}
    </div>
  );
}

function TermsBody() {
  return (
    <>
      <p className="font-bold text-foreground">Termo de Verificação de Identidade e Política de Privacidade</p>
      <p>Ao prosseguir, você concorda com a coleta e o tratamento dos dados abaixo, exclusivamente para verificar sua identidade no Chamô, conforme a Lei Geral de Proteção de Dados (LGPD – Lei nº 13.709/2018).</p>

      <p className="font-semibold text-foreground">1. O que coletamos</p>
      <p>Foto da frente e do verso de um documento oficial com foto (RG, CNH ou passaporte) e uma imagem de reconhecimento facial (selfie) capturada pela câmera do aparelho.</p>

      <p className="font-semibold text-foreground">2. Para que usamos</p>
      <p>Os dados são usados apenas para confirmar que você é uma pessoa real e maior de idade, aumentar a segurança da comunidade e prevenir fraudes e perfis falsos. Não usamos suas imagens para publicidade nem as compartilhamos com terceiros para fins comerciais.</p>

      <p className="font-semibold text-foreground">3. Confidencialidade</p>
      <p>Seu documento e sua selfie são armazenados de forma segura e criptografada, com acesso restrito à equipe responsável pela verificação. Essas imagens NÃO são exibidas no seu perfil, não aparecem para profissionais nem para outros usuários e nunca são tornadas públicas.</p>

      <p className="font-semibold text-foreground">4. Análise automatizada</p>
      <p>Podemos usar tecnologia automatizada apenas para avaliar a qualidade das imagens (se estão nítidas, legíveis e com rosto visível). Não realizamos identificação biométrica de terceiros nem venda de dados.</p>

      <p className="font-semibold text-foreground">5. Retenção e seus direitos</p>
      <p>Mantemos os dados pelo tempo necessário para a finalidade de verificação e cumprimento de obrigações legais. Você pode solicitar informações, correção ou exclusão dos seus dados a qualquer momento pelos canais de suporte do app.</p>

      <p className="font-semibold text-foreground">6. Consentimento</p>
      <p>Ao clicar em "Li e aceito", você declara que leu e concorda com este Termo e com a Política de Privacidade, e autoriza o tratamento das imagens enviadas para a finalidade de verificação de identidade.</p>
    </>
  );
}

export default VerificarIdentidade;
