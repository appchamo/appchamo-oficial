import { useEffect, useState, useCallback } from "react";
import { Loader2, Ticket, X, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Botão "Aplicar cupom" para o checkout do cliente.
 *
 * Como funciona: o cliente NÃO digita código. Quando ele vai pagar para um
 * profissional X, chamamos a RPC `get_best_active_coupon_for_pro(X, valor)`
 * que devolve o melhor cupom ativo aplicável a essa compra. O cliente só clica
 * em "Aplicar cupom" e o desconto entra. Pode remover a qualquer momento.
 */

export interface AppliedCoupon {
  id: string;
  name: string | null;
  discount_type: "amount" | "percent";
  discount_value: number;
  /** Quanto será descontado em R$ para o `amount` informado. */
  effective_discount: number;
}

interface ApplyCouponButtonProps {
  professionalId: string;
  /** Valor da compra em R$ (será usado para calcular o melhor cupom e o desconto). */
  amount: number;
  /** Cupom atualmente aplicado (controlado pelo pai). */
  applied: AppliedCoupon | null;
  onApply: (coupon: AppliedCoupon) => void;
  onRemove: () => void;
  className?: string;
}

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const ApplyCouponButton = ({
  professionalId,
  amount,
  applied,
  onApply,
  onRemove,
  className,
}: ApplyCouponButtonProps) => {
  const [bestCoupon, setBestCoupon] = useState<AppliedCoupon | null>(null);
  const [loading, setLoading] = useState(false);

  const loadBest = useCallback(async () => {
    if (!professionalId || !Number.isFinite(amount) || amount <= 0) {
      setBestCoupon(null);
      return;
    }
    setLoading(true);
    try {
      // RPC ainda não está nos tipos gerados → cast.
      const { data, error } = await (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{
          data: AppliedCoupon[] | null;
          error: { message: string } | null;
        }>
      )("get_best_active_coupon_for_pro", {
        p_professional_id: professionalId,
        p_amount: amount,
      });
      if (error) {
        setBestCoupon(null);
        return;
      }
      const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
      setBestCoupon(
        row
          ? {
              ...row,
              discount_value: Number(row.discount_value),
              effective_discount: Number(row.effective_discount),
            }
          : null,
      );
    } finally {
      setLoading(false);
    }
  }, [professionalId, amount]);

  useEffect(() => {
    void loadBest();
  }, [loadBest]);

  // Se o cupom aplicado deixou de ser válido (mudou o valor da compra,
  // por exemplo), removemos automaticamente.
  useEffect(() => {
    if (applied && bestCoupon === null && !loading) {
      onRemove();
    }
  }, [applied, bestCoupon, loading, onRemove]);

  if (loading && !bestCoupon && !applied) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 text-xs text-muted-foreground py-2",
          className,
        )}
      >
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Procurando cupons disponíveis…
      </div>
    );
  }

  if (!bestCoupon && !applied) {
    return null;
  }

  if (applied) {
    return (
      <div
        className={cn(
          "flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200",
          className,
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-emerald-700 truncate">
              Cupom aplicado: −{BRL.format(applied.effective_discount)}
            </p>
            <p className="text-[11px] text-emerald-700/80">
              {applied.discount_type === "percent"
                ? `${applied.discount_value}% de desconto`
                : `${BRL.format(applied.discount_value)} de desconto`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
          aria-label="Remover cupom"
        >
          <X className="w-3.5 h-3.5" />
          Remover
        </button>
      </div>
    );
  }

  // Tem cupom disponível, mas ainda não aplicado.
  return (
    <button
      type="button"
      onClick={() => bestCoupon && onApply(bestCoupon)}
      disabled={!bestCoupon}
      className={cn(
        "w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 text-left hover:bg-primary/10 transition-colors",
        className,
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Ticket className="w-4 h-4 text-primary shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-primary truncate">
            Aplicar cupom · −{BRL.format(bestCoupon!.effective_discount)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {bestCoupon!.discount_type === "percent"
              ? `${bestCoupon!.discount_value}% de desconto neste pagamento`
              : `${BRL.format(bestCoupon!.discount_value)} de desconto neste pagamento`}
          </p>
        </div>
      </div>
      <span className="text-xs font-bold text-primary">Aplicar →</span>
    </button>
  );
};

export default ApplyCouponButton;
