import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

const DEVICE_KEY = "chamo_device_id";

/**
 * Garante uma linha em `user_devices` no app nativo (Android/iOS), mesmo que o utilizador
 * não tenha concedido notificações — o relatório admin passa a mostrar iPhone/Android.
 * Quando o push corre depois, o mesmo `device_id` atualiza `push_token` sem perder o registo.
 */
export async function registerNativeDevicePresence(userId: string): Promise<void> {
  if (!Capacitor.isNativePlatform() || !userId) return;

  let deviceId: string;
  try {
    deviceId = localStorage.getItem(DEVICE_KEY) || "";
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, deviceId);
    }
  } catch {
    return;
  }

  const platform = Capacitor.getPlatform();
  const deviceName = platform === "ios" ? "iPhone App" : platform === "android" ? "Android App" : "App";
  const last_active = new Date().toISOString();

  // `user_devices` pode não estar no types gerados do Supabase
  const db = supabase as unknown as {
    from: (t: string) => ReturnType<typeof supabase.from>;
  };

  const { data: existing, error: selErr } = await db
    .from("user_devices")
    .select("id")
    .eq("user_id", userId)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (selErr) {
    console.warn("[registerNativeDevicePresence] select:", selErr);
    return;
  }

  const row = existing as { id?: string } | null;
  if (row?.id) {
    const { error: upErr } = await db
      .from("user_devices")
      .update({ device_name: deviceName, last_active })
      .eq("user_id", userId)
      .eq("device_id", deviceId);
    if (upErr) console.warn("[registerNativeDevicePresence] update:", upErr);
    return;
  }

  const { error: insErr } = await db.from("user_devices").insert({
    user_id: userId,
    device_id: deviceId,
    device_name: deviceName,
    last_active,
  });

  if (insErr && (insErr as { code?: string }).code === "23505") {
    const { error: upErr2 } = await db
      .from("user_devices")
      .update({ device_name: deviceName, last_active })
      .eq("user_id", userId)
      .eq("device_id", deviceId);
    if (upErr2) console.warn("[registerNativeDevicePresence] update after conflict:", upErr2);
    return;
  }

  if (insErr) console.warn("[registerNativeDevicePresence] insert:", insErr);
}
