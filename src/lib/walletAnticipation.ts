/** Campos da lista da carteira usados pelo botão de antecipação. */
export const WALLET_LIST_SELECT =
  "id, amount, description, status, created_at, transferred_at, available_at, payment_method, anticipation_enabled, gross_amount, platform_fee_amount, payment_fee_amount, installment_count";

/** Configurações de antecipação e prazos (mesmas chaves do admin / cobrança no chat). */
export type WalletAnticipationPlatformSettings = {
  anticipation_mode: string;
  anticipation_monthly_rate: string;
  anticipation_fee_pct: string;
  transfer_period_card_days: string;
  transfer_period_card_anticipated_days: string;
};

export function parseAnticipationSettingsFromRows(rows: { key: string; value: unknown }[]): WalletAnticipationPlatformSettings {
  const m: Record<string, string> = {};
  for (const r of rows) {
    const v = r.value;
    m[r.key] = typeof v === "string" ? v : JSON.stringify(v).replace(/^"|"$/g, "");
  }
  return {
    anticipation_mode: m.anticipation_mode || "simple",
    anticipation_monthly_rate: m.anticipation_monthly_rate || "1.15",
    anticipation_fee_pct: m.anticipation_fee_pct || "3.5",
    transfer_period_card_days: m.transfer_period_card_days || "33",
    transfer_period_card_anticipated_days: m.transfer_period_card_anticipated_days || "4",
  };
}

/** Igual a MessageThread.calcAnticipationFee: taxa sobre valor original do serviço (gross). */
export function computeAnticipationFeeBRL(
  grossOriginal: number,
  installments: number,
  s: WalletAnticipationPlatformSettings,
): number {
  const mode = (s.anticipation_mode || "simple").toLowerCase();
  const inst = Math.max(1, Math.floor(installments) || 1);
  if (mode === "monthly") {
    const monthlyRate = parseFloat(s.anticipation_monthly_rate) || 1.15;
    return parseFloat((grossOriginal * (monthlyRate / 100) * inst).toFixed(2));
  }
  const pct = parseFloat(s.anticipation_fee_pct) || 0;
  return parseFloat((grossOriginal * (pct / 100)).toFixed(2));
}

export function fmtBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Lê valor numérico de platform_settings.value (jsonb / string). */
/** Valor original do serviço a partir da linha da carteira (gross ou reconstruído). */
export function walletTxGrossOriginal(tx: {
  amount: number;
  gross_amount?: number | null;
  platform_fee_amount?: number | null;
  payment_fee_amount?: number | null;
}): number {
  const g = tx.gross_amount != null ? Number(tx.gross_amount) : NaN;
  if (Number.isFinite(g) && g > 0) return g;
  return (
    Number(tx.amount) + Number(tx.platform_fee_amount ?? 0) + Number(tx.payment_fee_amount ?? 0)
  );
}

export function parseSettingNumber(v: unknown): number {
  if (v == null) return 0;
  const s =
    typeof v === "string" ? v.trim().replace(/^"|"$/g, "") : JSON.stringify(v).replace(/^"|"$/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
