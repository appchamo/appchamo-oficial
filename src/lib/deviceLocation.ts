// Localização real do aparelho (GPS). No app nativo usa @capacitor/geolocation;
// no navegador (web/admin) cai para navigator.geolocation. Trata negado/indisponível/timeout.
import { Capacitor } from "@capacitor/core";

export type LocResult =
  | { ok: true; lat: number; lng: number; accuracy?: number | null }
  | { ok: false; error: "denied" | "unavailable" | "timeout" };

const DEFAULT_TIMEOUT = 12000;

export async function getDeviceLocation(timeoutMs = DEFAULT_TIMEOUT): Promise<LocResult> {
  // ---- Nativo (iOS/Android) via plugin ----
  if (Capacitor.isNativePlatform()) {
    try {
      const { Geolocation } = await import("@capacitor/geolocation");
      let perm = await Geolocation.checkPermissions();
      if (perm.location !== "granted" && perm.coarseLocation !== "granted") {
        perm = await Geolocation.requestPermissions({ permissions: ["location", "coarseLocation"] });
      }
      if (perm.location !== "granted" && perm.coarseLocation !== "granted") {
        return { ok: false, error: "denied" };
      }
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 });
      return { ok: true, lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null };
    } catch (e) {
      const msg = String((e as Error)?.message || e).toLowerCase();
      if (msg.includes("denied") || msg.includes("permission")) return { ok: false, error: "denied" };
      if (msg.includes("timeout")) return { ok: false, error: "timeout" };
      return { ok: false, error: "unavailable" };
    }
  }

  // ---- Web (navegador) ----
  if (typeof navigator !== "undefined" && navigator.geolocation) {
    return new Promise<LocResult>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ ok: true, lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null }),
        (err) => {
          if (err.code === err.PERMISSION_DENIED) resolve({ ok: false, error: "denied" });
          else if (err.code === err.TIMEOUT) resolve({ ok: false, error: "timeout" });
          else resolve({ ok: false, error: "unavailable" });
        },
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 },
      );
    });
  }

  return { ok: false, error: "unavailable" };
}
