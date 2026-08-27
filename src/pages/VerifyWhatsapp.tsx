import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle, Loader2, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

/** Formata (34) 99999-9999 conforme digita. */
function maskPhone(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

const VerifyWhatsapp = () => {
  const navigate = useNavigate();
  const { profile, refreshProfile } = useAuth();
  const [phase, setPhase] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  const phoneDigits = useMemo(() => phone.replace(/\D/g, ""), [phone]);
  const phoneOk = phoneDigits.length === 11 || phoneDigits.length === 10;

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  // Auto-cura: se o número já foi confirmado (no banco), não fica preso aqui.
  // Recarrega o perfil uma vez ao abrir (caso o estado local esteja desatualizado)
  // e sai da tela assim que phone_verified virar true.
  useEffect(() => {
    void refreshProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (profile?.phone_verified) navigate("/home", { replace: true });
  }, [profile?.phone_verified, navigate]);

  const sendCode = async () => {
    if (!phoneOk || loading) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.functions.invoke("wa-otp-send", { body: { phone: phoneDigits } });
    setLoading(false);
    const res = (data ?? {}) as { ok?: boolean; error?: string };
    if (err || res.error || !res.ok) {
      setError(res.error || err?.message || "Não foi possível enviar o código. Tente de novo.");
      return;
    }
    setPhase("code");
    setResendIn(60);
    setTimeout(() => codeRef.current?.focus(), 100);
  };

  const verifyCode = async () => {
    if (code.length < 4 || loading) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.functions.invoke("wa-otp-verify", { body: { phone: phoneDigits, code } });
    setLoading(false);
    const res = (data ?? {}) as { ok?: boolean; error?: string };
    if (err || !res.ok) {
      setError(res.error || "Código incorreto. Confira e tente de novo.");
      setCode("");
      return;
    }
    // Recarrega o perfil ANTES de sair: senão o PhoneVerificationGuard ainda vê
    // phone_verified=false (estado antigo) e joga o usuário de volta pra cá em loop.
    try {
      await refreshProfile();
    } catch {
      /* mesmo se falhar o refresh, segue — o guard reavalia no próximo load */
    }
    toast({ title: "WhatsApp confirmado! ✅" });
    navigate("/home", { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10 bg-background">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <MessageCircle className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Confirme seu WhatsApp</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {phase === "phone"
              ? "Vamos enviar um código de 4 dígitos no seu WhatsApp para confirmar seu número."
              : `Enviamos um código para o WhatsApp ${phone}. Digite os 4 dígitos abaixo.`}
          </p>
        </div>

        {phase === "phone" ? (
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Número do WhatsApp</label>
              <input
                value={phone}
                onChange={(e) => setPhone(maskPhone(e.target.value))}
                onKeyDown={(e) => e.key === "Enter" && sendCode()}
                placeholder="(34) 99999-9999"
                inputMode="numeric"
                autoFocus
                className="w-full border rounded-xl px-3 py-3 text-base bg-background outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={() => void sendCode()} disabled={!phoneOk || loading} className="w-full font-bold py-6">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Enviar código"}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <input
              ref={codeRef}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
              onKeyDown={(e) => e.key === "Enter" && verifyCode()}
              placeholder="0000"
              inputMode="numeric"
              maxLength={4}
              className="w-full border rounded-xl px-3 py-3 text-center text-2xl tracking-[0.5em] font-bold bg-background outline-none focus:ring-2 focus:ring-primary/30"
            />
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
            <Button onClick={() => void verifyCode()} disabled={code.length < 4 || loading} className="w-full font-bold py-6">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Confirmar"}
            </Button>
            <button
              type="button"
              disabled={resendIn > 0 || loading}
              onClick={() => void sendCode()}
              className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50 mt-1"
            >
              {resendIn > 0 ? `Reenviar código em ${resendIn}s` : "Não recebi. Reenviar código"}
            </button>
            <button
              type="button"
              onClick={() => { setPhase("phone"); setCode(""); setError(null); }}
              className="inline-flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-1"
            >
              <ArrowLeft className="w-3 h-3" /> Trocar número
            </button>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground text-center mt-6">
          {profile?.full_name ? `${String(profile.full_name).split(" ")[0]}, ` : ""}
          confirmar o WhatsApp deixa sua conta mais segura e é rapidinho.
        </p>
      </div>
    </div>
  );
};

export default VerifyWhatsapp;
