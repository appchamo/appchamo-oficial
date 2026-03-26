import { supabase } from "@/integrations/supabase/client";

export type ThreadActivityKind = "typing" | "recording" | "idle";

type ActivityPayload = { fromUserId?: string; kind?: ThreadActivityKind };

const listenerSets = new Map<string, Set<(p: ActivityPayload) => void>>();
const channels = new Map<string, ReturnType<typeof supabase.channel>>();
const ensurePromises = new Map<string, Promise<void>>();

/** Limita writes de "typing" sem perder o 1.º caractere (WhatsApp-like). */
const lastTypingUpsertAt = new Map<string, number>();
const TYPING_UPSERT_MIN_MS = 320;

function dispatch(threadId: string, payload: ActivityPayload) {
  listenerSets.get(threadId)?.forEach((fn) => {
    try {
      fn(payload);
    } catch {
      /* ignore */
    }
  });
}

function ensurePgListener(threadId: string): Promise<void> {
  if (channels.has(threadId)) return Promise.resolve();
  const pending = ensurePromises.get(threadId);
  if (pending) return pending;

  const p = (async () => {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) return;
      await supabase.realtime.setAuth(token);

      const ch = supabase
        .channel(`chat-activity-pg:${threadId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "chat_thread_activity",
            filter: `request_id=eq.${threadId}`,
          },
          (payload) => {
            const ev = (payload as { eventType?: string }).eventType;
            const row = (payload as { new?: Record<string, unknown> }).new as
              | { user_id?: string; kind?: string }
              | undefined;
            if (!row?.user_id || !row?.kind) return;
            if (ev === "DELETE") return;
            const kind = row.kind as ThreadActivityKind;
            if (kind !== "typing" && kind !== "recording" && kind !== "idle") return;
            dispatch(threadId, { fromUserId: row.user_id, kind });
          },
        )
        .subscribe((status, err) => {
          if (status === "SUBSCRIBED") return;
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn("[chat_thread_activity] realtime:", status, err?.message ?? err);
          }
        });

      channels.set(threadId, ch);
    } finally {
      ensurePromises.delete(threadId);
    }
  })();

  ensurePromises.set(threadId, p);
  return p;
}

/** Vários ecrãs podem subscrever o mesmo pedido; um canal Realtime por request_id. */
export function subscribeThreadActivity(
  threadId: string,
  onPayload: (payload: ActivityPayload) => void,
): () => void {
  if (!listenerSets.has(threadId)) listenerSets.set(threadId, new Set());
  listenerSets.get(threadId)!.add(onPayload);
  void ensurePgListener(threadId);

  return () => {
    const set = listenerSets.get(threadId);
    if (!set) return;
    set.delete(onPayload);
    if (set.size === 0) {
      listenerSets.delete(threadId);
      const ch = channels.get(threadId);
      if (ch) {
        void supabase.removeChannel(ch);
        channels.delete(threadId);
      }
    }
  };
}

export function sendThreadActivity(threadId: string, myUserId: string, kind: ThreadActivityKind) {
  if (kind === "typing") {
    const k = `${threadId}:${myUserId}`;
    const now = Date.now();
    const prev = lastTypingUpsertAt.get(k) ?? 0;
    if (now - prev < TYPING_UPSERT_MIN_MS) return;
    lastTypingUpsertAt.set(k, now);
  } else if (kind === "idle" || kind === "recording") {
    lastTypingUpsertAt.delete(`${threadId}:${myUserId}`);
  }

  void supabase
    .from("chat_thread_activity")
    .upsert(
      {
        request_id: threadId,
        user_id: myUserId,
        kind,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "request_id,user_id" },
    )
    .then(({ error }) => {
      if (error) console.warn("[chat_thread_activity] upsert:", error.message);
    });
}
