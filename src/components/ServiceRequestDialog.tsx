import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ImagePlus, X, Send, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

interface ServiceRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  professionalId: string;
  professionalName: string;
}

const ServiceRequestDialog = ({ open, onOpenChange, professionalId, professionalName }: ServiceRequestDialogProps) => {
  const navigate = useNavigate();
  const [step, setStep] = useState<"ask" | "form">("ask");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [sending, setSending] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep("ask");
    setDescription("");
    setPhotos([]);
    setSending(false);
  };

  const handleClose = (val: boolean) => {
    if (!val) reset();
    onOpenChange(val);
  };

  const addPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (files.length === 0) return;
    setIsCompressing(true);

    const compressedPhotos = await Promise.all(
      files.map(async (file) => {
        if (!allowed.includes(file.type)) return null;
        return new Promise<{ file: File; preview: string }>((resolve) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
              const canvas = document.createElement("canvas");
              let width = img.width;
              let height = img.height;
              const MAX_WIDTH = 1200;
              if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
              canvas.width = width; canvas.height = height;
              const ctx = canvas.getContext("2d");
              ctx?.drawImage(img, 0, 0, width, height);
              canvas.toBlob((blob) => {
                if (blob) {
                  const newFile = new File([blob], file.name.replace(/\.[^/.]+$/, ".webp"), { type: "image/webp" });
                  resolve({ file: newFile, preview: URL.createObjectURL(newFile) });
                }
              }, "image/webp", 0.7);
            };
          };
        });
      })
    );

    const validPhotos = compressedPhotos.filter((p): p is { file: File; preview: string } => p !== null);
    setPhotos(prev => [...prev, ...validPhotos].slice(0, 4));
    setIsCompressing(false);
    e.target.value = "";
  };

  const removePhoto = (idx: number) => {
    setPhotos(prev => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const submit = async (withDetails: boolean) => {
    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/login"); return; }

      // 1. Upload das fotos
      const photoUrls: string[] = [];
      for (const p of photos) {
        const fileName = `chat/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;
        const { error: uploadError } = await supabase.storage.from("uploads").upload(fileName, p.file);
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from("uploads").getPublicUrl(fileName);
          photoUrls.push(urlData.publicUrl);
        }
      }

      // 2. Criar o pedido
      const fullDesc = withDetails && description.trim() ? description.trim() : `Solicitação para ${professionalName}`;
      const { data: req, error: reqError } = await supabase.from("service_requests").insert({
        client_id: user.id,
        professional_id: professionalId,
        description: fullDesc,
      }).select().single();

      if (reqError) throw reqError;
      const requestId = req.id;
      const protocol = (req as any).protocol;

      // 3. Mensagem de Protocolo
      if (protocol) {
        await supabase.from("chat_messages").insert({
          request_id: requestId,
          sender_id: user.id,
          content: `📋 PROTOCOLO: ${protocol}`,
        });
      }

      // 4. PRIMEIRA MENSAGEM COM FOTOS (Ajustado para image_urls e sem data)
      const autoMsg = withDetails && description.trim()
        ? `Olá! Gostaria de contratar seu serviço.\n\n${description.trim()}`
        : "Olá! Gostaria de contratar seu serviço.";

      await supabase.from("chat_messages").insert({
        request_id: requestId,
        sender_id: user.id,
        content: autoMsg,
        image_urls: photoUrls.length > 0 ? photoUrls : null
      });

      // 5. Notificação
      const { data: proRecord } = await supabase.from("professionals").select("user_id").eq("id", professionalId).single();
      if (proRecord) {
        await supabase.from("notifications").insert({
          user_id: proRecord.user_id,
          title: "Novo serviço solicitado! 💬",
          message: `Um cliente chamou você."}`,
          type: "service_request",
          link: `/messages/${requestId}`,
        });
      }

      handleClose(false);
      toast({ title: "Solicitação enviada com sucesso!" });
      navigate(`/messages/${requestId}`);
    } catch (err: any) {
      toast({ title: "Erro ao enviar", description: err.message, variant: "destructive" });
    }
    setSending(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-bold">Chamar {professionalName}</DialogTitle>
          <DialogDescription>
            {step === "ask" ? "Deseja descrever o serviço?" : "Envie detalhes e fotos para o profissional."}
          </DialogDescription>
        </DialogHeader>

        {step === "ask" ? (
          <div className="flex flex-col gap-3 pt-2">
            <button onClick={() => setStep("form")} className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm">
              Sim, quero descrever
            </button>
            <button onClick={() => submit(false)} disabled={sending} className="w-full py-3 rounded-xl border font-bold text-sm disabled:opacity-50">
              {sending ? "Enviando..." : "Não, chamar agora"}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 pt-2">
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="O que você precisa?" className="rounded-xl" rows={3} />
            
            <div>
              <p className="text-[10px] font-bold uppercase text-muted-foreground mb-2">Fotos do problema ({photos.length}/4)</p>
              <div className="flex gap-2 flex-wrap">
                {photos.map((p, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden border">
                    <img src={p.preview} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => removePhoto(i)} className="absolute top-0 right-0 p-1 bg-destructive text-white rounded-bl-lg"><X className="w-3 h-3" /></button>
                  </div>
                ))}
                {photos.length < 4 && (
                  <button onClick={() => fileRef.current?.click()} className="w-16 h-16 rounded-xl border-2 border-dashed flex items-center justify-center text-muted-foreground">
                    <ImagePlus className="w-5 h-5" />
                  </button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" multiple onChange={addPhotos} className="hidden" />
            </div>

            <button onClick={() => submit(true)} disabled={sending || isCompressing} className="w-full py-4 rounded-xl bg-primary text-white font-bold flex items-center justify-center gap-2">
              {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> ENVIANDO...</> : <><Send className="w-4 h-4" /> CONFIRMAR CHAMADA</>}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ServiceRequestDialog;