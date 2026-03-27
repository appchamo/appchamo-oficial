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

          <div className="bg-card border rounded-2xl p-5 shadow-card space-y-4">
            <p className="text-xs text-muted-foreground">
              Tire fotos com a câmera ou envie imagem/PDF da galeria ou dos arquivos. Boas luzes e documento na horizontal.
            </p>

            {slots.map((slot) => {
              const uploaded = docs.find((d) => d.label === slot.label);
              return (
                <div key={slot.key} className="border rounded-xl p-3">
                  <p className="text-xs font-medium text-foreground mb-2">{slot.label}</p>

                  {uploaded ? (
                    <div className="flex items-center gap-3">
                      <div className="relative w-16 h-12 rounded-lg overflow-hidden border flex-shrink-0 bg-muted flex items-center justify-center">
                        {uploaded.isPdf ? (
                          <FileText className="w-7 h-7 text-primary" />
                        ) : (
                          <img src={uploaded.preview} alt="" className="w-full h-full object-cover" />
                        )}
                        <div className="absolute top-0.5 right-0.5 bg-green-500 rounded-full">
                          <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-foreground font-medium truncate">
                          {uploaded.isPdf ? "PDF enviado" : "Arquivo enviado"}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">{uploaded.file.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {(uploaded.file.size / 1024).toFixed(0)} KB
                        </p>
                        <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1">
                          <button
                            type="button"
                            onClick={() => openCamera(slot.label)}
                            className="text-[10px] text-primary hover:underline"
                          >
                            Câmera
                          </button>
                          <span className="text-[10px] text-muted-foreground">·</span>
                          <button
                            type="button"
                            onClick={() => openFilePicker(slot.label)}
                            className="text-[10px] text-primary hover:underline"
                          >
                            Galeria / PDF
                          </button>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeDoc(slot.label)}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive flex-shrink-0"
                        aria-label="Remover"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => openCamera(slot.label)}
                        className="flex items-center justify-center gap-2 py-3 border-2 border-dashed border-primary/40 rounded-xl text-xs font-medium text-primary hover:bg-primary/5 transition-colors active:scale-[0.98]"
                      >
                        <Camera className="w-4 h-4 shrink-0" />
                        Câmera
                      </button>
                      <button
                        type="button"
                        onClick={() => openFilePicker(slot.label)}
                        className="flex items-center justify-center gap-2 py-3 border-2 border-dashed border-border rounded-xl text-xs font-medium text-foreground hover:bg-muted/60 transition-colors active:scale-[0.98]"
                      >
                        <ImageIcon className="w-4 h-4 shrink-0" />
                        Galeria / PDF
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
