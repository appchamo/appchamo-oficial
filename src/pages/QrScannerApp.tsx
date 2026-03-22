/**
 * QrScannerApp — Aberta pelo app quando o usuário clica "Logar via Web" em Perfil
 */

import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import {
  Camera as CameraIcon,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowLeft,
  QrCode,
  RefreshCw,
  ImageIcon,
} from "lucide-react";

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/qr-login`;

type ScanStage = "idle" | "preview" | "decoding" | "processing" | "success" | "error";

/** Decodifica QR de um dataUrl, tentando em escalas diferentes */
async function decodeQrFromDataUrl(dataUrl: string): Promise<string | null> {
  const jsQR = (await import("jsqr")).default;

  const loadImage = (src: string): Promise<HTMLImageElement> =>
    new Promise((res, rej) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = src;
    });

  const scanCanvas = (img: HTMLImageElement, scale: number): string | null => {
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    try {
      const id = ctx.getImageData(0, 0, w, h);
      const result = jsQR(id.data, id.width, id.height, {
        inversionAttempts: "attemptBoth",
      });
      return result?.data ?? null;
    } catch {
      return null;
    }
  };

  try {
    const img = await loadImage(dataUrl);
    // Tenta em múltiplas escalas: 100%, 75%, 50%, 25% (menor = mais rápido)
    for (const scale of [1, 0.75, 0.5, 0.25]) {
      const result = scanCanvas(img, scale);
      if (result) return result;
    }
    return null;
  } catch {
    return null;
  }
}

export default function QrScannerApp() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stage, setStage] = useState<ScanStage>("idle");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const openCamera = useCallback(async () => {
    try {
      const photo = await Camera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        presentationStyle: "fullScreen",
      });

      if (!photo.dataUrl) throw new Error("Foto não capturada");
      setPhotoDataUrl(photo.dataUrl);
      setStage("preview");
    } catch (e: any) {
      const msg = e?.message ?? "";
      if (
        msg.toLowerCase().includes("cancel") ||
        msg.includes("No image picked") ||
        msg.includes("User denied")
      ) {
        return; // Usuário cancelou — não mostra erro
      }
      setErrorMsg("Não foi possível abrir a câmera. Verifique as permissões.");
      setStage("error");
    }
  }, []);

  const processPhoto = useCallback(async () => {
    if (!photoDataUrl) return;
    if (!user) {
      setStage("error");
      setErrorMsg("Você precisa estar logado para usar esta função.");
      return;
    }

    setStage("decoding");

    const token = await decodeQrFromDataUrl(photoDataUrl);

    if (!token) {
      setStage("error");
      setErrorMsg(
        "QR Code não encontrado na foto. Tente se aproximar mais da tela e fotografar com boa iluminação, evitando reflexos."
      );
      return;
    }

    setStage("processing");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
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
      if (!res.ok) throw new Error(data.error || "Erro ao autenticar");

      setStage("success");
      setTimeout(() => navigate(-1), 2500);
    } catch (e: any) {
      setStage("error");
      setErrorMsg(e.message || "Erro ao conectar com o servidor.");
    }
  }, [photoDataUrl, user, navigate]);

  const reset = () => {
    setStage("idle");
    setPhotoDataUrl(null);
    setErrorMsg("");
  };

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5 pb-10">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => { reset(); navigate(-1); }}
            className="p-2 rounded-xl hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground">Logar via Web</h1>
            <p className="text-xs text-muted-foreground">
              Escaneie o QR Code em appchamo.com
            </p>
          </div>
        </div>

        {/* ── IDLE ── */}
        {stage === "idle" && (
          <div className="flex flex-col items-center gap-6 py-4">
            <div className="w-28 h-28 rounded-3xl bg-primary/10 flex items-center justify-center">
              <QrCode className="w-14 h-14 text-primary" />
            </div>

            <div className="text-center max-w-xs">
              <h2 className="font-bold text-foreground text-xl mb-2">
                Escanear QR Code
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Abra <strong>appchamo.com</strong> no computador, clique em{" "}
                <strong>"Acessar via Web"</strong> e fotografe o QR Code.
              </p>
            </div>

            <div className="w-full max-w-xs space-y-2.5">
              {[
                "Acesse appchamo.com no computador",
                'Clique em "Acessar via Web"',
                "Quando aparecer o QR Code, volte aqui",
                'Toque em "Abrir Câmera" e fotografe o código',
              ].map((step, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 bg-muted/40 rounded-2xl px-4 py-3"
                >
                  <span className="w-6 h-6 rounded-full bg-primary text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-xs text-muted-foreground leading-relaxed">
                    {step}
                  </span>
                </div>
              ))}
            </div>

            <button
              onClick={openCamera}
              className="w-full max-w-xs flex items-center justify-center gap-2 py-4 rounded-2xl bg-primary text-primary-foreground font-bold text-base active:scale-95 transition-transform shadow-lg shadow-primary/30 mt-2"
            >
              <CameraIcon className="w-5 h-5" />
              Abrir Câmera
            </button>
          </div>
        )}

        {/* ── PREVIEW — mostra a foto e pede confirmação ── */}
        {stage === "preview" && photoDataUrl && (
          <div className="flex flex-col items-center gap-5">
            <div className="text-center">
              <h2 className="font-bold text-foreground text-lg mb-1">
                O QR Code está visível?
              </h2>
              <p className="text-sm text-muted-foreground">
                Confirme se o código está nítido e sem reflexo
              </p>
            </div>

            <div className="w-full max-w-sm rounded-2xl overflow-hidden border-2 border-border shadow-lg">
              <img
                src={photoDataUrl}
                alt="Foto capturada"
                className="w-full h-auto"
              />
            </div>

            <div className="flex gap-3 w-full max-w-sm">
              <button
                onClick={openCamera}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-border font-semibold text-sm text-foreground hover:bg-muted transition-colors active:scale-95"
              >
                <CameraIcon className="w-4 h-4" />
                Nova foto
              </button>
              <button
                onClick={processPhoto}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm active:scale-95 transition-transform shadow-md"
              >
                <ImageIcon className="w-4 h-4" />
                Usar esta foto
              </button>
            </div>
          </div>
        )}

        {/* ── DECODING ── */}
        {stage === "decoding" && (
          <div className="flex flex-col items-center gap-4 py-16">
            <Loader2 className="w-16 h-16 animate-spin text-primary" />
            <p className="font-semibold text-foreground text-lg">
              Lendo QR Code...
            </p>
            <p className="text-sm text-muted-foreground">Aguarde um momento</p>
          </div>
        )}

        {/* ── PROCESSING ── */}
        {stage === "processing" && (
          <div className="flex flex-col items-center gap-4 py-16">
            <Loader2 className="w-16 h-16 animate-spin text-primary" />
            <p className="font-semibold text-foreground text-lg">
              Autenticando...
            </p>
            <p className="text-sm text-muted-foreground">
              Conectando com o servidor
            </p>
          </div>
        )}

        {/* ── SUCCESS ── */}
        {stage === "success" && (
          <div className="flex flex-col items-center gap-5 py-16">
            <div className="w-28 h-28 rounded-3xl bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="w-14 h-14 text-emerald-500" />
            </div>
            <h2 className="font-bold text-foreground text-xl">
              Login autorizado!
            </h2>
            <p className="text-sm text-muted-foreground text-center max-w-xs">
              O navegador foi autenticado com sucesso. Você pode fechar esta
              tela.
            </p>
          </div>
        )}

        {/* ── ERROR ── */}
        {stage === "error" && (
          <div className="flex flex-col items-center gap-5 py-12">
            <div className="w-28 h-28 rounded-3xl bg-rose-50 flex items-center justify-center">
              <AlertCircle className="w-14 h-14 text-rose-500" />
            </div>
            <h2 className="font-bold text-foreground text-xl">
              Algo deu errado
            </h2>
            <p className="text-sm text-muted-foreground text-center max-w-xs leading-relaxed">
              {errorMsg}
            </p>
            <div className="flex gap-3">
              <button
                onClick={openCamera}
                className="flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm active:scale-95 transition-transform"
              >
                <CameraIcon className="w-4 h-4" />
                Nova foto
              </button>
              <button
                onClick={reset}
                className="flex items-center gap-2 px-5 py-3 rounded-xl border font-semibold text-sm text-foreground active:scale-95 transition-transform"
              >
                <RefreshCw className="w-4 h-4" />
                Recomeçar
              </button>
            </div>
          </div>
        )}
      </main>
    </AppLayout>
  );
}
