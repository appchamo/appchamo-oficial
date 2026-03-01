import { useState, useRef } from "react";
import { Upload, FileText, X, Camera, Image, FolderOpen } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Capacitor } from "@capacitor/core";
import { Camera as CapacitorCamera, CameraSource } from "@capacitor/camera";

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
  const inputImageOnlyRef = useRef<HTMLInputElement>(null);
  const [currentSlot, setCurrentSlot] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [picking, setPicking] = useState(false);

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

  const addFile = (file: File) => {
    if (file.size > MAX_SIZE) {
      toast({ title: "Arquivo muito grande. Máximo 15MB." });
      return;
    }
    const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : "";
    setDocs((prev) => [...prev.filter((d) => d.label !== currentSlot), { file, preview, label: currentSlot }]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    addFile(file);
    e.target.value = "";
  };

  const handlePickFromGallery = async () => {
    setPicking(true);
    setPickerOpen(false);
    try {
      if (Capacitor.isNativePlatform()) {
        await new Promise((r) => setTimeout(r, 300));
        const photo = await CapacitorCamera.getPhoto({
          source: CameraSource.Photos,
          quality: 90,
          allowEditing: false,
        });
        if (!photo.webPath) throw new Error("Sem imagem");
        const res = await fetch(photo.webPath);
        const blob = await res.blob();
        const file = new File([blob], `foto_${Date.now()}.${photo.format || "jpg"}`, { type: blob.type || "image/jpeg" });
        addFile(file);
      } else {
        inputImageOnlyRef.current?.removeAttribute("capture");
        inputImageOnlyRef.current?.click();
      }
    } catch (err: any) {
      if (err?.message !== "User cancelled photos app") {
        const msg = (err?.message || "").toLowerCase();
        const hint = msg.includes("permission") || msg.includes("denied") ? " Verifique em Ajustes > Chamô > Fotos." : "";
        toast({ title: "Não foi possível abrir a galeria." + hint, variant: "destructive" });
      }
    } finally {
      setPicking(false);
    }
  };

  const handleTakePhoto = async () => {
    setPicking(true);
    setPickerOpen(false);
    try {
      if (Capacitor.isNativePlatform()) {
        const photo = await CapacitorCamera.getPhoto({
          source: CameraSource.Camera,
          quality: 90,
          allowEditing: false,
        });
        if (!photo.webPath) throw new Error("Sem imagem");
        const res = await fetch(photo.webPath);
        const blob = await res.blob();
        const file = new File([blob], `foto_${Date.now()}.${photo.format || "jpg"}`, { type: blob.type || "image/jpeg" });
        addFile(file);
      } else {
        inputImageOnlyRef.current?.setAttribute("capture", "user");
        inputImageOnlyRef.current?.click();
      }
    } catch (err: any) {
      if (err?.message !== "User cancelled photos app") toast({ title: "Não foi possível abrir a câmera.", variant: "destructive" });
    } finally {
      setPicking(false);
    }
  };

  const handleChooseFile = () => {
    setPickerOpen(false);
    setTimeout(() => inputRef.current?.click(), 100);
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
          <input ref={inputImageOnlyRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />

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
                  <button
                    type="button"
                    onClick={() => { setCurrentSlot(slot.label); setPickerOpen(true); }}
                    disabled={picking}
                    className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed rounded-xl text-xs text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-60"
                  >
                    <Upload className="w-4 h-4" />
                    {picking ? "Abrindo..." : "Selecionar arquivo"}
                  </button>
                )}
              </div>
            );
          })}

          <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
          <DialogContent className="max-w-xs rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-base">Como deseja enviar?</DialogTitle>
            </DialogHeader>
            <div className="grid gap-2 pt-2">
              <button
                type="button"
                onClick={handlePickFromGallery}
                className="flex items-center gap-3 w-full p-3 rounded-xl border border-border hover:bg-muted/50 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Image className="w-5 h-5 text-primary" />
                </div>
                <span className="font-medium text-foreground">Galeria de fotos</span>
              </button>
              <button
                type="button"
                onClick={handleTakePhoto}
                className="flex items-center gap-3 w-full p-3 rounded-xl border border-border hover:bg-muted/50 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Camera className="w-5 h-5 text-primary" />
                </div>
                <span className="font-medium text-foreground">Tirar foto</span>
              </button>
              <button
                type="button"
                onClick={handleChooseFile}
                className="flex items-center gap-3 w-full p-3 rounded-xl border border-border hover:bg-muted/50 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <FolderOpen className="w-5 h-5 text-primary" />
                </div>
                <span className="font-medium text-foreground">Escolher arquivo</span>
              </button>
            </div>
          </DialogContent>
        </Dialog>

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
