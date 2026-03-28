import type { SupabaseClient } from "@supabase/supabase-js";

export type FriendRelationshipState =
  | { status: "self" }
  | { status: "friends" }
  | { status: "none" }
  | { status: "outgoing_pending"; requestId: string }
  | { status: "incoming_pending"; requestId: string };

/** Lista de `user_id` com amizade aceite. */
export async function fetchAcceptedFriendUserIds(
  client: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data: rows, error: e2 } = await client
    .from("user_friendships")
    .select("user_a, user_b")
    .or(`user_a.eq.${userId},user_b.eq.${userId}`);
  if (e2 || !rows?.length) return [];
  const out: string[] = [];
  for (const r of rows as { user_a: string; user_b: string }[]) {
    out.push(r.user_a === userId ? r.user_b : r.user_a);
  }
  return [...new Set(out)];
}

export async function areFriends(client: SupabaseClient, a: string, b: string): Promise<boolean> {
  if (!a || !b || a === b) return false;
  const x = a < b ? a : b;
  const y = a < b ? b : a;
  const { data } = await client.from("user_friendships").select("user_a").eq("user_a", x).eq("user_b", y).maybeSingle();
  return !!data;
}

export async function getFriendRelationshipState(
  client: SupabaseClient,
  me: string,
  other: string,
): Promise<FriendRelationshipState> {
  if (!me || !other) return { status: "none" };
  if (me === other) return { status: "self" };
  if (await areFriends(client, me, other)) return { status: "friends" };

  const { data: out } = await client
    .from("friend_requests")
    .select("id")
    .eq("from_user_id", me)
    .eq("to_user_id", other)
    .maybeSingle();
  if (out?.id) return { status: "outgoing_pending", requestId: out.id };

  const { data: inc } = await client
    .from("friend_requests")
    .select("id")
    .eq("from_user_id", other)
    .eq("to_user_id", me)
    .maybeSingle();
  if (inc?.id) return { status: "incoming_pending", requestId: inc.id };

  return { status: "none" };
}

export type IncomingFriendRequestRow = {
  id: string;
  from_user_id: string;
  created_at: string;
};

export async function fetchIncomingFriendRequests(
  client: SupabaseClient,
  userId: string,
): Promise<IncomingFriendRequestRow[]> {
  const { data, error } = await client
    .from("friend_requests")
    .select("id, from_user_id, created_at")
    .eq("to_user_id", userId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data as IncomingFriendRequestRow[];
}

export async function sendFriendRequest(client: SupabaseClient, toUserId: string): Promise<string> {
  const { data, error } = await client.rpc("send_friend_request" as any, { p_to_user_id: toUserId });
  if (error) throw error;
  return typeof data === "string" ? data : String(data ?? "");
}

export async function acceptFriendRequest(client: SupabaseClient, requestId: string): Promise<void> {
  const { error } = await client.rpc("accept_friend_request" as any, { p_request_id: requestId });
  if (error) throw error;
}

export async function declineOrCancelFriendRequest(client: SupabaseClient, requestId: string): Promise<void> {
  const { error } = await client.rpc("decline_or_cancel_friend_request" as any, { p_request_id: requestId });
  if (error) throw error;
}
