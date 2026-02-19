import { useState, useCallback, useRef } from "react";
import Cropper, { Area } from "react-easy-crop";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Upload, ZoomIn, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

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

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), "image/webp", 0.9);
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
  const inputRef = useRef<HTMLInputElement>(null);

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/png", "image/jpeg", "image/jpg"];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Formato não permitido",
        description: "Apenas PNG e JPEG são aceitos.",
        variant: "destructive",
      });
      e.target.value = "";
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
    e.target.value = "";
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
          onClick={() => inputRef.current?.click()}
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
          onClick={() => inputRef.current?.click()}
          className="w-8 h-8 rounded-full bg-primary/90 text-primary-foreground flex items-center justify-center shadow-md hover:bg-primary transition-colors"
        >
          <Upload className="w-3.5 h-3.5" />
        </button>
      )}

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
