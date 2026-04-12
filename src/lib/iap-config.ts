/**
 * Configuração de In-App Purchase (App Store / Google Play).
 * Os Product IDs devem ser criados no App Store Connect (iOS) e Google Play Console (Android).
 *
 * App Store Connect: Monetização → Assinaturas → Criar Grupo de Assinatura
 * Cadastre cada linha abaixo como uma assinatura de renovação automática:
 *
 *  Product ID                          | Plano    | Duração    | Preço BRL
 *  ------------------------------------|----------|------------|-----------
 *  com.chamo.app.pro.monthly           | Pro      | 1 mês      | (preço na loja)
 *  com.chamo.app.vip.monthly           | VIP      | 1 mês      | …
 *  com.chamo.app.business.monthly      | Business | 1 mês      | …
 *
 *  Produtos .semester / .annual podem existir na App Store para quem já assinou;
 *  o app só oferece compra do .monthly (getAllProductIds).
 */

export type IAPPlanId = "pro" | "vip" | "business";
export type IAPBillingPeriod = "monthly" | "semester" | "annual";

/** Mapa plan + período → Product ID da loja */
export const IAP_PRODUCT_IDS: Record<IAPPlanId, Record<IAPBillingPeriod, string>> = {
  pro: {
    monthly:  "com.chamo.app.pro.monthly",
    semester: "com.chamo.app.pro.semester",
    annual:   "com.chamo.app.pro.annual",
  },
  vip: {
    monthly:  "com.chamo.app.vip.monthly",
    semester: "com.chamo.app.vip.semester",
    annual:   "com.chamo.app.vip.annual",
  },
  business: {
    monthly:  "com.chamo.app.business.monthly",
    semester: "com.chamo.app.business.semester",
    annual:   "com.chamo.app.business.annual",
  },
};

/** Lista de planos pagos que têm produto IAP (não inclui free). */
export const IAP_PAID_PLANS: IAPPlanId[] = ["pro", "vip", "business"];

/** Product IDs pedidos à loja no checkout (só mensal). */
export function getAllProductIds(): string[] {
  return IAP_PAID_PLANS.map((plan) => IAP_PRODUCT_IDS[plan].monthly);
}

/**
 * Dado plan_id e período, retorna o product identifier da loja.
 */
export function getProductIdForPlan(
  planId: string,
  billingPeriod: "monthly" | "semester" | "annual" = "monthly"
): string | null {
  if (!(planId in IAP_PRODUCT_IDS)) return null;
  const plan = IAP_PRODUCT_IDS[planId as IAPPlanId];
  return plan[billingPeriod] ?? plan.monthly;
}

/** Dado product identifier da loja, retorna { planId, billingPeriod }. */
export function parsePlanFromProductId(
  productIdentifier: string
): { planId: string; billingPeriod: IAPBillingPeriod } | null {
  for (const [planId, periods] of Object.entries(IAP_PRODUCT_IDS)) {
    for (const [period, id] of Object.entries(periods)) {
      if (id === productIdentifier) {
        return { planId, billingPeriod: period as IAPBillingPeriod };
      }
    }
  }
  return null;
}

/** Retrocompatibilidade — retorna só o planId */
export function getPlanIdFromProductId(productIdentifier: string): string | null {
  return parsePlanFromProductId(productIdentifier)?.planId ?? null;
}
