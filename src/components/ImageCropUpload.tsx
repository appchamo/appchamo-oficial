import { useState, useCallback, useRef } from "react";
import Cropper, { Area } from "react-easy-crop";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Upload, ZoomIn, Check, X, Image as ImageIcon, Camera, FolderOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Capacitor } from "@capacitor/core";
import { Camera as CapacitorCamera, CameraSource } from "@capacitor/camera";

interface ImageCropUploadProps {
  onUpload: (path: string) => void; // AGORA RECEBE PATH
  aspect?: number;
  shape?: "round" | "rect";
  bucketPath?: string;
  currentImage?: string | null;
  label?: string;
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.crossOrigin = "anonymous";
    image.src = url;
  });
}

async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  if (ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = "high";
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), "image/webp", 0.95);
  });
}

const ImageCropUpload = ({
  onUpload,
  aspect = 1,
  shape = "round",
  bucketPath = "general",
  currentImage,
  label = "Upload imagem",
}: ImageCropUploadProps) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const openCropWithFile = (file: File) => {
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg"];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: "Formato não permitido", description: "Apenas PNG e JPEG são aceitos.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
      setOpen(true);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    };
    reader.readAsDataURL(file);
  };

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    openCropWithFile(file);
    e.target.value = "";
  };

  const onButtonClick = () => {
    if (Capacitor.isNativePlatform()) {
      setPickerOpen(true);
    } else {
      inputRef.current?.click();
    }
  };

  const handlePickFromGallery = async () => {
    setPickerOpen(false);
    try {
      // Pequeno delay no native para o dialog fechar antes do picker abrir (evita falha no iOS)
      if (Capacitor.isNativePlatform()) {
        await new Promise((r) => setTimeout(r, 300));
      }
      const photo = await CapacitorCamera.getPhoto({
        source: CameraSource.Photos,
        quality: 95,
        allowEditing: false,
      });
      if (!photo.webPath) return;
      const res = await fetch(photo.webPath);
      const blob = await res.blob();
      const file = new File([blob], `foto_${Date.now()}.${photo.format || "jpg"}`, { type: blob.type || "image/jpeg" });
      openCropWithFile(file);
    } catch (err: any) {
      if (err?.message !== "User cancelled photos app") {
        const msg = err?.message || "";
        const hint = msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("denied")
          ? " Verifique em Ajustes > Chamô > Fotos."
          : "";
        toast({ title: "Não foi possível abrir a galeria." + hint, variant: "destructive" });
      }
    }
  };

  const handleTakePhoto = async () => {
    setPickerOpen(false);
    try {
      const photo = await CapacitorCamera.getPhoto({
        source: CameraSource.Camera,
        quality: 95,
        allowEditing: false,
      });
      if (!photo.webPath) return;
      const res = await fetch(photo.webPath);
      const blob = await res.blob();
      const file = new File([blob], `foto_${Date.now()}.${photo.format || "jpg"}`, { type: blob.type || "image/jpeg" });
      openCropWithFile(file);
    } catch (err: any) {
      if (err?.message !== "User cancelled photos app") toast({ title: "Não foi possível abrir a câmera.", variant: "destructive" });
    }
  };

  const handleChooseFile = () => {
    setPickerOpen(false);
    setTimeout(() => inputRef.current?.click(), 100);
  };

  const onCropComplete = useCallback((_: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleSave = async () => {
    if (!imageSrc || !croppedAreaPixels) return;

    setUploading(true);

    try {
      const blob = await getCroppedImg(imageSrc, croppedAreaPixels);

      const fileName = `${bucketPath}/${Date.now()}.webp`;

      const { error: uploadError } = await supabase.storage
        .from("uploads")
        .upload(fileName, blob, {
          contentType: "image/webp",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: publicData } = supabase
  .storage
  .from("uploads")
  .getPublicUrl(fileName);

onUpload(publicData.publicUrl);


      setOpen(false);
      setImageSrc(null);

      toast({ title: "Imagem salva com sucesso!" });
    } catch (err: any) {
      toast({
        title: "Erro ao fazer upload",
        description: err.message,
        variant: "destructive",
      });
    }

    setUploading(false);
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        onChange={onFileSelect}
        className="hidden"
      />

      {label ? (
        <button
          type="button"
          onClick={onButtonClick}
          className="group relative flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-4 hover:border-primary/50 transition-colors cursor-pointer bg-muted/30"
        >
          {currentImage ? (
            <img
              src={currentImage}
              alt="Preview"
              className={`w-20 h-20 object-cover ${
                shape === "round" ? "rounded-full" : "rounded-lg"
              }`}
            />
          ) : (
            <Upload className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
          )}

          <span className="text-xs text-muted-foreground">{label}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={onButtonClick}
          className="w-8 h-8 rounded-full bg-primary/90 text-primary-foreground flex items-center justify-center shadow-md hover:bg-primary transition-colors"
        >
          <Upload className="w-3.5 h-3.5" />
        </button>
      )}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-xs rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">Como deseja enviar?</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 pt-2">
            <button type="button" onClick={handlePickFromGallery}
              className="flex items-center gap-3 w-full p-3 rounded-xl border border-border hover:bg-muted/50 transition-colors text-left">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><ImageIcon className="w-5 h-5 text-primary" /></div>
              <span className="font-medium text-foreground">Galeria de fotos</span>
            </button>
            <button type="button" onClick={handleTakePhoto}
              className="flex items-center gap-3 w-full p-3 rounded-xl border border-border hover:bg-muted/50 transition-colors text-left">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><Camera className="w-5 h-5 text-primary" /></div>
              <span className="font-medium text-foreground">Tirar foto</span>
            </button>
            <button type="button" onClick={handleChooseFile}
              className="flex items-center gap-3 w-full p-3 rounded-xl border border-border hover:bg-muted/50 transition-colors text-left">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><FolderOpen className="w-5 h-5 text-primary" /></div>
              <span className="font-medium text-foreground">Escolher arquivo</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle>Recortar imagem</DialogTitle>
          </DialogHeader>

          <div className="relative w-full h-72 bg-black">
            {imageSrc && (
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={aspect}
                cropShape={shape === "round" ? "round" : "rect"}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            )}
          </div>

          <div className="px-4 py-3 space-y-3">
            <div className="flex items-center gap-3">
              <ZoomIn className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <Slider
                value={[zoom]}
                onValueChange={(v) => setZoom(v[0])}
                min={1}
                max={3}
                step={0.1}
                className="flex-1"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setOpen(false);
                  setImageSrc(null);
                }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium hover:bg-muted transition-colors"
              >
                <X className="w-4 h-4" /> Cancelar
              </button>

              <button
                onClick={handleSave}
                disabled={uploading}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                {uploading ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ImageCropUpload;
