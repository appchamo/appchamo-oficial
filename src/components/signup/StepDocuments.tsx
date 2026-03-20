import { useState } from "react";
import { Camera, FileText, X, CheckCircle2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import DocumentCamera from "./DocumentCamera";

interface UploadedDoc {
  file: File;
  preview: string;
  label: string;
}

interface Props {
  documentType: "cpf" | "cnpj";
  onNext: (files: File[]) => void;
  onBack: () => void;
}

const StepDocuments = ({ documentType, onNext, onBack }: Props) => {
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [currentSlot, setCurrentSlot] = useState("");

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

  const openCamera = (slotLabel: string) => {
    setCurrentSlot(slotLabel);
    setCameraOpen(true);
  };

  const handleCapture = (file: File, preview: string) => {
    setDocs((prev) => [
      ...prev.filter((d) => d.label !== currentSlot),
      { file, preview, label: currentSlot },
    ]);
    setCameraOpen(false);
  };

  const removeDoc = (label: string) =>
    setDocs((prev) => prev.filter((d) => d.label !== label));

  const handleNext = () => {
    const required = slots.map((s) => s.label);
    const uploaded = docs.map((d) => d.label);
    const missing = required.filter((r) => !uploaded.includes(r));
    if (missing.length > 0) {
      toast({ title: `Tire a foto: ${missing.join(", ")}` });
      return;
    }
    onNext(docs.map((d) => d.file));
  };

  return (
    <>
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
              Tire fotos dos seus documentos. Use boa iluminação e mantenha o documento na horizontal.
            </p>

            {slots.map((slot) => {
              const uploaded = docs.find((d) => d.label === slot.label);
              return (
                <div key={slot.key} className="border rounded-xl p-3">
                  <p className="text-xs font-medium text-foreground mb-2">{slot.label}</p>

                  {uploaded ? (
                    <div className="flex items-center gap-3">
                      <div className="relative w-16 h-12 rounded-lg overflow-hidden border flex-shrink-0">
                        <img
                          src={uploaded.preview}
                          alt={slot.label}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute top-0.5 right-0.5 bg-green-500 rounded-full">
                          <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-foreground font-medium truncate">Foto capturada</p>
                        <p className="text-[10px] text-muted-foreground">
                          {(uploaded.file.size / 1024).toFixed(0)} KB
                        </p>
                        <button
                          type="button"
                          onClick={() => openCamera(slot.label)}
                          className="text-[10px] text-primary hover:underline mt-0.5"
                        >
                          Tirar novamente
                        </button>
                      </div>
                      <button
                        onClick={() => removeDoc(slot.label)}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive flex-shrink-0"
                        aria-label="Remover foto"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openCamera(slot.label)}
                      className="w-full flex items-center justify-center gap-2 py-3.5 border-2 border-dashed border-primary/40 rounded-xl text-sm font-medium text-primary hover:bg-primary/5 transition-colors active:scale-[0.98]"
                    >
                      <Camera className="w-4 h-4" />
                      Tirar Foto
                    </button>
                  )}
                </div>
              );
            })}

            <div className="flex gap-2 pt-1">
              <button
                onClick={onBack}
                className="flex-1 py-2.5 rounded-xl border text-sm font-medium hover:bg-muted transition-colors"
              >
                Voltar
              </button>
              <button
                onClick={handleNext}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
              >
                Próximo →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Camera fullscreen modal */}
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
