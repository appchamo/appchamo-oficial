import { useRef, useEffect, useState, useCallback } from "react";
import { Camera, X, Loader2 } from "lucide-react";

interface DocumentCameraProps {
  label: string;
  onCapture: (file: File, preview: string) => void;
  onClose: () => void;
}

const DocumentCamera = ({ label, onCapture, onClose }: DocumentCameraProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);

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
            facingMode: { ideal: "environment" },
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
      0.88
    );
  }, [ready, stopCamera, onCapture]);

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
          className="absolute inset-0 w-full h-full object-cover"
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
            ) : (
              <Camera className="w-7 h-7 text-black" />
            )}
          </span>
        </button>
        <p className="text-white/70 text-xs">Tirar foto</p>
      </div>
    </div>
  );
};

export default DocumentCamera;
