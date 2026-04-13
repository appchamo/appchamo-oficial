import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import {
  computeAnticipationFeeBRL,
  fmtBRL,
  type WalletAnticipationPlatformSettings,
} from "@/lib/walletAnticipation";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletTransactionId: string;
  grossOriginal: number;
  currentNet: number;
  installments: number;
  anticipation: WalletAnticipationPlatformSettings;
  cardDaysWithoutAnticipation: number;
  cardDaysWithAnticipation: number;
  onSuccess: () => void;
};

const rpcErrorMessage = (code: string): string => {
  const map: Record<string, string> = {
    not_authenticated: "Faça login novamente.",
    not_found: "Lançamento não encontrado.",
    not_pending: "Este valor não está mais pendente.",
    not_card: "Antecipação só se aplica a pagamentos no cartão.",
    already_anticipated: "Este pagamento já está com antecipação.",
    invalid_gross: "Não foi possível calcular o valor do serviço.",
    negative_net: "O valor líquido ficaria negativo com a taxa de antecipação.",
    concurrent_update: "Não foi possível concluir. Tente de novo.",
  };
  return map[code] || "Não foi possível solicitar a antecipação.";
};

export function RequestAnticipationDialog({
  open,
  onOpenChange,
  walletTransactionId,
  grossOriginal,
  currentNet,
  installments,
  anticipation,
  cardDaysWithoutAnticipation,
  cardDaysWithAnticipation,
  onSuccess,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const mode = (anticipation.anticipation_mode || "simple").toLowerCase();
  const fee = computeAnticipationFeeBRL(grossOriginal, installments, anticipation);
  const newNet = Math.round((currentNet - fee) * 100) / 100;

  const feeDescription =
    mode === "monthly"
      ? `${anticipation.anticipation_monthly_rate}% ao mês sobre o valor original do serviço, multiplicado pelo número de parcelas (${Math.max(1, installments)}).`
      : `${anticipation.anticipation_fee_pct}% sobre o valor original do serviço (antes de taxas da plataforma e do meio de pagamento).`;

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("request_wallet_card_anticipation", {
        p_wallet_transaction_id: walletTransactionId,
      });
      if (error) {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
        return;
      }
      const row = data as { ok?: boolean; error?: string; new_net?: number; anticipation_fee?: number } | null;
      if (!row?.ok) {
        toast({
          title: "Não foi possível",
          description: rpcErrorMessage(String(row?.error || "unknown")),
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Antecipação solicitada",
        description: `Novo valor líquido: ${fmtBRL(Number(row.new_net))}. Prazo de repasse atualizado.`,
      });
      onOpenChange(false);
      onSuccess();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Solicitar antecipação</DialogTitle>
            <div className="space-y-3 text-left text-sm text-muted-foreground pt-1">
              <p>
                A antecipação reduz o prazo para o valor cair na sua carteira disponível para saque. A taxa é a mesma
                definida pela plataforma no painel administrativo.
              </p>
              <ul className="list-disc pl-4 space-y-1.5 text-[13px]">
                <li>
                  <span className="text-foreground font-medium">Como funciona:</span> aplicamos a taxa de antecipação
                  sobre o valor original do serviço; o valor que você recebe (líquido) é atualizado na carteira.
                </li>
                <li>
                  <span className="text-foreground font-medium">Taxa (configuração atual):</span> {feeDescription}
                </li>
                <li>
                  <span className="text-foreground font-medium">Prazo sem antecipação (cartão):</span> até{" "}
                  {cardDaysWithoutAnticipation} dias após o pagamento.
                </li>
                <li>
                  <span className="text-foreground font-medium">Prazo com antecipação (cartão):</span> até{" "}
                  {cardDaysWithAnticipation} dias após o pagamento.
                </li>
              </ul>
              <div className="rounded-lg border bg-muted/40 px-3 py-2 text-[13px] text-foreground space-y-1">
                <p>
                  Valor original (serviço): <strong>{fmtBRL(grossOriginal)}</strong>
                </p>
                <p>
                  Taxa de antecipação estimada: <strong>{fmtBRL(fee)}</strong>
                </p>
                <p>
                  Seu líquido hoje (pendente): <strong>{fmtBRL(currentNet)}</strong>
                </p>
                <p>
                  Líquido após antecipação (estimado): <strong>{fmtBRL(newNet)}</strong>
                </p>
              </div>
            </div>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={submitting || newNet < 0}>
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processando…
              </>
            ) : (
              "Confirmar antecipação"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
