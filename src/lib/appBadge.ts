import { Capacitor } from "@capacitor/core";

/**
 * Sincroniza o número do badge do ícone do app (iOS/Android) com a quantidade de notificações não lidas.
 * Quando o usuário abre as notificações ou quando a contagem é 0, o badge some.
 */
export async function syncAppIconBadge(notificationCount: number): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Badge } = await import("@capawesome/capacitor-badge");
    const { isSupported } = await Badge.isSupported();
    if (!isSupported.isSupported) return;
    if (notificationCount <= 0) {
      await Badge.clear();
    } else {
      await Badge.set({ count: Math.min(notificationCount, 99) });
    }
  } catch {
    // Plugin pode não estar disponível ou permissão negada
  }
}
