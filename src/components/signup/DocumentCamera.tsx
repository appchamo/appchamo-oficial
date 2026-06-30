import { useRef, useEffect, useState, useCallback } from "react";
import { Camera, X, Loader2, ScanFace } from "lucide-react";

// Carrega o face-api.js (detecção de rosto no aparelho) sob demanda, via CDN.
let faceApiPromise: Promise<any | null> | null = null;
function loadFaceApi(): Promise<any | null> {
  if (faceApiPromise) return faceApiPromise;
  faceApiPromise = (async () => {
    try {
      const w = window as any;
      if (!w.faceapi) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.min.js";
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("face-api load failed"));
          document.head.appendChild(s);
        });
      }
      const faceapi = (window as any).faceapi;
      await faceapi.nets.tinyFaceDetector.loadFromUri("https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model");
      return faceapi;
    } catch {
      return null;
    }
  })();
  return faceApiPromise;
}

interface DocumentCameraProps {
  label: string;
  onCapture: (file: File, preview: string) => void;
  onClose: () => void;
  /** "user" para selfie (câmera frontal); padrão "environment" (traseira, documentos). */
  facing?: "environment" | "user";
}

const DocumentCamera = ({ label, onCapture, onClose, facing = "environment" }: DocumentCameraProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const isSelfie = facing === "user";
  const [faceFitted, setFaceFitted] = useState(false);
  const [aiOn, setAiOn] = useState(false);
  const fittedSinceRef = useRef<number | null>(null);
  const autoShotRef = useRef(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            if (!cancelled) setReady(true);
          };
        }
      } catch {
        if (!cancelled) setError("Não foi possível acessar a câmera.\nVerifique as permissões do app.");
      }
    };
    startCamera();
    return () => { cancelled = true; stopCamera(); };
  }, [stopCamera]);

  const handleClose = useCallback(() => {
    stopCamera();
    onClose();
  }, [stopCamera, onClose]);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !ready) return;
    setCapturing(true);

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) { setCapturing(false); return; }
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) { setCapturing(false); return; }
        const file = new File([blob], `doc_${Date.now()}.jpg`, { type: "image/jpeg" });
        const preview = URL.createObjectURL(blob);
        stopCamera();
        onCapture(file, preview);
      },
      "image/jpeg",
      0.82
    );
  }, [ready, stopCamera, onCapture]);

  // Detecção de rosto (selfie): círculo fica verde e tira a foto sozinho ao encaixar.
  useEffect(() => {
    if (!isSelfie || !ready) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    (async () => {
      const faceapi = await loadFaceApi();
      if (cancelled) return;
      if (!faceapi) { setAiOn(false); return; }
      setAiOn(true);
      const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
      timer = setInterval(async () => {
        const video = videoRef.current;
        if (!video || cancelled || autoShotRef.current) return;
        let res: any = null;
        try { res = await faceapi.detectSingleFace(video, opts); } catch { return; }
        if (cancelled) return;
        const vw = video.videoWidth || 1, vh = video.videoHeight || 1;
        let fitted = false;
        if (res?.box) {
          const b = res.box;
          const cx = (b.x + b.width / 2) / vw;
          const cy = (b.y + b.height / 2) / vh;
          const wRatio = b.width / vw;
          fitted = wRatio > 0.22 && wRatio < 0.72 && Math.abs(cx - 0.5) < 0.2 && Math.abs(cy - 0.5) < 0.22;
        }
        setFaceFitted(fitted);
        if (fitted) {
          if (fittedSinceRef.current == null) fittedSinceRef.current = Date.now();
          else if (Date.now() - fittedSinceRef.current > 700 && !autoShotRef.current) {
            autoShotRef.current = true;
            capturePhoto();
          }
        } else {
          fittedSinceRef.current = null;
        }
      }, 250);
    })();
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [isSelfie, ready, capturePhoto]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" style={{ touchAction: "none" }}>
      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-4 pt-safe-top py-3 bg-black/70">
        <button
          onClick={handleClose}
          className="p-2 rounded-full text-white active:bg-white/10 transition-colors"
          aria-label="Fechar câmera"
        >
          <X className="w-6 h-6" />
        </button>
        <p className="text-white text-sm font-semibold truncate max-w-[200px]">{label}</p>
        <div className="w-10" />
      </div>

      {/* Camera + overlay */}
      <div className="relative flex-1 overflow-hidden">
        {/* Video stream */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`absolute inset-0 w-full h-full object-cover ${isSelfie ? "scale-x-[-1]" : ""}`}
        />

        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center gap-4">
            <p className="text-white text-sm whitespace-pre-line">{error}</p>
            <button
              onClick={handleClose}
              className="px-5 py-2.5 rounded-xl bg-white text-black text-sm font-semibold"
            >
              Fechar
            </button>
          </div>
        ) : isSelfie ? (
          /* Selfie: círculo de IA (laranja → verde ao encaixar o rosto) */
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none bg-black/30">
            <div className="relative" style={{ width: "72vw", maxWidth: 300, aspectRatio: "1 / 1" }}>
              <div className={`absolute inset-0 rounded-full border-[5px] transition-colors duration-200 ${faceFitted ? "border-emerald-400 shadow-[0_0_30px_rgba(52,211,153,0.5)]" : "border-primary"}`} />
            </div>
            <div className="mt-6 flex flex-col items-center gap-1 px-6">
              <p className={`text-sm font-bold text-center ${faceFitted ? "text-emerald-300" : "text-white/90"}`}>
                {faceFitted ? "Rosto encaixado! Segure firme…" : "Encaixe seu rosto no círculo"}
              </p>
              <p className="text-white/55 text-[11px] text-center">
                {aiOn ? "A foto é tirada automaticamente quando o círculo fica verde" : "Toque no botão abaixo para tirar a foto"}
              </p>
            </div>
          </div>
        ) : (
          /* Document frame overlay */
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            {/* Top dark strip */}
            <div className="w-full bg-black/55" style={{ flex: "1 1 0" }} />

            {/* Middle row */}
            <div className="w-full flex items-stretch" style={{ height: "52vw", maxHeight: 240 }}>
              {/* Left dark strip */}
              <div className="bg-black/55" style={{ flex: "0 0 7.5%" }} />

              {/* The document frame — transparent window */}
              <div className="relative flex-1">
                {/* Subtle white border on the frame */}
                <div className="absolute inset-0 rounded-xl border border-white/30" />
                {/* Animated corner markers */}
                <span className="absolute top-0 left-0 w-6 h-6 border-t-[3px] border-l-[3px] border-primary rounded-tl-lg" />
                <span className="absolute top-0 right-0 w-6 h-6 border-t-[3px] border-r-[3px] border-primary rounded-tr-lg" />
                <span className="absolute bottom-0 left-0 w-6 h-6 border-b-[3px] border-l-[3px] border-primary rounded-bl-lg" />
                <span className="absolute bottom-0 right-0 w-6 h-6 border-b-[3px] border-r-[3px] border-primary rounded-br-lg" />
              </div>

              {/* Right dark strip */}
              <div className="bg-black/55" style={{ flex: "0 0 7.5%" }} />
            </div>

            {/* Bottom dark strip with hint */}
            <div
              className="w-full bg-black/55 flex flex-col items-center justify-start pt-3 gap-1"
              style={{ flex: "1 1 0" }}
            >
              <p className="text-white/90 text-xs font-medium text-center px-4">
                Posicione o documento dentro da área
              </p>
              <p className="text-white/50 text-[11px] text-center px-4">
                Mantenha o documento na horizontal e bem iluminado
              </p>
            </div>
          </div>
        )}

        {/* Loading indicator */}
        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          </div>
        )}
      </div>

      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Shutter button bar */}
      <div className="bg-black/70 flex flex-col items-center justify-center py-8 gap-3">
        <button
          onClick={capturePhoto}
          disabled={!ready || !!error || capturing}
          aria-label="Tirar foto"
          className="relative flex items-center justify-center disabled:opacity-40 transition-transform active:scale-95"
          style={{ width: 76, height: 76 }}
        >
          {/* Outer ring */}
          <span className="absolute inset-0 rounded-full border-4 border-white" />
          {/* Inner fill */}
          <span className="w-[58px] h-[58px] rounded-full bg-white flex items-center justify-center">
            {capturing ? (
              <Loader2 className="w-7 h-7 text-black animate-spin" />
            ) : isSelfie ? (
              <ScanFace className="w-7 h-7 text-black" />
            ) : (
              <Camera className="w-7 h-7 text-black" />
            )}
          </span>
        </button>
        <p className="text-white/70 text-xs">{isSelfie ? (aiOn ? "Encaixe o rosto (foto automática)" : "Tirar selfie") : "Tirar foto"}</p>
      </div>
    </div>
  );
};

export default DocumentCamera;
