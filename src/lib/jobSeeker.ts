import { supabase } from "@/integrations/supabase/client";

export interface JobSeekerProfile {
  user_id: string;
  is_public: boolean;
  visible_to_all: boolean;
  visible_to_companies: boolean;
  visible_to_pros: boolean;
  headline: string | null;
  objetivo: string | null;
  experiencia: string | null;
  sobre: string | null;
  skills: string[];
  city: string | null;
  state: string | null;
}

export interface CandidateCard extends JobSeekerProfile {
  full_name: string | null;
  avatar_url: string | null;
}

export interface ReceivedProposal {
  id: string;
  from_user: string;
  message: string | null;
  created_at: string;
  from_name: string | null;
  from_avatar: string | null;
}

const TBL = "job_seeker_profiles";

export async function fetchMyResume(userId: string): Promise<JobSeekerProfile | null> {
  const { data } = await supabase.from(TBL as never).select("*").eq("user_id", userId).maybeSingle();
  return (data as JobSeekerProfile | null) ?? null;
}

export async function saveMyResume(
  userId: string,
  patch: Partial<JobSeekerProfile>,
): Promise<{ error: string | null }> {
  const payload = { user_id: userId, ...patch, updated_at: new Date().toISOString() };
  const { error } = await supabase.from(TBL as never).upsert(payload as never, { onConflict: "user_id" } as never);
  if (error) return { error: error.message };
  // Notifica quem segue esta pessoa (alteração / saiu do ar).
  try {
    await notifyResumeFollowers(userId, patch.is_public === false ? "unpublished" : "updated");
  } catch { /* não bloqueia o save */ }
  return { error: null };
}

// ── Favoritos (vaga ou currículo) ──
const FAV = "vagas_favorites";
export async function fetchFavoriteIds(userId: string, kind: "job" | "candidate"): Promise<Set<string>> {
  const { data } = await supabase.from(FAV as never).select("target_id").eq("user_id", userId).eq("kind", kind);
  return new Set(((data as { target_id: string }[]) || []).map((r) => r.target_id));
}
export async function toggleFavorite(userId: string, kind: "job" | "candidate", targetId: string, on: boolean): Promise<void> {
  if (on) {
    await supabase.from(FAV as never).upsert({ user_id: userId, kind, target_id: targetId } as never, { onConflict: "user_id,kind,target_id" } as never);
  } else {
    await supabase.from(FAV as never).delete().eq("user_id", userId).eq("kind", kind).eq("target_id", targetId);
  }
}

// ── Seguir (usuário ↔ usuário) ──
export async function isFollowingUser(followerId: string, followedId: string): Promise<boolean> {
  const { data } = await supabase
    .from("user_follows" as never)
    .select("follower_user_id")
    .eq("follower_user_id", followerId)
    .eq("followed_user_id", followedId)
    .maybeSingle();
  return !!data;
}
export async function setFollowUser(followerId: string, followedId: string, on: boolean): Promise<{ error: string | null }> {
  if (on) {
    const { error } = await supabase
      .from("user_follows" as never)
      .insert({ follower_user_id: followerId, followed_user_id: followedId } as never);
    // ignora violação de unicidade (já segue)
    if (error && !/duplicate|unique/i.test(error.message)) return { error: error.message };
    return { error: null };
  }
  const { error } = await supabase
    .from("user_follows" as never)
    .delete()
    .eq("follower_user_id", followerId)
    .eq("followed_user_id", followedId);
  return { error: error?.message ?? null };
}

// Avisa os seguidores quando o currículo muda ou sai do ar.
export async function notifyResumeFollowers(ownerId: string, kind: "updated" | "unpublished"): Promise<void> {
  const { data: followers } = await supabase
    .from("user_follows" as never)
    .select("follower_user_id")
    .eq("followed_user_id", ownerId);
  const ids = ((followers as { follower_user_id: string }[]) || []).map((f) => f.follower_user_id);
  if (!ids.length) return;
  const { data: me } = await supabase.from("profiles_public" as never).select("full_name").eq("user_id", ownerId).maybeSingle();
  const name = (me as { full_name?: string | null } | null)?.full_name?.trim() || "Um perfil que você segue";
  const msg = kind === "unpublished" ? `${name} tirou o currículo do ar.` : `${name} atualizou o currículo.`;
  const rows = ids.map((uid) => ({ user_id: uid, title: "Atualização de currículo", message: msg, type: "info", link: `/curriculos/${ownerId}` }));
  await supabase.from("notifications").insert(rows as never);
}

export async function fetchCandidates(search: string): Promise<CandidateCard[]> {
  const { data: rows } = await supabase
    .from(TBL as never)
    .select("*")
    .eq("is_public", true)
    .order("updated_at", { ascending: false })
    .limit(200);
  const list = (rows as JobSeekerProfile[]) || [];
  if (!list.length) return [];
  const userIds = list.map((r) => r.user_id);
  const { data: profs } = await supabase
    .from("profiles_public" as never)
    .select("user_id, full_name, avatar_url")
    .in("user_id", userIds);
  const byId = new Map((profs as { user_id: string; full_name: string | null; avatar_url: string | null }[] || []).map((p) => [p.user_id, p]));
  let cards: CandidateCard[] = list.map((r) => ({
    ...r,
    full_name: byId.get(r.user_id)?.full_name ?? null,
    avatar_url: byId.get(r.user_id)?.avatar_url ?? null,
  }));
  const t = search.trim().toLowerCase();
  if (t) {
    cards = cards.filter(
      (c) =>
        (c.full_name || "").toLowerCase().includes(t) ||
        (c.objetivo || "").toLowerCase().includes(t) ||
        (c.headline || "").toLowerCase().includes(t) ||
        (c.city || "").toLowerCase().includes(t) ||
        (c.skills || []).some((s) => s.toLowerCase().includes(t)),
    );
  }
  return cards;
}

export async function fetchCandidate(userId: string): Promise<CandidateCard | null> {
  const { data } = await supabase.from(TBL as never).select("*").eq("user_id", userId).maybeSingle();
  if (!data) return null;
  const { data: prof } = await supabase
    .from("profiles_public" as never)
    .select("full_name, avatar_url")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    ...(data as JobSeekerProfile),
    full_name: (prof as { full_name?: string | null } | null)?.full_name ?? null,
    avatar_url: (prof as { avatar_url?: string | null } | null)?.avatar_url ?? null,
  };
}

export async function sendProposal(
  fromUserId: string,
  toUserId: string,
  message: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("job_proposals" as never)
    .insert({ from_user: fromUserId, to_user: toUserId, message: message.trim() || null } as never);
  if (error) return { error: error.message };
  // Notifica a pessoa (dispara push via trigger na tabela notifications).
  const { data: me } = await supabase
    .from("profiles_public" as never)
    .select("full_name")
    .eq("user_id", fromUserId)
    .maybeSingle();
  const fromName = (me as { full_name?: string | null } | null)?.full_name?.trim() || "Alguém";
  await supabase.from("notifications").insert({
    user_id: toUserId,
    title: "💼 Alguém quer falar com você",
    message: `${fromName}: ${message.trim() || "Tenho uma oportunidade que pode te interessar."}`,
    type: "info",
    link: "/meu-curriculo",
  } as never);
  return { error: null };
}

// Abre (ou reaproveita) uma conversa DIRETA no Chat com outra pessoa e envia a 1ª mensagem.
export async function startDirectChat(
  fromUserId: string,
  toUserId: string,
  firstMessage: string,
): Promise<{ threadId: string | null; error: string | null }> {
  // Dedup: reaproveita SÓ uma conversa direta ATIVA entre os dois.
  // Se a anterior foi cancelada/encerrada, abre uma nova (a cancelada fica fechada).
  const { data: existing } = await supabase
    .from("service_requests" as never)
    .select("id")
    .eq("request_kind", "direct")
    .in("status", ["pending", "accepted"])
    .or(`and(client_id.eq.${fromUserId},peer_user_id.eq.${toUserId}),and(client_id.eq.${toUserId},peer_user_id.eq.${fromUserId})`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let threadId = (existing as { id?: string } | null)?.id;
  if (!threadId) {
    const { data: req, error } = await supabase
      .from("service_requests" as never)
      .insert({ client_id: fromUserId, peer_user_id: toUserId, request_kind: "direct", status: "accepted", description: firstMessage.trim() || "Olá!" } as never)
      .select("id")
      .single();
    if (error || !req) return { threadId: null, error: error?.message ?? "Não foi possível abrir a conversa." };
    threadId = (req as { id: string }).id;
  }
  if (firstMessage.trim()) {
    await supabase.from("chat_messages").insert({ request_id: threadId, sender_id: fromUserId, content: firstMessage.trim() } as never);
  }
  const { data: me } = await supabase.from("profiles_public" as never).select("full_name").eq("user_id", fromUserId).maybeSingle();
  const fromName = (me as { full_name?: string | null } | null)?.full_name?.trim() || "Alguém";
  await supabase.from("notifications").insert({
    user_id: toUserId,
    title: "💬 Nova mensagem",
    message: `${fromName} quer falar com você.`,
    type: "info",
    link: `/messages/${threadId}`,
  } as never);
  return { threadId, error: null };
}

export async function fetchReceivedProposals(userId: string): Promise<ReceivedProposal[]> {
  const { data } = await supabase
    .from("job_proposals" as never)
    .select("id, from_user, message, created_at")
    .eq("to_user", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  const list = (data as { id: string; from_user: string; message: string | null; created_at: string }[]) || [];
  if (!list.length) return [];
  const ids = [...new Set(list.map((p) => p.from_user))];
  const { data: profs } = await supabase
    .from("profiles_public" as never)
    .select("user_id, full_name, avatar_url")
    .in("user_id", ids);
  const byId = new Map((profs as { user_id: string; full_name: string | null; avatar_url: string | null }[] || []).map((p) => [p.user_id, p]));
  return list.map((p) => ({
    ...p,
    from_name: byId.get(p.from_user)?.full_name ?? null,
    from_avatar: byId.get(p.from_user)?.avatar_url ?? null,
  }));
}
