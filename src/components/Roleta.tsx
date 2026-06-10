/**
 * Roleta de prêmios animada (estilo Shopee/Temu).
 * - Sorteio feito no servidor (RPC roleta_spin) — o cliente nunca decide o prêmio.
 * - 6 segmentos genéricos ("Prêmio N"); o prêmio real aparece no modal de vitória.
 * - Animação fluida com Framer Motion; pino fixo no topo.
 *
 * Uso: controlado pelo RoletaGate. Recebe trigger + grantId, dispara o giro,
 * e chama onDone quando o usuário resgata, ou onDismiss se deixar pra depois.
 */
import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  RoletaTrigger, RoletaResult, prizeTitle, prizeSubtitle, prizeEmoji,
} from "@/lib/roleta";

interface Props {
  trigger: RoletaTrigger;
  grantId?: string | null;
  onDone: () => void;      // resgatou o prêmio → seguir a fila
  onDismiss: () => void;   // deixou pra depois / sem giro → fechar sem reabrir
}

const SEGMENTS = 6;
const SEG_ANGLE = 360 / SEGMENTS; // 60°
const COLORS = ["#f97316", "#fb923c", "#f97316", "#fb923c", "#f97316", "#fb923c"];

const CX = 150, CY = 150, R = 140;

function toRad(a: number) { return ((a - 90) * Math.PI) / 180; }
function wedgePath(i: number) {
  const start = i * SEG_ANGLE;
  const end = (i + 1) * SEG_ANGLE;
  const x1 = CX + R * Math.cos(toRad(start));
  const y1 = CY + R * Math.sin(toRad(start));
  const x2 = CX + R * Math.cos(toRad(end));
  const y2 = CY + R * Math.sin(toRad(end));
  return `M${CX},${CY} L${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 0 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`;
}

export default function Roleta({ trigger, grantId = null, onDone, onDismiss }: Props) {
  const [phase, setPhase] = useState<"idle" | "spinning" | "won">("idle");
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<RoletaResult | null>(null);
  const resultRef = useRef<RoletaResult | null>(null);

  const headerTitle = trigger === "login" ? "🎉 Giro do dia!" : "🎁 Você ganhou um giro!";
  const headerSub = trigger === "login"
    ? "Gire a roleta e ganhe um prêmio. Volte todo dia!"
    : "Obrigado pela compra! Gire a roleta e ganhe um prêmio.";

  const spin = async () => {
    if (phase !== "idle") return;
    setPhase("spinning");
    const { data, error } = await supabase.rpc("roleta_spin" as any, {
      p_trigger: trigger,
      p_grant_id: grantId,
    });
    if (error) {
      // Sem giro disponível (corrida/duplicado): fecha sem barulho.
      if (String(error.message || "").includes("no_spin_available")) {
        onDismiss();
        return;
      }
      toast({ title: "Erro na roleta", description: error.message, variant: "destructive" });
      onDismiss();
      return;
    }
    resultRef.current = data as RoletaResult;
    // Segmento de parada (puramente visual); o prêmio real vem do servidor.
    const target = Math.floor(Math.random() * SEGMENTS);
    const final = 360 * 6 + (360 - (target * SEG_ANGLE + SEG_ANGLE / 2));
    setRotation(final);
  };

  const handleAnimComplete = () => {
    if (phase === "spinning" && resultRef.current) {
      setResult(resultRef.current);
      setPhase("won");
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-5"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <motion.div
        className="relative bg-card rounded-3xl w-full max-w-sm p-6 text-center overflow-hidden"
        initial={{ scale: 0.7, y: 30, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.85, opacity: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
      >
        {/* brilho de fundo */}
        <div className="pointer-events-none absolute -top-20 -right-16 w-48 h-48 rounded-full bg-primary/15 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-16 w-48 h-48 rounded-full bg-amber-400/15 blur-2xl" />

        {phase !== "won" && (
          <>
            <button
              onClick={onDismiss}
              aria-label="Fechar"
              className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors z-10"
            >
              <X className="w-4 h-4" />
            </button>

            <h2 className="text-lg font-extrabold text-foreground mb-1 relative">{headerTitle}</h2>
            <p className="text-xs text-muted-foreground mb-4 relative">{headerSub}</p>

            {/* Roda */}
            <div className="relative mx-auto mb-5" style={{ width: 280, height: 296 }}>
              {/* Pino */}
              <div className="absolute left-1/2 -translate-x-1/2 z-20" style={{ top: -2 }}>
                <div
                  className="w-0 h-0"
                  style={{
                    borderLeft: "12px solid transparent",
                    borderRight: "12px solid transparent",
                    borderTop: "22px solid #dc2626",
                    filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.25))",
                  }}
                />
              </div>

              <motion.svg
                viewBox="0 0 300 300"
                width={280}
                height={280}
                className="mx-auto"
                style={{ originX: "50%", originY: "50%" }}
                animate={{ rotate: rotation }}
                transition={{ duration: 4.2, ease: [0.16, 1, 0.3, 1] }}
                onAnimationComplete={handleAnimComplete}
              >
                <circle cx={CX} cy={CY} r={R + 6} fill="#fff" stroke="#f59e0b" strokeWidth={6} />
                {Array.from({ length: SEGMENTS }).map((_, i) => (
                  <path key={i} d={wedgePath(i)} fill={COLORS[i % COLORS.length]} stroke="#fff" strokeWidth={2} />
                ))}
                {Array.from({ length: SEGMENTS }).map((_, i) => (
                  <text
                    key={`t${i}`}
                    x={CX}
                    y={52}
                    textAnchor="middle"
                    fontSize="13"
                    fontWeight="700"
                    fill="#fff"
                    transform={`rotate(${i * SEG_ANGLE + SEG_ANGLE / 2} ${CX} ${CY})`}
                  >
                    Prêmio {i + 1}
                  </text>
                ))}
                {/* miolo */}
                <circle cx={CX} cy={CY} r={26} fill="#fff" stroke="#f59e0b" strokeWidth={4} />
                <text x={CX} y={CY + 5} textAnchor="middle" fontSize="22">🎁</text>
              </motion.svg>
            </div>

            <button
              onClick={spin}
              disabled={phase === "spinning"}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-primary text-primary-foreground font-extrabold text-base shadow-lg active:scale-[0.98] transition-transform disabled:opacity-70"
            >
              {phase === "spinning" ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
              {phase === "spinning" ? "Girando..." : "GIRAR"}
            </button>

            {phase === "idle" && (
              <button onClick={onDismiss} className="mt-3 text-xs text-muted-foreground underline">
                Deixar pra depois
              </button>
            )}
          </>
        )}

        {/* Vitória */}
        <AnimatePresence>
          {phase === "won" && result && (
            <motion.div
              className="relative py-4"
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            >
              <motion.div
                className="text-6xl mb-3"
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: [0, -12, 12, 0] }}
                transition={{ duration: 0.7, type: "spring", stiffness: 240, damping: 14 }}
              >
                {prizeEmoji(result.prize)}
              </motion.div>
              <h3 className="text-xl font-extrabold text-foreground mb-1">Parabéns!</h3>
              <p className="text-lg font-bold text-primary mb-1">{prizeTitle(result.prize)}</p>
              <p className="text-sm text-muted-foreground mb-5 px-4">{prizeSubtitle(result.prize)}</p>
              <button
                onClick={onDone}
                className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-bold text-sm active:scale-[0.98] transition-transform"
              >
                Resgatar
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
