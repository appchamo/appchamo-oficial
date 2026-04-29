import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef, useState } from "react";

/**
 * Canal global usado para Realtime Presence (quem está conectado AGORA).
 * Não persiste nada na BD — apenas estado em memória dentro do Realtime.
 */
const PRESENCE_CHANNEL = "presence:online-users";

/** Log de diagnóstico controlado por localStorage.debug_presence = "1". */
function dlog(...args: unknown[]) {
  try {
    if (typeof window !== "undefined" && window.localStorage?.getItem("debug_presence") === "1") {
      console.info("[presence]", ...args);
    }
  } catch {
    /* noop */
  }
}

let rpcMissingWarned = false;

/** Heartbeat: chama o RPC touch_last_seen no Postgres. */
async function callTouchLastSeen(): Promise<void> {
  const { error } = await (supabase as any).rpc("touch_last_seen");
  if (error) {
    // 42883 = function does not exist; PGRST202 = schema cache miss. Sinal de migration não aplicada.
    const code = (error as { code?: string }).code;
    const msg = String((error as { message?: string }).message || "");
    const missing = code === "42883" || code === "PGRST202" || /touch_last_seen/.test(msg);
    if (missing && !rpcMissingWarned) {
      rpcMissingWarned = true;
      console.warn(
        "[presence] A função touch_last_seen() não existe no Supabase. " +
          "Aplique a migration 20260512000000_profiles_last_seen_presence.sql " +
          "(ver supabase/migrations/). Enquanto isso, last_seen_at ficará NULL.",
      );
    } else if (!missing) {
      console.warn("[presence] touch_last_seen falhou:", error);
    }
    return;
  }
  dlog("heartbeat ok");
}

/**
 * Hook a usar **uma única vez** numa raiz da app (App.tsx) por sessão autenticada.
 * Faz duas coisas:
 *  1) Heartbeat → RPC `touch_last_seen` (no login + a cada 60s enquanto visível + ao reativar a aba)
 *  2) Realtime Presence → entra no canal global `presence:online-users` com `track({ user_id })`,
 *     o que permite ao admin ver quem está conectado ao vivo (sem polling).
 */
export function usePresenceTracker(userId: string | null | undefined): void {
  useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    dlog("tracker start", { userId });
    void callTouchLastSeen();

    const channel = supabase.channel(PRESENCE_CHANNEL, {
      config: { presence: { key: userId } },
    });

    channel.subscribe(async (status, err) => {
      if (cancelled) return;
      dlog("tracker subscribe status", status, err || "");
      if (status === "SUBSCRIBED") {
        try {
          const res = await channel.track({ user_id: userId, online_at: new Date().toISOString() });
          dlog("tracker track() =>", res);
        } catch (e) {
          console.warn("[presence] track falhou:", e);
        }
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("[presence] canal realtime falhou:", status, err || "");
      }
    });

    const tick = () => {
      if (document.visibilityState === "visible") {
        void callTouchLastSeen();
      }
    };

    interval = setInterval(tick, 60_000);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void callTouchLastSeen();
        void channel.track({ user_id: userId, online_at: new Date().toISOString() }).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onUnload = () => {
      try {
        void channel.untrack();
      } catch {
        /* noop */
      }
    };
    window.addEventListener("pagehide", onUnload);
    window.addEventListener("beforeunload", onUnload);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onUnload);
      window.removeEventListener("beforeunload", onUnload);
      try {
        void channel.untrack();
      } catch {
        /* noop */
      }
      void supabase.removeChannel(channel);
      dlog("tracker cleanup", { userId });
    };
  }, [userId]);
}

/**
 * Para o painel admin: subscreve ao canal de presença e devolve o conjunto
 * de `user_id` que estão online AGORA. Atualiza em tempo real (sync/join/leave).
 *
 * Importante: o admin deve estar autenticado para o canal aceitar a subscrição.
 */
export function useOnlineUsers(): { onlineIds: Set<string>; ready: boolean } {
  const [onlineIds, setOnlineIds] = useState<Set<string>>(() => new Set());
  const [ready, setReady] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    const observerKey = "admin-observer-" + Math.random().toString(36).slice(2, 8);
    const channel = supabase.channel(PRESENCE_CHANNEL, {
      config: { presence: { key: observerKey } },
    });
    channelRef.current = channel;

    const recompute = () => {
      const state = channel.presenceState() as Record<string, Array<{ user_id?: string }>>;
      const ids = new Set<string>();
      for (const key of Object.keys(state)) {
        const arr = state[key] || [];
        for (const meta of arr) {
          if (meta?.user_id) ids.add(meta.user_id);
        }
        if (key && !key.startsWith("admin-observer-")) {
          ids.add(key);
        }
      }
      dlog("observer recompute", { onlineCount: ids.size, keys: Object.keys(state) });
      setOnlineIds(ids);
    };

    channel
      .on("presence", { event: "sync" }, recompute)
      .on("presence", { event: "join" }, (payload) => {
        dlog("observer join", payload);
        recompute();
      })
      .on("presence", { event: "leave" }, (payload) => {
        dlog("observer leave", payload);
        recompute();
      })
      .subscribe((status, err) => {
        dlog("observer subscribe status", status, err || "");
        if (status === "SUBSCRIBED") {
          setReady(true);
          recompute();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[presence] observer canal realtime falhou:", status, err || "");
        }
      });

    return () => {
      try {
        void channel.untrack();
      } catch {
        /* noop */
      }
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, []);

  return { onlineIds, ready };
}

/** Devolve "agora", "há 2 min", "há 3 horas", "há 5 dias", "há 2 meses" ou null. */
export function formatRelativeFromNow(dateIso: string | null | undefined): string | null {
  if (!dateIso) return null;
  const t = new Date(dateIso).getTime();
  if (Number.isNaN(t)) return null;
  const diff = Math.max(0, Date.now() - t);
  const sec = Math.floor(diff / 1000);
  if (sec < 30) return "agora mesmo";
  const min = Math.floor(sec / 60);
  if (min < 60) return min <= 1 ? "há 1 min" : `há ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr === 1 ? "há 1 hora" : `há ${hr} horas`;
  const day = Math.floor(hr / 24);
  if (day < 30) return day === 1 ? "há 1 dia" : `há ${day} dias`;
  const mon = Math.floor(day / 30);
  if (mon < 12) return mon === 1 ? "há 1 mês" : `há ${mon} meses`;
  const yr = Math.floor(mon / 12);
  return yr === 1 ? "há 1 ano" : `há ${yr} anos`;
}
