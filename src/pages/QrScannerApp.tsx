/**
 * QrScannerApp — Aberta pelo app quando o usuário clica "Logar via Web" em Perfil
 *
 * Usa @capacitor/camera para tirar foto do QR Code (funciona em iOS/Android nativos).
 * O jsQR decodifica a imagem e autentica a sessão web via Edge Function qr-login/scan.
 */

import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Camera as CameraIcon, CheckCircle2, AlertCircle, Loader2, ArrowLeft, QrCode, RefreshCw } from "lucide-react";

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/qr-login`;

type ScanStage = "idle" | "processing" | "success" | "error";

export default function QrScannerApp() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stage, setStage] = useState<ScanStage>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const decodeQrFromBase64 = async (base64: string): Promise<string | null> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        try {
          const jsQR = (await import("jsqr")).default;
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "attemptBoth",
          });
          resolve(code?.data ?? null);
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = `data:image/jpeg;base64,${base64}`;
    });
  };

  const handleScan = useCallback(async () => {
    if (!user) {
      setStage("error");
      setErrorMsg("Você precisa estar logado no app para usar esta função.");
      return;
    }

    try {
      // 1. Abre a câmera nativa e tira foto
      const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera,
        presentationStyle: "fullScreen",
        promptLabelHeader: "Escaneie o QR Code",
        promptLabelPhoto: "Galeria",
        promptLabelPicture: "Câmera",
      });

      if (!photo.base64String) throw new Error("Foto não capturada");
      setStage("processing");

      // 2. Decodifica o QR Code da foto
      const token = await decodeQrFromBase64(photo.base64String);
      if (!token) {
        setStage("error");
        setErrorMsg("Nenhum QR Code encontrado na foto. Certifique-se de que o código está visível e tente novamente.");
        return;
      }

      // 3. Autentica via Edge Function
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
      if (!res.ok) throw new Error(data.error || "Erro ao autenticar");

      setStage("success");
      setTimeout(() => navigate(-1), 2000);
    } catch (e: any) {
      const msg = e?.message ?? "";
      // Usuário cancelou a câmera — volta ao idle sem erro
      if (
        msg.includes("cancelled") ||
        msg.includes("canceled") ||
        msg.includes("User cancelled") ||
        msg.includes("No image picked")
      ) {
        setStage("idle");
        return;
      }
      setStage("error");
      setErrorMsg(msg || "Erro ao processar o QR Code.");
    }
  }, [user, navigate]);

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground">Logar via Web</h1>
            <p className="text-xs text-muted-foreground">Escaneie o QR Code em appchamo.com</p>
          </div>
        </div>

        {/* Idle */}
        {stage === "idle" && (
          <div className="flex flex-col items-center gap-6 py-4">
            <div className="w-28 h-28 rounded-3xl bg-primary/10 flex items-center justify-center">
              <QrCode className="w-14 h-14 text-primary" />
            </div>

            <div className="text-center max-w-xs">
              <h2 className="font-bold text-foreground text-xl mb-2">Escanear QR Code</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Abra <strong>appchamo.com</strong> no seu computador, clique em{" "}
                <strong>"Acessar via Web"</strong> e fotografe o QR Code que aparecer.
              </p>
            </div>

            {/* Steps */}
            <div className="w-full max-w-xs space-y-3">
              {[
                "Acesse appchamo.com no computador",
                'Clique em "Acessar via Web"',
                "Um QR Code aparecerá na tela",
                'Toque em "Fotografar QR Code" abaixo e aponte para a tela',
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-3 bg-muted/40 rounded-2xl px-4 py-3">
                  <span className="w-6 h-6 rounded-full bg-primary text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-xs text-muted-foreground leading-relaxed">{step}</span>
                </div>
              ))}
            </div>

            <button
              onClick={handleScan}
              className="w-full max-w-xs flex items-center justify-center gap-2 py-4 rounded-2xl bg-primary text-primary-foreground font-bold text-base active:scale-95 transition-transform shadow-lg shadow-primary/30 mt-2"
            >
              <CameraIcon className="w-5 h-5" />
              Fotografar QR Code
            </button>
          </div>
        )}

        {/* Processing */}
        {stage === "processing" && (
          <div className="flex flex-col items-center gap-4 py-16">
            <Loader2 className="w-16 h-16 animate-spin text-primary" />
            <p className="font-semibold text-foreground text-lg">Decodificando QR Code...</p>
            <p className="text-sm text-muted-foreground">Aguarde um momento</p>
          </div>
        )}

        {/* Success */}
        {stage === "success" && (
          <div className="flex flex-col items-center gap-5 py-16">
            <div className="w-28 h-28 rounded-3xl bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="w-14 h-14 text-emerald-500" />
            </div>
            <h2 className="font-bold text-foreground text-xl">Login autorizado!</h2>
            <p className="text-sm text-muted-foreground text-center max-w-xs">
              O navegador foi autenticado com sucesso. Você pode fechar esta tela.
            </p>
          </div>
        )}

        {/* Error */}
        {stage === "error" && (
          <div className="flex flex-col items-center gap-5 py-12">
            <div className="w-28 h-28 rounded-3xl bg-rose-50 flex items-center justify-center">
              <AlertCircle className="w-14 h-14 text-rose-500" />
            </div>
            <h2 className="font-bold text-foreground text-xl">Algo deu errado</h2>
            <p className="text-sm text-muted-foreground text-center max-w-xs leading-relaxed">
              {errorMsg}
            </p>
            <button
              onClick={() => { setStage("idle"); setErrorMsg(""); }}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm active:scale-95 transition-transform"
            >
              <RefreshCw className="w-4 h-4" />
              Tentar novamente
            </button>
          </div>
        )}
      </main>
    </AppLayout>
  );
}
