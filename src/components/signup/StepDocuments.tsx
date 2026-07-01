import { useState, useRef, useEffect } from "react";
import { Camera, FileText, X, CheckCircle2, ImageIcon, ScanFace, IdCard, Car, Plane } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { registerChamoSignupOverlayConsumer } from "@/lib/chamoSignupBack";
import DocumentCamera from "./DocumentCamera";
import { supabase } from "@/integrations/supabase/client";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

interface UploadedDoc {
  file: File;
  preview: string;
  label: string;
  isPdf?: boolean;
}

interface Props {
  documentType: "cpf" | "cnpj";
  onNext: (files: File[]) => void;
  onBack: () => void;
  onExitToLogin?: () => void | Promise<void>;
}

const MAX_FILE_BYTES = 12 * 1024 * 1024;

const StepDocuments = ({ documentType, onNext, onBack, onExitToLogin }: Props) => {
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [currentSlot, setCurrentSlot] = useState("");
  const [pickForSlot, setPickForSlot] = useState<string | null>(null);
  /** Destaca slots obrigatórios em falta após tentar avançar. */
  const [missingSlotKeys, setMissingSlotKeys] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docsRef = useRef(docs);
  docsRef.current = docs;
  const cameraOpenRef = useRef(false);
  cameraOpenRef.current = cameraOpen;
  /** Android: após abrir o seletor de ficheiros, o 1.º “voltar” pode ir para o WebView; não mudar de etapa. */
  const suppressHardwareBackUntilRef = useRef(0);

  useEffect(() => {
    return registerChamoSignupOverlayConsumer(() => {
      if (cameraOpenRef.current) {
        setCameraOpen(false);
        return true;
      }
      if (Date.now() < suppressHardwareBackUntilRef.current) return true;
      return false;
    });
  }, []);

  const SELFIE_LABEL = "Reconhecimento facial (selfie)";

  // Tipo de documento (escolhido em modal obrigatório antes de tirar frente/verso).
  type DocType = "identidade" | "passaporte" | "cnh";
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
  const [docType, setDocType] = useState<DocType | null>(null);
  const docTypeName = docType ? DOC_TYPES.find((t) => t.key === docType)!.name : "";
  const idFrontLabel = docType ? DOC_TYPE_LABELS[docType].front : "Documento (frente)";
  const idBackLabel = docType ? DOC_TYPE_LABELS[docType].back : "Documento (verso)";

  const slots =
    documentType === "cnpj"
      ? [
          { key: "id_front", label: idFrontLabel },
          { key: "id_back", label: idBackLabel },
          { key: "cnpj_doc", label: "Comprovante de CNPJ" },
          { key: "selfie", label: SELFIE_LABEL },
        ]
      : [
          { key: "id_front", label: idFrontLabel },
          { key: "id_back", label: idBackLabel },
          { key: "selfie", label: SELFIE_LABEL },
        ];

  // Ao trocar o tipo de documento, remove frente/verso já capturados (labels mudam).
  const chooseDocType = (t: DocType) => {
    setDocs((prev) =>
      prev.filter((d) => {
        const isId = d.label === idFrontLabel || d.label === idBackLabel;
        if (isId && d.preview.startsWith("blob:")) URL.revokeObjectURL(d.preview);
        return !isId;
      }),
    );
    setMissingSlotKeys((prev) => prev.filter((k) => k !== "id_front" && k !== "id_back"));
    setDocType(t);
  };

  useEffect(() => {
    return () => {
      docsRef.current.forEach((d) => {
        if (d.preview.startsWith("blob:")) URL.revokeObjectURL(d.preview);
      });
    };
  }, []);

  const openCamera = (slotLabel: string) => {
    setCurrentSlot(slotLabel);
    suppressHardwareBackUntilRef.current = Date.now() + 600;
    setCameraOpen(true);
  };

  const openFilePicker = (slotLabel: string) => {
    setPickForSlot(slotLabel);
    suppressHardwareBackUntilRef.current = Date.now() + 1400;
    fileInputRef.current?.click();
  };

  const clearSlotHighlight = (label: string) => {
    const sk = slots.find((s) => s.label === label)?.key;
    if (!sk) return;
    setMissingSlotKeys((prev) => prev.filter((k) => k !== sk));
  };

  const handleCapture = (file: File, preview: string) => {
    clearSlotHighlight(currentSlot);
    setDocs((prev) => {
      const old = prev.find((d) => d.label === currentSlot);
      if (old?.preview.startsWith("blob:")) URL.revokeObjectURL(old.preview);
      return [...prev.filter((d) => d.label !== currentSlot), { file, preview, label: currentSlot, isPdf: false }];
    });
    setCameraOpen(false);
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    suppressHardwareBackUntilRef.current = 0;
    const file = e.target.files?.[0];
    e.target.value = "";
    const slot = pickForSlot;
    setPickForSlot(null);
    if (!file || !slot) return;

    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    const isImg = file.type.startsWith("image/");
    if (!isPdf && !isImg) {
      toast({ title: "Formato inválido", description: "Envie imagem (JPG, PNG, WEBP) ou PDF.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast({ title: "Arquivo muito grande", description: "Máximo 12 MB por arquivo.", variant: "destructive" });
      return;
    }

    clearSlotHighlight(slot);
    setDocs((prev) => {
      const old = prev.find((d) => d.label === slot);
      if (old?.preview.startsWith("blob:")) URL.revokeObjectURL(old.preview);
      if (isPdf) {
        return [...prev.filter((d) => d.label !== slot), { file, preview: "", label: slot, isPdf: true }];
      }
      const preview = URL.createObjectURL(file);
      return [...prev.filter((d) => d.label !== slot), { file, preview, label: slot, isPdf: false }];
    });
  };

  const removeDoc = (label: string) => {
    setDocs((prev) => {
      const d = prev.find((x) => x.label === label);
      if (d?.preview.startsWith("blob:")) URL.revokeObjectURL(d.preview);
      return prev.filter((x) => x.label !== label);
    });
  };

  const handleNext = () => {
    const required = slots.map((s) => s.label);
    const uploaded = docs.map((d) => d.label);
    const missing = required.filter((r) => !uploaded.includes(r));
    if (missing.length > 0) {
      const keys = slots.filter((s) => missing.includes(s.label)).map((s) => s.key);
      setMissingSlotKeys(keys);
      toast({
        title: "Documentos pendentes",
        description: "Os blocos em destaque precisam de um arquivo.",
        variant: "destructive",
      });
      const first = slots.find((s) => keys.includes(s.key));
      if (first) {
        requestAnimationFrame(() => {
          document.getElementById(`signup-doc-${first.key}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      }
      return;
    }
    setMissingSlotKeys([]);

    // Checagem de qualidade (IA) da selfie + documento — não bloqueia o cadastro.
    const selfieDoc = docs.find((d) => d.label === SELFIE_LABEL && !d.isPdf);
    const frontDoc = docs.find((d) => d.label === idFrontLabel && !d.isPdf);
    if (selfieDoc) {
      (async () => {
        try {
          const selfie = await fileToDataUrl(selfieDoc.file);
          const document = frontDoc ? await fileToDataUrl(frontDoc.file) : undefined;
          await supabase.functions.invoke("analyze-selfie-quality", { body: { selfie, document, doc_type: docType } });
        } catch { /* análise é best-effort */ }
      })();
    }

    onNext(docs.map((d) => d.file));
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf,.pdf"
        className="hidden"
        onChange={onFileInputChange}
      />

      <div className="min-h-screen bg-background flex flex-col items-center justify-start px-4 py-8">
        <div className="w-full max-w-sm">
          <div className="text-center mb-4">
            <h1 className="text-2xl font-extrabold text-gradient mb-1">Chamô</h1>
            <p className="text-sm text-muted-foreground">
              Etapa 2 de 3 · <strong>Documentos</strong>
            </p>
            <button onClick={onBack} className="text-xs text-primary mt-1 hover:underline">
              ← Voltar
            </button>
          </div>

          <div className="bg-card border border-primary/10 rounded-2xl p-5 shadow-card space-y-4 ring-1 ring-primary/5">
            <p className="text-xs text-muted-foreground leading-relaxed text-center px-1">
              Use a câmera ou envie <strong className="text-foreground font-semibold">foto ou PDF</strong>. Documento na horizontal e bem iluminado.
            </p>

            {docType && (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-primary/[0.06] border border-primary/15 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  {(() => {
                    const T = DOC_TYPES.find((t) => t.key === docType)!;
                    return <T.Icon className="w-4 h-4 text-primary shrink-0" />;
                  })()}
                  <span className="text-xs font-semibold text-foreground truncate">
                    Documento: {docTypeName}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setDocType(null)}
                  className="text-[11px] font-semibold text-primary hover:underline shrink-0"
                >
                  Trocar tipo
                </button>
              </div>
            )}

            {slots.map((slot) => {
              const uploaded = docs.find((d) => d.label === slot.label);
              return (
                <div
                  key={slot.key}
                  id={`signup-doc-${slot.key}`}
                  className={cn(
                    "rounded-2xl border border-border/80 bg-gradient-to-b from-primary/[0.06] to-transparent p-4 space-y-3 transition-colors",
                    missingSlotKeys.includes(slot.key) &&
                      "border-destructive border-2 ring-2 ring-destructive/25 shadow-sm shadow-destructive/10",
                  )}
                >
                  <p className="text-sm font-semibold text-foreground tracking-tight">{slot.label}</p>

                  {uploaded ? (
                    <div className="flex items-center gap-3 rounded-xl bg-card border border-border/60 p-2 pr-1 shadow-sm">
                      <div className="relative w-[4.5rem] h-[3.25rem] rounded-lg overflow-hidden border border-border/50 flex-shrink-0 bg-muted flex items-center justify-center">
                        {uploaded.isPdf ? (
                          <FileText className="w-7 h-7 text-primary" />
                        ) : (
                          <img src={uploaded.preview} alt="" className="w-full h-full object-cover" />
                        )}
                        <div className="absolute top-0.5 right-0.5 bg-emerald-500 rounded-full shadow-sm">
                          <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">
                          {uploaded.isPdf ? "PDF enviado" : "Arquivo enviado"}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">{uploaded.file.name}</p>
                        <p className="text-[11px] text-muted-foreground tabular-nums">
                          {(uploaded.file.size / 1024).toFixed(0)} KB
                        </p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <button
                            type="button"
                            onClick={() => openCamera(slot.label)}
                            className="text-[11px] font-semibold text-primary hover:underline"
                          >
                            Tirar outra
                          </button>
                          {slot.key !== "selfie" && (
                            <button
                              type="button"
                              onClick={() => openFilePicker(slot.label)}
                              className="text-[11px] font-semibold text-primary hover:underline"
                            >
                              Trocar arquivo
                            </button>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeDoc(slot.label)}
                        className="p-2 rounded-xl hover:bg-destructive/10 text-destructive flex-shrink-0 transition-colors"
                        aria-label="Remover"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : slot.key === "selfie" ? (
                    /* Selfie: só câmera ao vivo (sem galeria), com ícone de rosto. */
                    <button
                      type="button"
                      onClick={() => openCamera(slot.label)}
                      className="group flex w-full items-center justify-center gap-3 py-4 px-2 rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90 active:scale-[0.98] transition-all"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
                        <ScanFace className="w-5 h-5 shrink-0" />
                      </span>
                      <span className="text-sm font-bold leading-tight">Fazer reconhecimento facial</span>
                    </button>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => openCamera(slot.label)}
                        className="group flex flex-col items-center justify-center gap-2 py-4 px-2 rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90 active:scale-[0.98] transition-all"
                      >
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
                          <Camera className="w-5 h-5 shrink-0" />
                        </span>
                        <span className="text-xs font-bold leading-tight">Câmera</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openFilePicker(slot.label)}
                        className="group flex flex-col items-center justify-center gap-2 py-4 px-2 rounded-2xl border-2 border-primary/25 bg-card text-foreground hover:border-primary/45 hover:bg-primary/[0.04] active:scale-[0.98] transition-all"
                      >
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary/15 transition-colors">
                          <ImageIcon className="w-5 h-5 shrink-0" />
                        </span>
                        <span className="text-xs font-bold leading-tight text-center">
                          Galeria
                          <span className="block text-[10px] font-semibold text-muted-foreground">ou PDF</span>
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onBack}
                className="flex-1 py-2.5 rounded-xl border text-sm font-medium hover:bg-muted transition-colors"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
              >
                Próximo →
              </button>
            </div>
          </div>

          {onExitToLogin && (
            <p className="text-center text-xs text-muted-foreground mt-6 pb-4">
              Já tem uma conta?{" "}
              <button
                type="button"
                onClick={() => void onExitToLogin()}
                className="text-primary font-bold hover:underline bg-transparent border-none cursor-pointer p-0"
              >
                Entrar
              </button>
            </p>
          )}
        </div>
      </div>

      {cameraOpen && (
        <DocumentCamera
          label={currentSlot}
          facing={currentSlot === SELFIE_LABEL ? "user" : "environment"}
          onCapture={handleCapture}
          onClose={() => setCameraOpen(false)}
        />
      )}

      {/* Modal obrigatório: escolher o tipo de documento antes de tirar frente/verso. */}
      {docType === null && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 px-4 pb-6 pt-safe-top">
          <div className="w-full max-w-sm rounded-3xl bg-card border border-border shadow-xl p-5 space-y-4">
            <div className="text-center space-y-1">
              <h2 className="text-lg font-extrabold text-foreground">Qual documento você vai enviar?</h2>
              <p className="text-xs text-muted-foreground">
                Escolha o tipo. Depois pedimos a <strong>frente</strong> e o <strong>verso</strong>.
              </p>
            </div>
            <div className="space-y-2.5">
              {DOC_TYPES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => chooseDocType(t.key)}
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
            <button
              type="button"
              onClick={onBack}
              className="w-full py-2.5 rounded-xl border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
            >
              Voltar
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default StepDocuments;
