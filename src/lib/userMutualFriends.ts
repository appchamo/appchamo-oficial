import type { SupabaseClient } from "@supabase/supabase-js";

function mutualUserIdsFromGraph(
  outgoing: { followed_user_id: string }[] | null,
  incoming: { follower_user_id: string }[] | null,
): string[] {
  const whoFollowsMe = new Set((incoming ?? []).map((r) => r.follower_user_id));
  const out = new Set<string>();
  for (const r of outgoing ?? []) {
    const uid = r.followed_user_id;
    if (uid && whoFollowsMe.has(uid)) out.add(uid);
  }
  return [...out];
}

/** Mútuo via professional_follows (comportamento legado). */
async function mutualUserIdsViaProfessionalFollows(client: SupabaseClient, userId: string): Promise<string[]> {
  const { data: myPro } = await client.from("professionals").select("id").eq("user_id", userId).maybeSingle();
  const myPid = (myPro as { id?: string } | null)?.id;
  if (!myPid) return [];

  const [{ data: myRows }, { data: revRows }] = await Promise.all([
    client.from("professional_follows").select("professional_id").eq("user_id", userId),
    client.from("professional_follows").select("user_id").eq("professional_id", myPid),
  ]);

  const whoFollowsMe = new Set((revRows ?? []).map((r: { user_id: string }) => r.user_id));
  const pids = [...new Set((myRows ?? []).map((r: { professional_id: string }) => r.professional_id))];
  if (!pids.length) return [];

  const { data: pros } = await client.from("professionals").select("id, user_id").in("id", pids);
  const uidByPid = new Map((pros ?? []).map((p: { id: string; user_id: string }) => [p.id, p.user_id]));

  const mutual = new Set<string>();
  for (const r of myRows ?? []) {
    const uid = uidByPid.get(r.professional_id);
    if (uid && uid !== userId && whoFollowsMe.has(uid)) mutual.add(uid);
  }
  return [...mutual];
}

/**
 * Utilizadores com seguimento mútuo: união de `user_follows` (grafo user→user) e do legado
 * `professional_follows`, para funcionar mesmo sem RPCs / com backfill incompleto.
 */
export async function getMutualFriendUserIds(client: SupabaseClient, userId: string): Promise<string[]> {
  const [outRes, incRes] = await Promise.all([
    client.from("user_follows").select("followed_user_id").eq("follower_user_id", userId),
    client.from("user_follows").select("follower_user_id").eq("followed_user_id", userId),
  ]);

  let fromUserFollows: string[] = [];
  if (!outRes.error && !incRes.error) {
    fromUserFollows = mutualUserIdsFromGraph(
      outRes.data as { followed_user_id: string }[] | null,
      incRes.data as { follower_user_id: string }[] | null,
    );
  }

  const fromPro = await mutualUserIdsViaProfessionalFollows(client, userId);
  return [...new Set([...fromUserFollows, ...fromPro])];
}

export type MutualFriendRow = {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  pro_key: string | null;
};

export async function enrichMutualFriends(
  client: SupabaseClient,
  userIds: string[],
): Promise<MutualFriendRow[]> {
  if (!userIds.length) return [];

  const { data: proRows } = await client.from("professionals").select("user_id, id, slug").in("user_id", userIds);
  const proKeyByUser = new Map<string, string>();
  for (const p of proRows ?? []) {
    const row = p as { user_id: string; id: string; slug: string | null };
    const slug = row.slug != null ? String(row.slug).trim() : "";
    proKeyByUser.set(row.user_id, slug || row.id);
  }

  const { data: profiles } = await client
    .from("profiles")
    .select("user_id, display_name, full_name, avatar_url")
    .in("user_id", userIds);

  const pmap = new Map(
    (profiles ?? []).map((p) => {
      const row = p as {
        user_id: string;
        display_name: string | null;
        full_name: string | null;
        avatar_url: string | null;
      };
      return [row.user_id, row] as const;
    }),
  );

  return userIds.map((uid) => {
    const p = pmap.get(uid);
    const dn = (p?.display_name ?? "").trim();
    const fn = (p?.full_name ?? "").trim();
    return {
      user_id: uid,
      full_name: dn || fn || "Usuário",
      avatar_url: p?.avatar_url ?? null,
      pro_key: proKeyByUser.get(uid) ?? null,
    };
  });
}

/** Mútuo no grafo user→user ou no par de perfis profissionais (legado). */
export async function usersAreMutualFriends(
  client: SupabaseClient,
  me: string,
  other: string,
): Promise<boolean> {
  if (!me || !other || me === other) return false;

  const [{ data: uf1, error: e1 }, { data: uf2, error: e2 }] = await Promise.all([
    client.from("user_follows").select("follower_user_id").eq("follower_user_id", me).eq("followed_user_id", other).maybeSingle(),
    client.from("user_follows").select("follower_user_id").eq("follower_user_id", other).eq("followed_user_id", me).maybeSingle(),
  ]);
  if (!e1 && !e2 && uf1 && uf2) return true;

  const [{ data: myPro }, { data: theirPro }] = await Promise.all([
    client.from("professionals").select("id").eq("user_id", me).maybeSingle(),
    client.from("professionals").select("id").eq("user_id", other).maybeSingle(),
  ]);
  const myPid = (myPro as { id?: string } | null)?.id;
  const theirPid = (theirPro as { id?: string } | null)?.id;
  if (!myPid || !theirPid) return false;

  const [{ data: p1 }, { data: p2 }] = await Promise.all([
    client.from("professional_follows").select("id").eq("user_id", me).eq("professional_id", theirPid).maybeSingle(),
    client.from("professional_follows").select("id").eq("user_id", other).eq("professional_id", myPid).maybeSingle(),
  ]);
  return !!(p1 && p2);
}
