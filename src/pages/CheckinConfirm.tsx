/**
 * CheckinConfirm — tela de validação do cliente no caixa do patrocinador.
 * Acessada ao escanear o QR do caixa (rota /c/:token).
 * Pede consentimento LGPD na primeira validação e confirma o check-in.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { CheckCircle2, AlertCircle, Loader2, ShieldCheck, Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Stage = "loading" | "consent" | "success" | "error";

const CheckinConfirm = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("loading");
  const [sponsorName, setSponsorName] = useState<string>("");
  const [discount, setDiscount] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const ranRef = useRef(false);

  const doScan = useCallback(async (consent: boolean) => {
    if (!token) { setStage("error"); setErrorMsg("QR Code inválido."); return; }
    try {
      const { data, error } = await supabase.functions.invoke("sponsor-checkin", {
        body: { action: "scan", token, consent },
      });
      if (error) {
        // Erros HTTP da função vêm em error.context; tenta extrair a mensagem
        let msg = "Não foi possível validar. Tente novamente.";
        try {
          const ctx = (error as any)?.context;
          const parsed = ctx && typeof ctx.json === "function" ? await ctx.json() : null;
          if (parsed?.error) msg = parsed.error;
        } catch { /* ignore */ }
        setStage("error"); setErrorMsg(msg); return;
      }
      if (data?.needs_consent) {
        setSponsorName(data.sponsor_name || "");
        setStage("consent");
        return;
      }
      if (data?.ok) {
        setSponsorName(data.sponsor_name || "");
        setDiscount(Number(data.discount_percent) || 0);
        setStage("success");
        return;
      }
      setStage("error"); setErrorMsg(data?.error || "Não foi possível validar.");
    } catch (e: any) {
      setStage("error"); setErrorMsg(e?.message || "Erro de conexão.");
    }
  }, [token]);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    doScan(false);
  }, [doScan]);

  const handleAccept = async () => {
    setSubmitting(true);
    setStage("loading");
    await doScan(true);
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-extrabold text-gradient mb-6">Chamô</h1>

        {stage === "loading" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Validando no caixa…</p>
          </div>
        )}

        {stage === "consent" && (
          <div className="bg-card border rounded-2xl p-6 text-left">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="w-5 h-5 text-primary" />
              <h2 className="font-bold text-foreground">Autorizar validação</h2>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              Ao validar{ sponsorName ? <> em <strong className="text-foreground">{sponsorName}</strong></> : "" }, você
              autoriza compartilhar com o estabelecimento seu <strong>nome</strong>, <strong>foto</strong>,
              os <strong>últimos dígitos do seu CPF</strong> e sua <strong>data de nascimento</strong>,
              apenas para confirmar sua identidade no caixa.
            </p>
            <button
              onClick={handleAccept}
              disabled={submitting}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {submitting ? "Validando…" : "Autorizo e validar"}
            </button>
            <button
              onClick={() => navigate(-1)}
              className="w-full mt-2 py-2.5 rounded-xl text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              Agora não
            </button>
          </div>
        )}

        {stage === "success" && (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="w-24 h-24 rounded-3xl bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-500" />
            </div>
            <h2 className="font-bold text-foreground text-xl">Validado!</h2>
            <p className="text-sm text-muted-foreground max-w-xs flex items-center gap-1.5 justify-center">
              <Store className="w-4 h-4" />
              {sponsorName ? <>Você foi validado em <strong className="text-foreground">{sponsorName}</strong>.</> : "Validação concluída."}
            </p>

            {discount > 0 && (
              <div className="mt-1 w-full rounded-2xl border-2 border-emerald-400/40 bg-emerald-50 dark:bg-emerald-950/30 px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Você ganhou</p>
                <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400 leading-none my-1">{discount}% OFF</p>
                <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80">de desconto no seu pagamento. Mostre esta tela no caixa.</p>
              </div>
            )}
            <Link
              to="/home"
              className="mt-2 inline-flex items-center px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              Voltar ao início
            </Link>
          </div>
        )}

        {stage === "error" && (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="w-24 h-24 rounded-3xl bg-rose-50 flex items-center justify-center">
              <AlertCircle className="w-12 h-12 text-rose-500" />
            </div>
            <h2 className="font-bold text-foreground text-xl">Não deu certo</h2>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">{errorMsg}</p>
            <Link
              to="/home"
              className="mt-2 inline-flex items-center px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              Voltar ao início
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default CheckinConfirm;
