/**
 * Configuração de In-App Purchase (App Store / Google Play).
 * Os Product IDs devem ser criados no App Store Connect (iOS) e Google Play Console (Android).
 */
export const IAP_PRODUCT_IDS = {
  pro: "com.chamo.app.pro.monthly",
  vip: "com.chamo.app.vip.monthly",
  business: "com.chamo.app.business.monthly",
} as const;

export type IAPPlanId = keyof typeof IAP_PRODUCT_IDS;

/** Lista de planos pagos que têm produto IAP (não inclui free). */
export const IAP_PAID_PLANS: IAPPlanId[] = ["pro", "vip", "business"];

/** Dado plan_id do app, retorna o product identifier da loja. */
export function getProductIdForPlan(planId: string): string | null {
  if (planId in IAP_PRODUCT_IDS) {
    return IAP_PRODUCT_IDS[planId as IAPPlanId];
  }
  return null;
}

/** Dado product identifier da loja, retorna o plan_id do app. */
export function getPlanIdFromProductId(productIdentifier: string): string | null {
  const entry = Object.entries(IAP_PRODUCT_IDS).find(
    ([, id]) => id === productIdentifier
  );
  return entry ? entry[0] : null;
}
