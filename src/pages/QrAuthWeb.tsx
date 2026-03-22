/**
 * QrAuthWeb — Exibida em appchamo.com quando o usuário clica "Acessar via Web"
 *
 * Fluxo:
 * 1. Gera um token via Edge Function → exibe como QR Code
 * 2. Faz polling a cada 2s para detectar quando o app escaneou
 * 3. Após 5 min (expiração) → mostra botão "Gerar Novo QR Code"
 * 4. Quando o app escaneia → recebe access/refresh tokens → loga o usuário
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { QrCode, RefreshCw, Smartphone, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/qr-login`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const QR_TTL_MS = 5 * 60 * 1000; // 5 minutos
const EXPIRE_SHOW_MS = 6 * 60 * 1000; // após 6 min mostra o botão de renovar

type Stage = "loading" | "waiting" | "scanned" | "expired" | "error";

export default function QrAuthWeb() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("loading");
  const [token, setToken] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(300);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);

  const clearTimers = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  };

  const generate = useCallback(async () => {
    clearTimers();
    setStage("loading");
    setToken(null);
    setSecondsLeft(300);

    try {
      const res = await fetch(`${EDGE_URL}/generate`, {
        method: "POST",
        headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Erro ao gerar QR");
      const { token: t } = await res.json();
      setToken(t);
      setStage("waiting");
      startedAtRef.current = Date.now();

      // Countdown
      countdownRef.current = setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current;
        const left = Math.max(0, Math.floor((QR_TTL_MS - elapsed) / 1000));
        setSecondsLeft(left);
        if (elapsed >= EXPIRE_SHOW_MS) {
          setStage("expired");
          clearTimers();
        }
      }, 1000);

      // Polling
      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`${EDGE_URL}/status/${t}`, {
            headers: { apikey: ANON_KEY },
          });
          if (!statusRes.ok) return;
          const data = await statusRes.json();

          if (data.status === "completed" && data.access_token) {
            clearTimers();
            setStage("scanned");
            // Loga o usuário no browser com os tokens do app
            const { error } = await supabase.auth.setSession({
              access_token: data.access_token,
              refresh_token: data.refresh_token,
            });
            if (!error) {
              setTimeout(() => navigate("/home"), 1500);
            } else {
              setStage("error");
            }
          } else if (data.status === "expired") {
            clearTimers();
            setStage("expired");
          }
        } catch { /* ignore polling errors */ }
      }, 2000);
    } catch {
      setStage("error");
    }
  }, [navigate]);

  useEffect(() => {
    generate();
    return clearTimers;
  }, [generate]);

  const qrImageUrl = token
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(token)}&bgcolor=ffffff&color=1a1a1a&qzone=2&format=png`
    : null;

  const minutes = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-8">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-3">
          <QrCode className="w-6 h-6 text-white" />
        </div>
        <h1 className="text-2xl font-black text-foreground">Acessar via Web</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">
          Abra o app Chamô no seu celular, vá em <strong>Perfil → Logar via Web</strong> e escaneie o QR Code
        </p>
      </div>

      {/* QR Card */}
      <div className="w-full max-w-sm">
        <div className="bg-card border rounded-3xl shadow-xl overflow-hidden">

          {/* QR Code area */}
          <div className="p-8 flex flex-col items-center gap-4">
            {stage === "loading" && (
              <div className="w-[220px] h-[220px] rounded-2xl bg-muted flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            )}

            {stage === "waiting" && qrImageUrl && (
              <>
                <div className="relative">
                  <img
                    src={qrImageUrl}
                    alt="QR Code de login"
                    width={220}
                    height={220}
                    className="rounded-2xl border-4 border-white shadow-md"
                  />
                  {/* Overlay pulsante nos cantos */}
                  <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-primary rounded-tl-xl" />
                  <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-primary rounded-tr-xl" />
                  <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-primary rounded-bl-xl" />
                  <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-primary rounded-br-xl" />
                </div>
                {/* Timer */}
                <div className="flex items-center gap-1.5 text-sm">
                  <div className={`w-2 h-2 rounded-full ${secondsLeft > 60 ? "bg-emerald-500" : "bg-amber-400 animate-pulse"}`} />
                  <span className={`font-mono font-semibold ${secondsLeft > 60 ? "text-foreground" : "text-amber-600"}`}>
                    {minutes}:{secs.toString().padStart(2, "0")}
                  </span>
                  <span className="text-muted-foreground text-xs">para expirar</span>
                </div>
              </>
            )}

            {stage === "scanned" && (
              <div className="w-[220px] h-[220px] rounded-2xl bg-emerald-50 flex flex-col items-center justify-center gap-3">
                <CheckCircle2 className="w-16 h-16 text-emerald-500" />
                <p className="font-bold text-emerald-700 text-center">QR Code escaneado!</p>
                <p className="text-xs text-emerald-600 text-center">Redirecionando...</p>
              </div>
            )}

            {(stage === "expired" || stage === "error") && (
              <div className="w-[220px] h-[220px] rounded-2xl bg-muted flex flex-col items-center justify-center gap-3">
                <AlertCircle className="w-12 h-12 text-muted-foreground" />
                <p className="font-semibold text-foreground text-center text-sm">
                  {stage === "expired" ? "QR Code expirado" : "Erro ao gerar QR"}
                </p>
              </div>
            )}
          </div>

          {/* Footer do card */}
          <div className="px-6 pb-6 space-y-3">
            {(stage === "expired" || stage === "error") && (
              <button
                onClick={generate}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors active:scale-95"
              >
                <RefreshCw className="w-4 h-4" />
                Gerar Novo QR Code
              </button>
            )}

            {stage === "waiting" && (
              <div className="flex items-start gap-2.5 bg-muted/50 rounded-xl p-3">
                <Smartphone className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Abra o app → <strong className="text-foreground">Perfil</strong> → <strong className="text-foreground">Logar via Web</strong> → aponte a câmera para o QR Code
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Link para baixar o app */}
        <div className="mt-6 text-center space-y-3">
          <p className="text-xs text-muted-foreground">Ainda não tem o app?</p>
          <div className="flex gap-3 justify-center">
            <a
              href="https://apps.apple.com/app/chamô/id6742879924"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border bg-card text-xs font-semibold text-foreground hover:border-primary/30 transition-colors"
            >
              App Store
            </a>
            <a
              href="https://play.google.com/store/apps/details?id=com.appchamo.app"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border bg-card text-xs font-semibold text-foreground hover:border-primary/30 transition-colors"
            >
              Google Play
            </a>
          </div>
          <button
            onClick={() => navigate("/")}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Voltar ao início
          </button>
        </div>
      </div>
    </div>
  );
}
