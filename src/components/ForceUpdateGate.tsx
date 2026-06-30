// Atualização obrigatória: bloqueia o app quando a versão instalada é menor que
// a "versão mínima" definida no admin (platform_settings.update_min_version).
// Só age no app nativo (iOS/Android). Web (admin/site) nunca é afetado.
import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, ArrowDownToLine } from "lucide-react";

const PLAY_DEFAULT = "https://play.google.com/store/apps/details?id=com.chamo.app";

// Compara "2.3.1" vs "2.10" numericamente. -1 (a<b), 0 (=), 1 (a>b).
function cmpVersion(a: string, b: string): number {
  const pa = String(a || "0").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b || "0").split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

function asBool(v: unknown, fb: boolean) {
  if (v === true || v === "true") return true;
  if (v === false || v === "false") return false;
  return fb;
}

export default function ForceUpdateGate() {
  const [blocked, setBlocked] = useState(false);
  const [storeUrl, setStoreUrl] = useState(PLAY_DEFAULT);
  const [current, setCurrent] = useState("");
  const [required, setRequired] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Web não é forçado (admin/site usa o navegador).
        if (!Capacitor.isNativePlatform()) return;

        const { App } = await import("@capacitor/app");
        const info = await App.getInfo(); // { version, build }
        const installed = info.version || "0";

        const { data } = await supabase.from("platform_settings").select("key, value").like("key", "update_%");
        const m: Record<string, unknown> = {};
        (data || []).forEach((r: { key: string; value: unknown }) => { m[r.key] = r.value; });

        if (!asBool(m["update_gate_enabled"], false)) return;
        const min = String(m["update_min_version"] ?? "0");
        if (cmpVersion(installed, min) >= 0) return; // versão ok

        const platform = Capacitor.getPlatform();
        const iosUrl = String(m["update_ios_url"] ?? "").trim();
        const androidUrl = String(m["update_android_url"] ?? "").trim() || PLAY_DEFAULT;
        const url = platform === "ios" ? (iosUrl || "https://apps.apple.com/app/chamo") : androidUrl;

        if (!cancelled) {
          setCurrent(installed);
          setRequired(min);
          setStoreUrl(url);
          setBlocked(true);
        }
      } catch {
        // Qualquer erro -> não bloqueia (fail-open).
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const openStore = async () => {
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url: storeUrl });
    } catch {
      try { window.open(storeUrl, "_blank"); } catch { /* */ }
    }
  };

  if (!blocked) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-background flex items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <ArrowDownToLine className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-xl font-bold text-foreground mb-2">Atualize o Chamô</h1>
        <p className="text-sm text-muted-foreground mb-1">
          Saiu uma versão nova e melhor do app. Para continuar, atualize para a versão mais recente.
        </p>
        {current && required && (
          <p className="text-[11px] text-muted-foreground mb-6">Sua versão: {current} · Mínima: {required}</p>
        )}
        <button
          type="button"
          onClick={() => { void openStore(); }}
          className="w-full rounded-xl bg-primary text-primary-foreground font-semibold py-3 inline-flex items-center justify-center gap-2"
        >
          <RefreshCw className="w-4 h-4" /> Atualizar agora
        </button>
      </div>
    </div>
  );
}
