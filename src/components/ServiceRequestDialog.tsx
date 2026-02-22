import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Calendar, ImagePlus, X, Send } from "lucide-react";
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
  const [date, setDate] = useState("");
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep("ask");
    setDescription("");
    setDate("");
    setPhotos([]);
    setSending(false);
  };

  const handleClose = (val: boolean) => {
    if (!val) reset();
    onOpenChange(val);
  };

  const addPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const allowed = ["image/png", "image/jpeg", "image/jpg"];
    const valid = files.filter(f => allowed.includes(f.type));
    if (valid.length !== files.length) {
      toast({ title: "Apenas PNG e JPEG são aceitos.", variant: "destructive" });
    }
    const remaining = 4 - photos.length;
    const toAdd = valid.slice(0, remaining).map(file => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setPhotos(prev => [...prev, ...toAdd]);
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

      // Check professional call limit
      const { data: proRecord } = await supabase.from("professionals").select("user_id").eq("id", professionalId).maybeSingle();
      if (proRecord) {
        const { data: proSub } = await supabase.from("subscriptions").select("plan_id").eq("user_id", proRecord.user_id).maybeSingle();
        if (proSub?.plan_id === "free") {
          const { count } = await supabase.from("service_requests").select("*", { count: "exact", head: true }).eq("professional_id", professionalId);
          if ((count || 0) >= 3) {
            toast({ title: "Este profissional atingiu o limite de chamadas do plano gratuito.", variant: "destructive" });
            setSending(false);
            return;
          }
        }
      }

      // 1. Upload photos to Storage
      const photoUrls: string[] = [];
      for (const p of photos) {
        const fileExt = p.file.name.split('.').pop();
        const fileName = `chat/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from("uploads")
          .upload(fileName, p.file);

        if (!uploadError) {
          const { data: urlData } = supabase.storage.from("uploads").getPublicUrl(fileName);
          photoUrls.push(urlData.publicUrl);
        }
      }

      // 2. Build description for the Request record
      let fullDesc = withDetails && description.trim()
        ? description.trim()
        : `Solicitação de serviço para ${professionalName}`;

      if (withDetails && date) fullDesc += `\n\nData desejada: ${date}`;

      const { data: req, error: reqError } = await supabase.from("service_requests").insert({
        client_id: user.id,
        professional_id: professionalId,
        description: fullDesc,
      }).select().single();

      if (reqError) throw reqError;

      const requestId = (req as any).id;
      const protocol = (req as any).protocol;

      // 3. Send protocol as system message
      if (protocol) {
        await supabase.from("chat_messages").insert({
          request_id: requestId,
          sender_id: user.id,
          content: `📋 PROTOCOLO: ${protocol}\nGuarde este número para referência.`,
        });
      }

      // 4. ✅ FIX: Auto-send first message WITH IMAGES
      let autoMsg = withDetails && description.trim()
        ? `Olá, gostaria de contratar o seu serviço!\n\n${description.trim()}${date ? `\nData desejada: ${date}` : ""}`
        : "Olá, gostaria de contratar o seu serviço!";

      // Enviamos a mensagem incluindo o array de URLs das fotos
      await supabase.from("chat_messages").insert({
        request_id: requestId,
        sender_id: user.id,
        content: autoMsg,
        image_urls: photoUrls.length > 0 ? photoUrls : null // Adicionamos as fotos aqui
      });

      // 5. Notify the professional
      if (proRecord) {
        await supabase.from("notifications").insert({
          user_id: proRecord.user_id,
          title: "Nova chamada recebida! 💬",
          message: `Um cliente solicitou o seu serviço.${protocol ? ` Protocolo: ${protocol}` : ""}`,
          type: "service_request",
          link: `/messages/${requestId}`,
        });
      }

      handleClose(false);
      toast({ title: "Solicitação enviada!", description: "O profissional será notificado." });
      navigate(`/messages/${requestId}`);
    } catch (err: any) {
      toast({ title: "Erro ao enviar solicitação", description: err.message, variant: "destructive" });
    }
    setSending(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Chamar {professionalName}</DialogTitle>
          <DialogDescription>
            {step === "ask"
              ? "Deseja descrever o serviço que precisa?"
              : "Descreva o serviço, adicione fotos e escolha a data."}
          </DialogDescription>
        </DialogHeader>

        {step === "ask" ? (
          <div className="flex flex-col gap-3 pt-2">
            <button
              onClick={() => setStep("form")}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
            >
              Sim, quero descrever
            </button>
            <button
              onClick={() => submit(false)}
              disabled={sending}
              className="w-full py-3 rounded-xl border font-semibold text-sm text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              {sending ? "Enviando..." : "Não, enviar solicitação direto"}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 pt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Descrição do serviço</label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Descreva o que você precisa..."
                className="rounded-xl resize-none"
                rows={3}
                maxLength={500}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Data desejada</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="pl-10 rounded-xl"
                  min={new Date().toISOString().split("T")[0]}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Fotos do serviço ({photos.length}/4)
              </label>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg" multiple onChange={addPhotos} className="hidden" />

              <div className="flex gap-2 flex-wrap">
                {photos.map((p, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden border">
                    <img src={p.preview} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => removePhoto(i)}
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {photos.length < 4 && (
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="w-16 h-16 rounded-xl border-2 border-dashed flex items-center justify-center text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
                  >
                    <ImagePlus className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>

            <button
              onClick={() => submit(true)}
              disabled={sending}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              {sending ? "Enviando..." : "Enviar solicitação"}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ServiceRequestDialog;