/**
 * Roleta de prêmios — tipos e helpers de exibição.
 * O sorteio é feito 100% no servidor (RPC roleta_spin). Aqui só traduzimos o
 * prêmio retornado para texto/visual. Os 6 segmentos da roda são genéricos
 * ("Prêmio N") — o resultado real aparece no modal de vitória.
 */

export type RoletaTrigger = "payment" | "login";

export type RoletaPrize = "raffle" | "discount_2" | "discount_5" | "discount_10";

export interface RoletaResult {
  prize: RoletaPrize;
  discount: number | null;
  coupon_id: string | null;
}

export interface RoletaPending {
  payment: number;
  login: boolean;
}

/** Texto curto do prêmio (título do modal de vitória). */
export function prizeTitle(prize: RoletaPrize): string {
  switch (prize) {
    case "discount_2": return "Cupom de 2% OFF";
    case "discount_5": return "Cupom de 5% OFF";
    case "discount_10": return "Cupom de 10% OFF";
    case "raffle":
    default: return "Número da sorte!";
  }
}

/** Subtexto explicativo do prêmio. */
export function prizeSubtitle(prize: RoletaPrize): string {
  switch (prize) {
    case "discount_2":
    case "discount_5":
    case "discount_10":
      return "Válido por 30 dias. Use na sua próxima compra.";
    case "raffle":
    default:
      return "Você entrou no sorteio. Boa sorte!";
  }
}

/** Emoji do prêmio. */
export function prizeEmoji(prize: RoletaPrize): string {
  return prize === "raffle" ? "🎟️" : "🏷️";
}
