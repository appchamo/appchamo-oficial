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
  return { error: error?.message ?? null };
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
    link: "/home?feed=vagas&vtab=meu-perfil",
  } as never);
  return { error: null };
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
