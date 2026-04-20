import { useCallback, useEffect, useRef, useState } from "react";
import {
  X,
  Loader2,
  ImagePlus,
  Link as LinkIcon,
  ArrowLeft,
  Type,
  SwitchCamera,
} from "lucide-react";
import Cropper, { type Area } from "react-easy-crop";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import type { LinkedSponsor } from "@/hooks/useLinkedSponsor";
import { getCroppedStoryImageBlob, storyBlobToFile } from "@/lib/sponsorStoryCrop";

const WEEKLY_LIMIT: Record<string, number> = {
  free: 4,
  pack_14: 14,
  pack_28: 28,
};

const STORY_ASPECT = 9 / 16;

type Phase = "camera" | "crop" | "edit";
type Sheet = "caption" | "link" | null;

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
  const [phase, setPhase] = useState<Phase>("camera");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [caption, setCaption] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkButtonLabel, setLinkButtonLabel] = useState("Saiba mais");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [weeklyUsed, setWeeklyUsed] = useState(0);

  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [zoomCaps, setZoomCaps] = useState<{ min: number; max: number; step: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pinchStartDist = useRef<number | null>(null);
  const pinchStartZoom = useRef<number>(1);

  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [cropWorking, setCropWorking] = useState(false);

  const limit = sponsor ? WEEKLY_LIMIT[sponsor.weekly_plan] ?? 4 : 4;

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 3840 },
          height: { ideal: 2160 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => setCameraReady(true);
      }
      const track = stream.getVideoTracks()[0];
      const caps = (track?.getCapabilities?.() as unknown as { zoom?: { min: number; max: number; step: number } }) ?? {};
      if (caps.zoom && typeof caps.zoom.max === "number" && caps.zoom.max > 1) {
        setZoomCaps({ min: caps.zoom.min ?? 1, max: caps.zoom.max, step: caps.zoom.step ?? 0.1 });
      } else {
        setZoomCaps(null);
      }
      setZoomLevel(1);
      setCameraError(null);
    } catch {
      setCameraError("Não foi possível acessar a câmera.\nUse a galeria abaixo.");
    }
  }, [facing, stopCamera]);

  const applyZoom = useCallback(
    (z: number) => {
      const track = streamRef.current?.getVideoTracks()[0];
      if (zoomCaps && track) {
        const clamped = Math.min(Math.max(z, zoomCaps.min), zoomCaps.max);
        setZoomLevel(clamped);
        track
          .applyConstraints({ advanced: [{ zoom: clamped }] as unknown as MediaTrackConstraintSet[] })
          .catch(() => {});
      } else {
        const clamped = Math.min(Math.max(z, 1), 5);
        setZoomLevel(clamped);
      }
    },
    [zoomCaps]
  );

  const onVideoTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDist.current = Math.hypot(dx, dy);
      pinchStartZoom.current = zoomLevel;
    }
  };

  const onVideoTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartDist.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const d = Math.hypot(dx, dy);
      const ratio = d / pinchStartDist.current;
      applyZoom(pinchStartZoom.current * ratio);
    }
  };

  const onVideoTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) pinchStartDist.current = null;
  };

  const openNativeGallery = useCallback(async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        const { Camera: CapCamera, CameraResultType, CameraSource } = await import("@capacitor/camera");
        await CapCamera.requestPermissions({ permissions: ["photos"] }).catch(() => {});
        const photo = await CapCamera.getPhoto({
          quality: 92,
          allowEditing: false,
          resultType: CameraResultType.Uri,
          source: CameraSource.Photos,
        });
        const webPath = photo.webPath;
        if (!webPath) return;
        const res = await fetch(webPath);
        const blob = await res.blob();
        const f = new File([blob], `gallery-${Date.now()}.jpg`, {
          type: blob.type && blob.type.startsWith("image/") ? blob.type : "image/jpeg",
        });
        onPickFile(f);
      } else {
        fileInputRef.current?.click();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg && !/cancel/i.test(msg)) {
        toast({ title: "Não foi possível abrir a galeria", description: msg, variant: "destructive" });
      }
    }
  }, []);

  const reset = useCallback(() => {
    setPhase("camera");
    setSheet(null);
    setCaption("");
    setLinkUrl("");
    setLinkButtonLabel("Saiba mais");
    setFile(null);
    setPreview(null);
    setCropImageSrc((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setFacing("environment");
    setCameraError(null);
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

  useEffect(() => {
    if (!open) {
      stopCamera();
      return;
    }
    if (phase === "camera") {
      void startCamera();
    } else {
      stopCamera();
    }
  }, [open, phase, startCamera, stopCamera]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const onPickFile = (f: File | null) => {
    if (!f || !f.type.startsWith("image/")) {
      if (f) toast({ title: "Escolhe uma imagem", variant: "destructive" });
      return;
    }
    setCropImageSrc((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setPhase("crop");
  };

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !cameraReady) return;
    setCapturing(true);
    const vw = video.videoWidth || 1080;
    const vh = video.videoHeight || 1920;
    const cssZoom = zoomCaps ? 1 : Math.max(1, zoomLevel);
    const sw = vw / cssZoom;
    const sh = vh / cssZoom;
    const sx = (vw - sw) / 2;
    const sy = (vh - sh) / 2;
    canvas.width = Math.round(sw);
    canvas.height = Math.round(sh);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setCapturing(false);
      return;
    }
    if (facing === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.imageSmoothingEnabled = true;
    if (ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = "high";
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setCapturing(false);
          return;
        }
        const url = URL.createObjectURL(blob);
        setCropImageSrc((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        setCrop({ x: 0, y: 0 });
        setZoom(1);
        setCroppedAreaPixels(null);
        setPhase("crop");
        setCapturing(false);
      },
      "image/jpeg",
      0.96
    );
  }, [cameraReady, facing, zoomCaps, zoomLevel]);

  const exitCrop = () => {
    setCropImageSrc((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPhase("camera");
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
  };

  const confirmCrop = async () => {
    if (!cropImageSrc || !croppedAreaPixels) {
      toast({ title: "Ajusta a imagem", description: "Amplia ou move até ficar como queres.", variant: "destructive" });
      return;
    }
    setCropWorking(true);
    try {
      const blob = await getCroppedStoryImageBlob(cropImageSrc, croppedAreaPixels, 0.92);
      const f = storyBlobToFile(blob);
      setFile(f);
      setCropImageSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setPhase("edit");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao processar imagem";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setCropWorking(false);
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

      const labelTrim = linkButtonLabel.trim();
      const storyButtonLabel = !labelTrim || labelTrim === "Saiba mais" ? null : labelTrim;
      const { error: insertErr } = await supabase.from("sponsor_stories").insert({
        sponsor_id: sponsor.id,
        photo_url,
        caption: caption.trim() || null,
        link_url: normalizedLink,
        link_button_label: storyButtonLabel,
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

  const cameraLayer =
    phase === "camera" ? (
      <div className="absolute inset-0 z-[70] flex flex-col bg-black">
        <div
          className="absolute inset-0 overflow-hidden"
          onTouchStart={onVideoTouchStart}
          onTouchMove={onVideoTouchMove}
          onTouchEnd={onVideoTouchEnd}
          onTouchCancel={onVideoTouchEnd}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-75"
            style={{
              transform: `${facing === "user" ? "scaleX(-1) " : ""}${
                zoomCaps ? "" : `scale(${zoomLevel})`
              }`.trim(),
              transformOrigin: "center center",
            }}
          />
        </div>

        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />

        <div className="relative z-10 flex items-center justify-between gap-2 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <button
            type="button"
            className="w-10 h-10 rounded-full flex items-center justify-center text-white bg-black/35 backdrop-blur-sm active:bg-black/55"
            onClick={() => onOpenChange(false)}
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
          <span className="text-white text-[12px] font-medium bg-black/40 backdrop-blur-sm rounded-full px-3 py-1.5">
            {weeklyUsed}/{limit} esta semana
          </span>
          <div className="w-10" />
        </div>

        {cameraError ? (
          <div className="absolute inset-0 flex items-center justify-center px-8 text-center pointer-events-none">
            <p className="text-white/90 text-sm whitespace-pre-line">{cameraError}</p>
          </div>
        ) : !cameraReady ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-white/70 animate-spin" />
          </div>
        ) : null}

        {zoomLevel > 1.02 ? (
          <div className="absolute left-1/2 -translate-x-1/2 top-24 z-10 pointer-events-none">
            <span className="text-white text-[12px] font-semibold bg-black/50 backdrop-blur-sm rounded-full px-3 py-1">
              {zoomLevel.toFixed(1)}x
            </span>
          </div>
        ) : null}

        <div className="mt-auto relative z-10 flex items-end justify-between px-6 pb-[max(1.75rem,calc(env(safe-area-inset-bottom)+1rem))] gap-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onPickFile(e.target.files?.[0] || null)}
          />
          <button
            type="button"
            className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur-md border border-white/30 flex items-center justify-center text-white active:scale-95"
            onClick={() => void openNativeGallery()}
            aria-label="Escolher da galeria"
          >
            <ImagePlus className="w-6 h-6" />
          </button>

          <button
            type="button"
            onClick={capturePhoto}
            disabled={!cameraReady || capturing}
            aria-label="Capturar"
            className="relative flex items-center justify-center active:scale-95 disabled:opacity-50 transition-transform"
            style={{ width: 76, height: 76 }}
          >
            <span className="absolute inset-0 rounded-full border-[4px] border-white" />
            <span className="w-[60px] h-[60px] rounded-full bg-white flex items-center justify-center">
              {capturing ? <Loader2 className="w-6 h-6 text-black animate-spin" /> : null}
            </span>
          </button>

          <button
            type="button"
            className="w-12 h-12 rounded-full flex items-center justify-center text-white bg-white/15 backdrop-blur-md border border-white/30 active:scale-95"
            onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
            aria-label="Inverter câmera"
          >
            <SwitchCamera className="w-5 h-5" />
          </button>
        </div>
      </div>
    ) : null;

  const cropLayer =
    phase === "crop" && cropImageSrc ? (
      <div className="absolute inset-0 z-[80] flex flex-col bg-black">
        <div className="flex items-center gap-2 px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] shrink-0 border-b border-white/10">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white hover:bg-white/10"
            onClick={exitCrop}
            aria-label="Voltar"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="font-semibold text-white text-[15px] flex-1 text-center pr-10">Ajustar imagem</span>
        </div>
        <p className="text-[11px] text-white/70 px-4 py-2 text-center shrink-0">
          Pinça para ampliar · arrasta para enquadrar · formato 9:16 (sem distorcer)
        </p>
        <div className="flex-1 relative min-h-0">
          <Cropper
            image={cropImageSrc}
            crop={crop}
            zoom={zoom}
            aspect={STORY_ASPECT}
            cropShape="rect"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <div className="shrink-0 px-4 pt-2 pb-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-4 bg-black border-t border-white/10">
          <div className="space-y-2">
            <p className="text-[11px] text-white/60 text-center">Zoom</p>
            <Slider value={[zoom]} min={1} max={4} step={0.01} onValueChange={(v) => setZoom(v[0] ?? 1)} className="w-full" />
          </div>
          <Button
            type="button"
            className="w-full rounded-xl h-12 text-base font-bold bg-white text-gray-900 hover:bg-white/90"
            disabled={cropWorking}
            onClick={() => void confirmCrop()}
          >
            {cropWorking ? <Loader2 className="w-5 h-5 animate-spin" /> : "Continuar"}
          </Button>
        </div>
      </div>
    ) : null;

  const editLayer =
    phase === "edit" && preview ? (
      <div className="absolute inset-0 z-[75] flex flex-col bg-black">
        <div className="absolute inset-0 flex items-center justify-center">
          <img src={preview} alt="" className="max-w-full max-h-full object-contain" />
        </div>

        {caption ? (
          <div className="absolute left-4 right-20 bottom-24 z-10 pointer-events-none">
            <div className="inline-block rounded-xl bg-black/55 backdrop-blur-sm px-3 py-2 text-white text-[14px] leading-snug whitespace-pre-wrap break-words">
              {caption}
            </div>
          </div>
        ) : null}

        <div className="relative z-20 flex items-center justify-between gap-2 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <button
            type="button"
            className="w-10 h-10 rounded-full flex items-center justify-center text-white bg-black/40 backdrop-blur-sm active:bg-black/60"
            onClick={() => {
              setFile(null);
              setPreview(null);
              setCaption("");
              setLinkUrl("");
              setLinkButtonLabel("Saiba mais");
              setPhase("camera");
            }}
            aria-label="Voltar"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-white text-[13px] font-semibold bg-black/40 backdrop-blur-sm rounded-full px-3 py-1.5">
            Sua novidade
          </span>
          <div className="w-10" />
        </div>

        <div className="absolute right-3 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-3">
          <button
            type="button"
            className={`relative w-11 h-11 rounded-full backdrop-blur-md text-white flex items-center justify-center active:scale-95 ring-1 ${
              caption ? "bg-primary/90 ring-white/40" : "bg-black/40 ring-white/20"
            }`}
            onClick={() => setSheet("caption")}
            aria-label="Texto"
          >
            <Type className="w-5 h-5" />
          </button>
          <button
            type="button"
            className={`relative w-11 h-11 rounded-full backdrop-blur-md text-white flex items-center justify-center active:scale-95 ring-1 ${
              linkUrl ? "bg-primary/90 ring-white/40" : "bg-black/40 ring-white/20"
            }`}
            onClick={() => setSheet("link")}
            aria-label="Link"
          >
            <LinkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-auto relative z-20 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
          {linkUrl ? (
            <div className="mb-2 flex items-center justify-start">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-gray-900 text-[12px] font-semibold shadow-md">
                <LinkIcon className="w-3.5 h-3.5" />
                {linkButtonLabel.trim() || "Saiba mais"}
              </span>
            </div>
          ) : null}
          <Button
            type="button"
            className="w-full rounded-xl h-12 text-base font-bold"
            disabled={posting || weeklyUsed >= limit}
            onClick={() => void handlePublish()}
          >
            {posting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Publicar novidade"}
          </Button>
        </div>
      </div>
    ) : null;

  const sheetLayer = sheet ? (
    <div
      className="absolute inset-0 z-[90] flex flex-col justify-end bg-black/60"
      onClick={() => setSheet(null)}
    >
      <div
        className="bg-background rounded-t-3xl px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4 animate-in slide-in-from-bottom duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto w-10 h-1 rounded-full bg-muted-foreground/30" />
        {sheet === "caption" ? (
          <>
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Type className="w-3.5 h-3.5" />
              Texto da novidade (opcional)
            </label>
            <Textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Mensagem curta para acompanhar a imagem…"
              className="min-h-[110px] rounded-xl resize-none text-[15px]"
              autoFocus
            />
          </>
        ) : (
          <>
            <div>
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
                <LinkIcon className="w-3.5 h-3.5" />
                Texto do botão
              </label>
              <Input
                value={linkButtonLabel}
                onChange={(e) => setLinkButtonLabel(e.target.value)}
                placeholder="Saiba mais"
                className="rounded-xl h-11 text-[15px]"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
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
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Se ficar vazio, o botão na novidade usa o link padrão do patrocinador.
              </p>
            </div>
          </>
        )}
        <div className="flex gap-2 pt-1">
          {sheet === "caption" && caption ? (
            <Button
              type="button"
              variant="outline"
              className="rounded-xl h-11"
              onClick={() => {
                setCaption("");
                setSheet(null);
              }}
            >
              Remover
            </Button>
          ) : null}
          {sheet === "link" && (linkUrl || linkButtonLabel !== "Saiba mais") ? (
            <Button
              type="button"
              variant="outline"
              className="rounded-xl h-11"
              onClick={() => {
                setLinkUrl("");
                setLinkButtonLabel("Saiba mais");
                setSheet(null);
              }}
            >
              Remover
            </Button>
          ) : null}
          <Button type="button" className="flex-1 rounded-xl h-11 font-bold" onClick={() => setSheet(null)}>
            OK
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent
        className="!fixed !inset-0 !left-0 !top-0 z-[70] flex h-[100dvh] max-h-none w-full max-w-none !translate-x-0 !translate-y-0 flex-col gap-0 rounded-none border-0 bg-black p-0 overflow-hidden shadow-none data-[state=open]:slide-in-from-bottom-0 data-[state=closed]:slide-out-to-bottom-0 [&>button]:hidden"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">Lançar novidade</DialogTitle>
        <canvas ref={canvasRef} className="hidden" />
        {cameraLayer}
        {cropLayer}
        {editLayer}
        {sheetLayer}
      </DialogContent>
    </Dialog>
  );
};

export default SponsorLaunchNovidadeModal;
