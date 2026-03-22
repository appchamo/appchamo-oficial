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
import { QrCode, RefreshCw, Smartphone, CheckCircle2, AlertCircle, Loader2, ArrowLeft, Globe } from "lucide-react";

const BG_PHOTO = "https://wfxeiuqxzrlnvlopcrwd.supabase.co/storage/v1/object/public/uploads/tutorials/135419.png";
const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/qr-login`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const QR_TTL_MS = 5 * 60 * 1000;
const EXPIRE_SHOW_MS = 6 * 60 * 1000;

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

      countdownRef.current = setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current;
        const left = Math.max(0, Math.floor((QR_TTL_MS - elapsed) / 1000));
        setSecondsLeft(left);
        if (elapsed >= EXPIRE_SHOW_MS) {
          setStage("expired");
          clearTimers();
        }
      }, 1000);

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
    ? `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(token)}&bgcolor=ffffff&color=1a1a1a&qzone=2&format=png`
    : null;

  const minutes = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const isUrgent = secondsLeft <= 60;

  return (
    <div
      className="relative min-h-screen flex flex-col overflow-hidden"
      style={{
        backgroundImage: `url("${BG_PHOTO}")`,
        backgroundSize: "cover",
        backgroundPosition: "center top",
      }}
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/85 to-black/40 pointer-events-none" />
      <div className="absolute inset-0 bg-black/30 md:hidden pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 w-full px-6 md:px-12 py-5 flex items-center justify-between max-w-screen-xl mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/30">
            <span className="text-xl text-white font-extrabold">C</span>
          </div>
          <span className="text-2xl font-extrabold text-white tracking-tight">Chamô</span>
        </div>
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </button>
      </header>

      {/* Content — two-column on desktop */}
      <main className="relative z-10 flex-1 flex flex-col md:flex-row items-center justify-center gap-12 lg:gap-20 px-6 md:px-12 max-w-screen-xl mx-auto w-full py-10">

        {/* Left: text */}
        <div className="max-w-md space-y-6 text-center md:text-left">
          <div className="flex items-center justify-center md:justify-start">
            <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center shadow-xl shadow-primary/30">
              <Globe className="w-7 h-7 text-white" />
            </div>
          </div>

          <div>
            <h1 className="text-4xl md:text-5xl font-extrabold text-white leading-tight mb-3">
              Acessar<br />via Web
            </h1>
            <p className="text-white/60 text-lg leading-relaxed">
              Escaneie o QR Code ao lado com o app Chamô para entrar no site sem precisar digitar senha.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-white/5 border border-white/10 backdrop-blur-sm rounded-2xl p-4">
              <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-white text-xs font-bold">1</span>
              </div>
              <p className="text-sm text-white/70 leading-relaxed">
                Abra o app <strong className="text-white">Chamô</strong> no seu celular
              </p>
            </div>
            <div className="flex items-start gap-3 bg-white/5 border border-white/10 backdrop-blur-sm rounded-2xl p-4">
              <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-white text-xs font-bold">2</span>
              </div>
              <p className="text-sm text-white/70 leading-relaxed">
                Vá em <strong className="text-white">Perfil → Logar via Web</strong>
              </p>
            </div>
            <div className="flex items-start gap-3 bg-white/5 border border-white/10 backdrop-blur-sm rounded-2xl p-4">
              <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-white text-xs font-bold">3</span>
              </div>
              <p className="text-sm text-white/70 leading-relaxed">
                Aponte a câmera para o <strong className="text-white">QR Code</strong> ao lado
              </p>
            </div>
          </div>

          <div className="pt-2">
            <p className="text-xs text-white/30 mb-3">Ainda não tem o app?</p>
            <div className="flex gap-3 justify-center md:justify-start">
              <a
                href="https://apps.apple.com/app/chamô/id6742879924"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-white transition-all hover:scale-105"
                style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)" }}
              >
                App Store
              </a>
              <a
                href="https://play.google.com/store/apps/details?id=com.appchamo.app"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-white transition-all hover:scale-105"
                style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}
              >
                Google Play
              </a>
            </div>
          </div>
        </div>

        {/* Right: QR card */}
        <div className="w-full max-w-sm flex-shrink-0">
          <div
            className="rounded-3xl shadow-2xl overflow-hidden"
            style={{ background: "rgba(255,255,255,0.06)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.15)" }}
          >
            <div className="p-8 flex flex-col items-center gap-5">

              {stage === "loading" && (
                <div className="w-[260px] h-[260px] rounded-2xl bg-white/10 flex items-center justify-center">
                  <Loader2 className="w-10 h-10 animate-spin text-white/40" />
                </div>
              )}

              {stage === "waiting" && qrImageUrl && (
                <>
                  <div className="relative">
                    <img
                      src={qrImageUrl}
                      alt="QR Code de login"
                      width={260}
                      height={260}
                      className="rounded-2xl shadow-xl"
                    />
                    {/* Cantos animados */}
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-2xl" />
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-2xl" />
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-2xl" />
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-2xl" />
                  </div>

                  {/* Timer */}
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${isUrgent ? "bg-rose-400 animate-pulse" : "bg-emerald-400"}`} />
                    <span className={`font-mono text-lg font-bold ${isUrgent ? "text-rose-300" : "text-white"}`}>
                      {minutes}:{secs.toString().padStart(2, "0")}
                    </span>
                    <span className="text-white/40 text-sm">para expirar</span>
                  </div>

                  <div className="flex items-center gap-2 bg-white/5 rounded-xl px-4 py-2.5">
                    <Smartphone className="w-4 h-4 text-primary flex-shrink-0" />
                    <p className="text-xs text-white/50">Aponte a câmera do app para este código</p>
                  </div>
                </>
              )}

              {stage === "scanned" && (
                <div className="w-[260px] h-[260px] rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex flex-col items-center justify-center gap-4">
                  <CheckCircle2 className="w-20 h-20 text-emerald-400" />
                  <div className="text-center">
                    <p className="font-bold text-white text-lg">Login autorizado!</p>
                    <p className="text-sm text-white/50 mt-1">Redirecionando...</p>
                  </div>
                </div>
              )}

              {(stage === "expired" || stage === "error") && (
                <div className="w-[260px] h-[260px] rounded-2xl bg-white/5 border border-white/10 flex flex-col items-center justify-center gap-4">
                  <AlertCircle className="w-16 h-16 text-white/30" />
                  <p className="font-semibold text-white/60 text-center text-sm px-4">
                    {stage === "expired" ? "QR Code expirado" : "Erro ao gerar QR Code"}
                  </p>
                </div>
              )}
            </div>

            {(stage === "expired" || stage === "error") && (
              <div className="px-6 pb-6">
                <button
                  onClick={generate}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-primary text-white font-bold text-sm hover:bg-primary/90 transition-all active:scale-95 shadow-lg shadow-primary/30"
                >
                  <RefreshCw className="w-4 h-4" />
                  Gerar Novo QR Code
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full px-6 md:px-12 py-4 border-t border-white/10 flex items-center justify-between max-w-screen-xl mx-auto">
        <p className="text-xs text-white/30">© 2026 Chamô. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}
