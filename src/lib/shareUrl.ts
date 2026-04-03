import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";

export type ShareUrlOptions = {
  title: string;
  url: string;
};

export type ShareUrlResult = "shared" | "copied" | "cancelled" | "failed";

/**
 * Partilha um URL com folha nativa no app (Capacitor) ou Web Share API no browser.
 * No Android WebView, `navigator.share` costuma falhar — `@capacitor/share` abre o sistema.
 */
export async function shareUrl(opts: ShareUrlOptions): Promise<ShareUrlResult> {
  const { title, url } = opts;

  if (Capacitor.isNativePlatform()) {
    try {
      await Share.share({
        title,
        url,
        dialogTitle: "Compartilhar",
      });
      return "shared";
    } catch (e: unknown) {
      const err = e as { message?: string };
      const m = (err?.message || "").toLowerCase();
      if (
        m.includes("cancel") ||
        m.includes("canceled") ||
        m.includes("cancelled") ||
        m.includes("dismiss") ||
        m.includes("user did not share")
      ) {
        return "cancelled";
      }
      /* continua para Web Share / cópia */
    }
  }

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, url });
      return "shared";
    } catch (e: unknown) {
      if ((e as Error)?.name === "AbortError") return "cancelled";
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
