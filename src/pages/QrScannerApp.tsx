/**
 * QrScannerApp — Scanner de QR Code para "Logar via Web"
 * Usa getUserMedia + ZXingBrowser para leitura ao vivo.
 * Requer allowsInlineMediaPlayback: true no capacitor.config.ts (já configurado).
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowLeft,
  QrCode,
  X,
} from "lucide-react";

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/qr-login`;

type Stage = "idle" | "scanning" | "processing" | "success" | "error";

export default function QrScannerApp() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stage, setStage] = useState<Stage>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const handledRef = useRef(false);
  const scannerRef = useRef<any>(null);

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (scannerRef.current) {
      try { scannerRef.current.reset(); } catch { /* ignore */ }
      scannerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const handleTokenFound = useCallback(async (token: string) => {
    if (handledRef.current) return;
    handledRef.current = true;
    stopCamera();
    setStage("processing");

    try {
      if (!user) throw new Error("Você precisa estar logado no app.");
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão não encontrada.");

      const res = await fetch(`${EDGE_URL}/scan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          token,
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao autenticar.");

      setStage("success");
      setTimeout(() => navigate(-1), 2500);
    } catch (e: any) {
      setStage("error");
      setErrorMsg(e.message || "Erro ao processar o QR Code.");
    }
  }, [user, navigate, stopCamera]);

  const startCamera = useCallback(async () => {
    handledRef.current = false;
    setStage("scanning");

    try {
      // Pede câmera traseira
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) return;

      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      video.setAttribute("webkit-playsinline", "true");
      video.muted = true;
      video.autoplay = true;

      await video.play().catch(() => {});

      // Aguarda vídeo pronto
      await new Promise<void>((resolve) => {
        const check = () => {
          if (video.readyState >= 2) resolve();
          else setTimeout(check, 100);
        };
        check();
      });

      // Usa ZXing para scan contínuo
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader();
      scannerRef.current = reader;

      reader.decodeFromVideoElement(video, (result, err) => {
        if (result) {
          handleTokenFound(result.getText());
        }
        // ignora erros de "not found" que são normais entre frames
        if (err && err.name !== "NotFoundException") {
          console.warn("QR decode error:", err);
        }
      });
    } catch (e: any) {
      stopCamera();
      setStage("error");
      const msg = e?.message ?? "";
      if (msg.includes("Permission") || msg.includes("NotAllowed") || msg.includes("denied")) {
        setErrorMsg("Permissão de câmera negada. Vá em Ajustes > Chamô e habilite a câmera.");
      } else {
        setErrorMsg("Não foi possível abrir a câmera. Tente novamente.");
      }
    }
  }, [handleTokenFound, stopCamera]);

  const handleClose = () => {
    stopCamera();
    setStage("idle");
    handledRef.current = false;
  };

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5 pb-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => { handleClose(); navigate(-1); }}
            className="p-2 rounded-xl hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground">Logar via Web</h1>
            <p className="text-xs text-muted-foreground">Escaneie o QR Code em appchamo.com</p>
          </div>
        </div>

        {/* ── IDLE ── */}
        {stage === "idle" && (
          <div className="flex flex-col items-center gap-6 py-4">
            <div className="w-28 h-28 rounded-3xl bg-primary/10 flex items-center justify-center">
              <QrCode className="w-14 h-14 text-primary" />
            </div>
            <div className="text-center max-w-xs">
              <h2 className="font-bold text-foreground text-xl mb-2">Escanear QR Code</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Abra <strong>appchamo.com</strong> no computador, clique em{" "}
                <strong>"Acessar via Web"</strong> e aponte a câmera para o QR Code.
              </p>
            </div>
            {[
              "Acesse appchamo.com no computador",
              'Clique em "Acessar via Web"',
              'Toque em "Abrir Câmera" e aponte para o QR Code na tela',
            ].map((step, i) => (
              <div key={i} className="w-full max-w-xs flex items-start gap-3 bg-muted/40 rounded-2xl px-4 py-3">
                <span className="w-6 h-6 rounded-full bg-primary text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <span className="text-xs text-muted-foreground leading-relaxed">{step}</span>
              </div>
            ))}
            <button
              onClick={startCamera}
              className="w-full max-w-xs flex items-center justify-center gap-2 py-4 rounded-2xl bg-primary text-primary-foreground font-bold text-base active:scale-95 transition-transform shadow-lg shadow-primary/30"
            >
              <QrCode className="w-5 h-5" />
              Abrir Câmera
            </button>
          </div>
        )}

        {/* ── SCANNING ── */}
        {stage === "scanning" && (
          <div className="flex flex-col items-center gap-4">
            {/* Viewfinder */}
            <div className="relative w-full max-w-sm rounded-3xl overflow-hidden bg-black shadow-2xl border-2 border-primary"
              style={{ aspectRatio: "1/1" }}>
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
                style={{ WebkitTransform: "scaleX(1)" } as React.CSSProperties}
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* Overlay escuro nas bordas */}
              <div className="absolute inset-0 pointer-events-none"
                style={{
                  background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6) 100%)",
                }}
              />

              {/* Frame do QR */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative w-52 h-52">
                  <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-primary rounded-tl-2xl" />
                  <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-primary rounded-tr-2xl" />
                  <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-primary rounded-bl-2xl" />
                  <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-primary rounded-br-2xl" />
                  {/* Linha animada */}
                  <div
                    className="absolute left-2 right-2 h-0.5 bg-primary/80 rounded-full"
                    style={{ animation: "scan-line 2s ease-in-out infinite", top: "50%" }}
                  />
                </div>
              </div>

              {/* Botão fechar */}
              <button
                onClick={handleClose}
                className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center z-10"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground text-center max-w-xs">
              Aponte para o QR Code exibido em{" "}
              <strong className="text-foreground">appchamo.com</strong>
              <br />
              <span className="text-xs text-primary">Leitura automática ao detectar o código</span>
            </p>
          </div>
        )}

        {/* ── PROCESSING ── */}
        {stage === "processing" && (
          <div className="flex flex-col items-center gap-4 py-16">
            <Loader2 className="w-16 h-16 animate-spin text-primary" />
            <p className="font-semibold text-foreground text-lg">Autenticando...</p>
            <p className="text-sm text-muted-foreground">Conectando com o servidor</p>
          </div>
        )}

        {/* ── SUCCESS ── */}
        {stage === "success" && (
          <div className="flex flex-col items-center gap-5 py-16">
            <div className="w-28 h-28 rounded-3xl bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="w-14 h-14 text-emerald-500" />
            </div>
            <h2 className="font-bold text-foreground text-xl">Login autorizado!</h2>
            <p className="text-sm text-muted-foreground text-center max-w-xs">
              O navegador foi autenticado com sucesso.
            </p>
          </div>
        )}

        {/* ── ERROR ── */}
        {stage === "error" && (
          <div className="flex flex-col items-center gap-5 py-12">
            <div className="w-28 h-28 rounded-3xl bg-rose-50 flex items-center justify-center">
              <AlertCircle className="w-14 h-14 text-rose-500" />
            </div>
            <h2 className="font-bold text-foreground text-xl">Algo deu errado</h2>
            <p className="text-sm text-muted-foreground text-center max-w-xs leading-relaxed">{errorMsg}</p>
            <button
              onClick={startCamera}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm active:scale-95 transition-transform"
            >
              <QrCode className="w-4 h-4" />
              Tentar novamente
            </button>
          </div>
        )}
      </main>

      {/* Animação da linha de scan */}
      <style>{`
        @keyframes scan-line {
          0%, 100% { transform: translateY(-80px); opacity: 0.5; }
          50% { transform: translateY(80px); opacity: 1; }
        }
      `}</style>
    </AppLayout>
  );
}
