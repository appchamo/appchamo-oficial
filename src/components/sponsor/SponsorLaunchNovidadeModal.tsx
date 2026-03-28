import { useCallback, useEffect, useRef, useState } from "react";
import { X, Loader2, ImagePlus, Link as LinkIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { compressSponsorStoryImage } from "@/lib/compressSponsorStoryImage";
import type { LinkedSponsor } from "@/hooks/useLinkedSponsor";

const WEEKLY_LIMIT: Record<string, number> = {
  free: 4,
  pack_14: 14,
  pack_28: 28,
};

interface SponsorLaunchNovidadeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sponsor: LinkedSponsor | null;
  onPublished?: () => void;
}

const SponsorLaunchNovidadeModal = ({
  open,
  onOpenChange,
  sponsor,
  onPublished,
}: SponsorLaunchNovidadeModalProps) => {
  const [caption, setCaption] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [weeklyUsed, setWeeklyUsed] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const limit = sponsor ? WEEKLY_LIMIT[sponsor.weekly_plan] ?? 4 : 4;

  const reset = useCallback(() => {
    setCaption("");
    setLinkUrl("");
    setFile(null);
    setPreview(null);
  }, []);

  useEffect(() => {
    if (!open || !sponsor) return;
    reset();
    void (async () => {
      const { data } = await supabase.rpc("get_sponsor_weekly_used" as never, {
        p_sponsor_id: sponsor.id,
      } as never);
      setWeeklyUsed(typeof data === "number" ? data : 0);
    })();
  }, [open, sponsor?.id, reset]);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const onPickFile = async (f: File | null) => {
    if (!f || !f.type.startsWith("image/")) {
      if (f) toast({ title: "Escolhe uma imagem", variant: "destructive" });
      return;
    }
    setCompressing(true);
    try {
      const compressed = await compressSponsorStoryImage(f);
      setFile(compressed);
    } catch {
      setFile(f);
    } finally {
      setCompressing(false);
    }
  };

  const handlePublish = async () => {
    if (!sponsor || !file) {
      toast({ title: "Adiciona uma foto", variant: "destructive" });
      return;
    }
    if (weeklyUsed >= limit) {
      toast({ title: `Limite semanal atingido (${limit} novidades)`, variant: "destructive" });
      return;
    }
    const trimmedLink = linkUrl.trim();
    let normalizedLink: string | null = null;
    if (trimmedLink) {
      const candidate = trimmedLink.includes("://") ? trimmedLink : `https://${trimmedLink}`;
      try {
        normalizedLink = new URL(candidate).toString();
      } catch {
        toast({ title: "Link inválido", description: "Usa um endereço válido (ex.: https://…)", variant: "destructive" });
        return;
      }
    }

    setPosting(true);
    try {
      const ext = file.name.split(".").pop() || "webp";
      const path = `stories/${sponsor.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("sponsor-stories").upload(path, file, {
        contentType: file.type || "image/webp",
        upsert: false,
      });
      if (upErr) throw new Error(upErr.message);

      const { data: urlData } = supabase.storage.from("sponsor-stories").getPublicUrl(path);
      const photo_url = urlData.publicUrl;

      const { error: insertErr } = await supabase.from("sponsor_stories").insert({
        sponsor_id: sponsor.id,
        photo_url,
        caption: caption.trim() || null,
        link_url: normalizedLink,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      if (insertErr) throw new Error(insertErr.message);

      toast({ title: "Novidade publicada!", description: "Fica visível por 24 horas." });
      onOpenChange(false);
      reset();
      onPublished?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao publicar";
      toast({ title: "Erro ao publicar", description: msg, variant: "destructive" });
    } finally {
      setPosting(false);
    }
  };

  if (!sponsor) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!fixed !inset-0 !left-0 !top-0 z-[70] flex h-[100dvh] max-h-none w-full max-w-none !translate-x-0 !translate-y-0 flex-col gap-0 rounded-none border-0 bg-background p-0 overflow-hidden shadow-none data-[state=open]:slide-in-from-bottom-0 data-[state=closed]:slide-out-to-bottom-0 [&>button]:hidden"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">Lançar novidade</DialogTitle>
        <div className="flex items-center gap-2 px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] border-b border-border/50 shrink-0 bg-background">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted"
            onClick={() => onOpenChange(false)}
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
          <span className="font-bold text-[17px] flex-1 text-center pr-10">Nova novidade</span>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
          <p className="text-[12px] text-muted-foreground leading-snug">
            Foto obrigatória · texto e link são opcionais · cada novidade pode ter um{" "}
            <strong className="text-foreground">link diferente</strong>
          </p>
          <p className="text-[11px] text-muted-foreground">
            {weeklyUsed}/{limit} novidades usadas esta semana
          </p>

          <div className="flex flex-wrap gap-2">
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onPickFile(e.target.files?.[0] || null)} />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => void onPickFile(e.target.files?.[0] || null)}
            />
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              disabled={compressing}
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus className="w-4 h-4 mr-2" />
              Galeria
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              disabled={compressing}
              onClick={() => cameraInputRef.current?.click()}
            >
              Tirar foto
            </Button>
            {compressing ? (
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> A otimizar…
              </span>
            ) : null}
          </div>

          {preview ? (
            <div className="relative rounded-xl overflow-hidden border border-border/60 bg-muted max-h-[45vh]">
              <img src={preview} alt="" className="w-full max-h-[45vh] object-contain" />
              <button
                type="button"
                className="absolute top-2 right-2 w-9 h-9 rounded-full bg-black/65 text-white flex items-center justify-center"
                onClick={() => setFile(null)}
                aria-label="Remover foto"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : null}

          <div>
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Texto (opcional)
            </label>
            <Textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Mensagem curta para acompanhar a imagem…"
              className="min-h-[100px] rounded-xl resize-none text-[15px]"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
              <LinkIcon className="w-3.5 h-3.5" />
              Link desta novidade (opcional)
            </label>
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://…"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              className="rounded-xl h-11 text-[15px]"
            />
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Se ficar vazio, o botão na novidade usa o link padrão do patrocinador.
            </p>
          </div>
        </div>

        <div className="shrink-0 border-t border-border/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-background">
          <Button
            type="button"
            className="w-full rounded-xl h-12 text-base font-bold"
            disabled={posting || compressing || !file || weeklyUsed >= limit}
            onClick={() => void handlePublish()}
          >
            {posting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Publicar novidade"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SponsorLaunchNovidadeModal;
