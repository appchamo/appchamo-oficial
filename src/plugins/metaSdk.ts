import { Capacitor, registerPlugin } from "@capacitor/core";

/**
 * Ponte para o MetaSdkPlugin nativo. Existe apenas no Android — no iOS o
 * próprio ATT (App Tracking Transparency) controla a coleta do IDFA e o
 * SDK da Meta respeita ATT nativamente via Info.plist, então não há
 * necessidade de ponte equivalente.
 */
interface MetaSdkPluginShape {
  enable(): Promise<{ enabled: boolean }>;
  disable(): Promise<{ enabled: boolean }>;
}

const MetaSdkNative = registerPlugin<MetaSdkPluginShape>("MetaSdk");

/**
 * Ativa o Meta SDK após consent explícito (LGPD). No-op em web/iOS.
 * Idempotente: chamar múltiplas vezes é seguro.
 */
export async function enableMetaSdk(): Promise<void> {
  if (Capacitor.getPlatform() !== "android") return;
  try {
    await MetaSdkNative.enable();
  } catch (e) {
    // Não travar o app se o SDK falhar — é telemetria, não fluxo crítico.
    console.warn("[MetaSdk] enable falhou:", e);
  }
}

/**
 * Revoga consent. Observação: o efeito pleno (parar de enviar eventos
 * já em fila) só é garantido após o próximo cold start, conforme API
 * pública do Facebook SDK.
 */
export async function disableMetaSdk(): Promise<void> {
  if (Capacitor.getPlatform() !== "android") return;
  try {
    await MetaSdkNative.disable();
  } catch (e) {
    console.warn("[MetaSdk] disable falhou:", e);
  }
}
