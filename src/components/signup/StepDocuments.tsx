import { useState, useRef } from "react";
import { Upload, FileText, X, Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";

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

const MAX_SIZE = 15 * 1024 * 1024; // 15MB
const ACCEPTED = ".jpg,.jpeg,.png,.pdf";

const StepDocuments = ({ documentType, onNext, onBack }: Props) => {
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [currentSlot, setCurrentSlot] = useState("");

  const slots = documentType === "cnpj"
    ? [
        { key: "id_front", label: "Documento com foto (frente)" },
        { key: "id_back", label: "Documento com foto (verso)" },
        { key: "cnpj_doc", label: "Comprovante de CNPJ" },
      ]
    : [
        { key: "id_front", label: "Documento com foto (frente)" },
        { key: "id_back", label: "Documento com foto (verso)" },
      ];

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_SIZE) { toast({ title: "Arquivo muito grande. Máximo 15MB." }); return; }
    
    const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : "";
    setDocs((prev) => [...prev.filter((d) => d.label !== currentSlot), { file, preview, label: currentSlot }]);
    e.target.value = "";
  };

  const removeDoc = (label: string) => setDocs((prev) => prev.filter((d) => d.label !== label));

  const handleNext = () => {
    const required = slots.map((s) => s.label);
    const uploaded = docs.map((d) => d.label);
    const missing = required.filter((r) => !uploaded.includes(r));
    if (missing.length > 0) {
      toast({ title: `Envie: ${missing.join(", ")}` });
      return;
    }
    onNext(docs.map((d) => d.file));
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-start px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-4">
          <h1 className="text-2xl font-extrabold text-gradient mb-1">Chamô</h1>
          <p className="text-sm text-muted-foreground">Etapa 2 de 3 · <strong>Documentos</strong></p>
          <button onClick={onBack} className="text-xs text-primary mt-1 hover:underline">← Voltar</button>
        </div>

        <div className="bg-card border rounded-2xl p-5 shadow-card space-y-4">
          <p className="text-xs text-muted-foreground">
            Envie documentos em JPG, PNG ou PDF (máx. 15MB). O servidor comprime automaticamente.
          </p>

          <input ref={inputRef} type="file" accept={ACCEPTED} onChange={handleFileSelect} className="hidden" />

          {slots.map((slot) => {
            const uploaded = docs.find((d) => d.label === slot.label);
            return (
              <div key={slot.key} className="border rounded-xl p-3">
                <p className="text-xs font-medium text-foreground mb-2">{slot.label}</p>
                {uploaded ? (
                  <div className="flex items-center gap-3">
                    {uploaded.preview ? (
                      <img src={uploaded.preview} alt="" className="w-14 h-14 rounded-lg object-cover border" />
                    ) : (
                      <div className="w-14 h-14 rounded-lg bg-accent flex items-center justify-center">
                        <FileText className="w-6 h-6 text-primary" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground truncate">{uploaded.file.name}</p>
                      <p className="text-[10px] text-muted-foreground">{(uploaded.file.size / 1024).toFixed(0)} KB</p>
                    </div>
                    <button onClick={() => removeDoc(slot.label)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => { setCurrentSlot(slot.label); inputRef.current?.click(); }}
                    className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed rounded-xl text-xs text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors">
                    <Upload className="w-4 h-4" />
                    Selecionar arquivo
                  </button>
                )}
              </div>
            );
          })}

          <div className="flex gap-2 pt-1">
            <button onClick={onBack}
              className="flex-1 py-2.5 rounded-xl border text-sm font-medium hover:bg-muted transition-colors">
              Voltar
            </button>
            <button onClick={handleNext}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors">
              Próximo →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StepDocuments;
