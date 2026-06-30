// ID do aparelho (persistente no localStorage). Mesma chave usada por
// registerNativeDevicePresence, para o bloqueio por aparelho ser consistente.
const DEVICE_KEY = "chamo_device_id";

export function getOrCreateDeviceId(): string | null {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = (crypto?.randomUUID?.() ?? `dev_${Date.now()}_${Math.random().toString(36).slice(2)}`);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}
