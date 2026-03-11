import { useState, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import {
  IAP_PRODUCT_IDS,
  IAP_PAID_PLANS,
  getPlanIdFromProductId,
  type IAPPlanId,
} from "@/lib/iap-config";

/** Produto retornado pela loja (título e preço devem vir daqui - exigência Apple). */
export interface IAPProduct {
  identifier: string;
  title: string;
  description?: string;
  price: number;
  priceString: string;
}

/** Resultado de uma compra para enviar ao backend. */
export interface IAPPurchaseResult {
  transactionId: string;
  productIdentifier: string;
  planId: string;
  receipt?: string;
  verificationData?: string;
  purchaseToken?: string;
  platform: "ios" | "android";
}

const isNative = Capacitor.isNativePlatform();
const isIOS = Capacitor.getPlatform() === "ios";
const isAndroid = Capacitor.getPlatform() === "android";

export function useIAP() {
  const [products, setProducts] = useState<IAPProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const loadProducts = useCallback(async (): Promise<IAPProduct[]> => {
    if (!isNative) return [];
    setLoadingProducts(true);
    try {
      const { NativePurchases, PURCHASE_TYPE } = await import(
        "@capgo/native-purchases"
      );
      const { isBillingSupported } = await NativePurchases.isBillingSupported();
      if (!isBillingSupported) return [];

      const productIds = IAP_PAID_PLANS.map((p) => IAP_PRODUCT_IDS[p]);
      const { products: raw } = await NativePurchases.getProducts({
        productIdentifiers: productIds,
        productType: PURCHASE_TYPE.SUBS,
      });

      const list: IAPProduct[] = (raw || []).map((p: any) => ({
        identifier: p.identifier ?? p.productIdentifier ?? "",
        title: p.title ?? "",
        description: p.description,
        price: p.price ?? 0,
        priceString: p.priceString ?? "",
      }));
      setProducts(list);
      return list;
    } catch (e) {
      console.error("[useIAP] loadProducts", e);
      return [];
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  const purchase = useCallback(
    async (planId: IAPPlanId): Promise<IAPPurchaseResult | null> => {
      if (!isNative) return null;
      const productId = IAP_PRODUCT_IDS[planId];
      if (!productId) return null;

      setPurchasing(true);
      try {
        const { NativePurchases, PURCHASE_TYPE } = await import(
          "@capgo/native-purchases"
        );
        const options: any = {
          productIdentifier: productId,
          productType: PURCHASE_TYPE.SUBS,
          quantity: 1,
        };
        if (isAndroid) {
          options.planIdentifier = "monthly";
        }
        const result = await NativePurchases.purchaseProduct(options);

        const platform = isIOS ? "ios" : "android";
        return {
          transactionId: result.transactionId ?? "",
          productIdentifier: result.productIdentifier ?? productId,
          planId,
          receipt: result.receipt,
          verificationData: result.verificationData,
          purchaseToken: result.purchaseToken,
          platform,
        };
      } catch (e: any) {
        if (e?.message?.toLowerCase().includes("cancelled")) {
          return null;
        }
        throw e;
      } finally {
        setPurchasing(false);
      }
    },
    []
  );

  const restore = useCallback(async (): Promise<IAPPurchaseResult[]> => {
    if (!isNative) return [];
    setRestoring(true);
    try {
      const { NativePurchases, PURCHASE_TYPE } = await import(
        "@capgo/native-purchases"
      );
      await NativePurchases.restorePurchases();
      const { purchases } = await NativePurchases.getPurchases({
        productType: PURCHASE_TYPE.SUBS,
      });

      const platform = isIOS ? "ios" : "android";
      const results: IAPPurchaseResult[] = (purchases || [])
        .filter((p: any) => {
          const planId = getPlanIdFromProductId(p.productIdentifier ?? "");
          if (!planId) return false;
          if (isAndroid) {
            return p.purchaseState === "PURCHASED" || p.purchaseState === "1";
          }
          return p.isActive !== false;
        })
        .map((p: any) => ({
          transactionId: p.transactionId ?? "",
          productIdentifier: p.productIdentifier ?? "",
          planId: getPlanIdFromProductId(p.productIdentifier ?? "") ?? "",
          receipt: p.receipt,
          verificationData: p.verificationData,
          purchaseToken: p.purchaseToken,
          platform,
        }))
        .filter((r) => r.planId && r.transactionId);
      return results;
    } catch (e) {
      console.error("[useIAP] restore", e);
      return [];
    } finally {
      setRestoring(false);
    }
  }, []);

  const openSubscriptionManagement = useCallback(async () => {
    if (!isNative) return;
    try {
      const { NativePurchases } = await import("@capgo/native-purchases");
      await NativePurchases.manageSubscriptions();
    } catch (e) {
      console.error("[useIAP] manageSubscriptions", e);
    }
  }, []);

  return {
    isIAPAvailable: isNative,
    isIOS,
    isAndroid,
    products,
    loadingProducts,
    purchasing,
    restoring,
    loadProducts,
    purchase,
    restore,
    openSubscriptionManagement,
    getPlanIdFromProductId,
  };
}
