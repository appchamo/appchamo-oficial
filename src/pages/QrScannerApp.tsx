/**
 * QrScannerApp — Aberta pelo app quando o usuário clica "Logar via Web" em Perfil
 *
 * Usa a câmera do dispositivo via getUserMedia para escanear o QR Code
 * exibido em appchamo.com/qr-auth e autenticar a sessão web.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Camera, CheckCircle2, AlertCircle, Loader2, ArrowLeft, X } from "lucide-react";

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/qr-login`;

type ScanStage = "idle" | "scanning" | "processing" | "success" | "error";

export default function QrScannerApp() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const [stage, setStage] = useState<ScanStage>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [cameraPermission, setCameraPermission] = useState<"unknown" | "granted" | "denied">("unknown");

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      setCameraPermission("granted");
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStage("scanning");
    } catch {
      setCameraPermission("denied");
      setStage("error");
      setErrorMsg("Sem permissão para usar a câmera. Verifique as configurações do seu dispositivo.");
    }
  }, []);

  // Scan loop usando jsQR dinamicamente
  const scan = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(scan);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      // Importa jsQR dinamicamente
      const jsQR = (await import("jsqr")).default;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });

      if (code?.data) {
        await handleTokenFound(code.data);
        return;
      }
    } catch {
      // jsQR não disponível — continua tentando
    }

    rafRef.current = requestAnimationFrame(scan);
  }, []);

  const handleTokenFound = async (token: string) => {
    stopCamera();
    setStage("processing");

    if (!user) {
      setStage("error");
      setErrorMsg("Você precisa estar logado no app para usar esta função.");
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão não encontrada");

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

      if (!res.ok) {
        throw new Error(data.error || "Erro ao autenticar");
      }

      setStage("success");
      setTimeout(() => navigate(-1), 2000);
    } catch (e: any) {
      setStage("error");
      setErrorMsg(e.message || "Erro ao processar o QR Code.");
    }
  };

  useEffect(() => {
    if (stage === "scanning") {
      rafRef.current = requestAnimationFrame(scan);
    }
  }, [stage, scan]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => { stopCamera(); navigate(-1); }} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground">Logar via Web</h1>
            <p className="text-xs text-muted-foreground">Escaneie o QR Code em appchamo.com</p>
          </div>
        </div>

        {/* Stages */}
        {stage === "idle" && (
          <div className="flex flex-col items-center gap-6 py-8">
            <div className="w-24 h-24 rounded-3xl bg-primary/10 flex items-center justify-center">
              <Camera className="w-12 h-12 text-primary" />
            </div>
            <div className="text-center max-w-xs">
              <h2 className="font-bold text-foreground text-lg mb-2">Escanear QR Code</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Abra <strong>appchamo.com</strong> no computador, clique em <strong>"Acessar via Web"</strong> e aponte a câmera para o QR Code que aparecer.
              </p>
            </div>
            <div className="w-full max-w-xs space-y-3 text-sm text-muted-foreground bg-muted/40 rounded-2xl p-4">
              <p className="font-semibold text-foreground text-xs uppercase tracking-wide mb-2">Como funciona</p>
              {[
                "Acesse appchamo.com no navegador do computador",
                'Clique em "Acessar via Web"',
                "Um QR Code aparecerá na tela",
                "Toque em Abrir Câmera e escaneie o código",
              ].map((s, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                  <span className="text-xs">{s}</span>
                </div>
              ))}
            </div>
            <button
              onClick={startCamera}
              className="w-full max-w-xs flex items-center justify-center gap-2 py-4 rounded-2xl bg-primary text-primary-foreground font-bold text-base active:scale-95 transition-transform shadow-lg"
            >
              <Camera className="w-5 h-5" />
              Abrir Câmera
            </button>
          </div>
        )}

        {stage === "scanning" && (
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-full max-w-sm aspect-square rounded-3xl overflow-hidden border-4 border-primary shadow-xl bg-black">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />
              {/* Crosshair overlay */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-48 h-48 relative">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-xl" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-xl" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-xl" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-xl" />
                  {/* Scanner line */}
                  <div className="absolute left-0 right-0 h-0.5 bg-primary/70 animate-bounce" style={{ top: "50%" }} />
                </div>
              </div>
              {/* Close */}
              <button
                onClick={() => { stopCamera(); setStage("idle"); }}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Aponte para o QR Code exibido em <strong>appchamo.com</strong>
            </p>
          </div>
        )}

        {stage === "processing" && (
          <div className="flex flex-col items-center gap-4 py-12">
            <Loader2 className="w-16 h-16 animate-spin text-primary" />
            <p className="font-semibold text-foreground">Autenticando...</p>
            <p className="text-sm text-muted-foreground">Aguarde um momento</p>
          </div>
        )}

        {stage === "success" && (
          <div className="flex flex-col items-center gap-4 py-12">
            <div className="w-24 h-24 rounded-3xl bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-500" />
            </div>
            <h2 className="font-bold text-foreground text-xl">Login autorizado!</h2>
            <p className="text-sm text-muted-foreground text-center max-w-xs">
              O navegador foi autenticado com sucesso. Você pode fechar esta tela.
            </p>
          </div>
        )}

        {stage === "error" && (
          <div className="flex flex-col items-center gap-4 py-12">
            <div className="w-24 h-24 rounded-3xl bg-rose-50 flex items-center justify-center">
              <AlertCircle className="w-12 h-12 text-rose-500" />
            </div>
            <h2 className="font-bold text-foreground text-lg">Ops! Algo deu errado</h2>
            <p className="text-sm text-muted-foreground text-center max-w-xs">{errorMsg}</p>
            <button
              onClick={() => { setStage("idle"); setErrorMsg(""); }}
              className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm active:scale-95 transition-transform"
            >
              Tentar novamente
            </button>
          </div>
        )}
      </main>
    </AppLayout>
  );
}
