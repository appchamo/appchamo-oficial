import { useState, useRef, useEffect } from "react";
import { Camera, FileText, X, CheckCircle2, ImageIcon } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import DocumentCamera from "./DocumentCamera";

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docsRef = useRef(docs);
  docsRef.current = docs;

  const slots =
    documentType === "cnpj"
      ? [
          { key: "id_front", label: "Documento com foto (frente)" },
          { key: "id_back", label: "Documento com foto (verso)" },
          { key: "cnpj_doc", label: "Comprovante de CNPJ" },
        ]
      : [
          { key: "id_front", label: "Documento com foto (frente)" },
          { key: "id_back", label: "Documento com foto (verso)" },
        ];

  useEffect(() => {
    return () => {
      docsRef.current.forEach((d) => {
        if (d.preview.startsWith("blob:")) URL.revokeObjectURL(d.preview);
      });
    };
  }, []);

  const openCamera = (slotLabel: string) => {
    setCurrentSlot(slotLabel);
    setCameraOpen(true);
  };

  const openFilePicker = (slotLabel: string) => {
    setPickForSlot(slotLabel);
    fileInputRef.current?.click();
  };

  const handleCapture = (file: File, preview: string) => {
    setDocs((prev) => {
      const old = prev.find((d) => d.label === currentSlot);
      if (old?.preview.startsWith("blob:")) URL.revokeObjectURL(old.preview);
      return [...prev.filter((d) => d.label !== currentSlot), { file, preview, label: currentSlot, isPdf: false }];
    });
    setCameraOpen(false);
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      toast({ title: "Documentos pendentes", description: missing.join(", "), variant: "destructive" });
      return;
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

            {slots.map((slot) => {
              const uploaded = docs.find((d) => d.label === slot.label);
              return (
                <div
                  key={slot.key}
                  className="rounded-2xl border border-border/80 bg-gradient-to-b from-primary/[0.06] to-transparent p-4 space-y-3"
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
                          <button
                            type="button"
                            onClick={() => openFilePicker(slot.label)}
                            className="text-[11px] font-semibold text-primary hover:underline"
                          >
                            Trocar arquivo
                          </button>
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
          onCapture={handleCapture}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </>
  );
};

export default StepDocuments;
