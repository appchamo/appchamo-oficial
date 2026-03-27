import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Heart,
  PartyPopper,
  Lightbulb,
  ThumbsUp,
  MessageCircle,
  Share2,
  ImagePlus,
  Loader2,
  Send,
  Trash2,
  X,
  Link2,
  MessageSquare,
  Upload,
  Search,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { getCommunityPostShareUrl } from "@/lib/publicAppUrl";

export type CommunityFeedVariant = "embedded" | "standalone";

type ReactionType = "like" | "love" | "congrats" | "genius";

const REACTIONS: { type: ReactionType; label: string; Icon: typeof ThumbsUp }[] = [
  { type: "like", label: "Curtir", Icon: ThumbsUp },
  { type: "love", label: "Amei", Icon: Heart },
  { type: "congrats", label: "Parabéns", Icon: PartyPopper },
  { type: "genius", label: "Genial", Icon: Lightbulb },
];

interface PostRow {
  id: string;
  author_id: string;
  body: string;
  image_url: string | null;
  created_at: string;
}

interface AuthorRow {
  user_id: string;
  display_name: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

interface ReactionRow {
  post_id: string;
  user_id: string;
  reaction_type: ReactionType;
}

interface CommentRow {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
}

function authorLabel(a: AuthorRow | undefined) {
  if (!a) return "Usuário";
  return (a.display_name || a.full_name || "Usuário").trim();
}

function postTimeLabel(iso: string) {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });
  } catch {
    return "";
  }
}

const BODY_COLLAPSE_LEN = 320;

export default function CommunityFeed({
  variant,
  highlightPostId,
}: {
  variant: CommunityFeedVariant;
  /** Destaca e abre comentários deste post (ex.: deep link da notificação). */
  highlightPostId?: string | null;
}) {
  const embedded = variant === "embedded";
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [authors, setAuthors] = useState<Record<string, AuthorRow>>({});
  const [reactions, setReactions] = useState<ReactionRow[]>([]);
  const [commentsByPost, setCommentsByPost] = useState<Record<string, CommentRow[]>>({});
  const [commentAuthors, setCommentAuthors] = useState<Record<string, AuthorRow>>({});

  const [composerText, setComposerText] = useState("");
  const [composerFile, setComposerFile] = useState<File | null>(null);
  const [composerPreview, setComposerPreview] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [expandedBodies, setExpandedBodies] = useState<Record<string, boolean>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentSubmitting, setCommentSubmitting] = useState<string | null>(null);

  const [sharePost, setSharePost] = useState<PostRow | null>(null);
  const [shareQuery, setShareQuery] = useState("");
  const [shareResults, setShareResults] = useState<AuthorRow[]>([]);
  const [shareSearching, setShareSearching] = useState(false);
  const [shareSending, setShareSending] = useState(false);
  const [proPathByUserId, setProPathByUserId] = useState<Record<string, string>>({});
  const [followedForShare, setFollowedForShare] = useState<AuthorRow[]>([]);
  const [loadingFollowedShare, setLoadingFollowedShare] = useState(false);
  const [feedScope, setFeedScope] = useState<"all" | "following">("all");
  const [followingAuthorIds, setFollowingAuthorIds] = useState<Set<string>>(() => new Set());

  const communityLink = "/home?feed=comunidade";

  const canPost =
    profile?.user_type === "professional" || profile?.user_type === "company";

  const loadFeed = useCallback(async () => {
    if (!user) {
      setFollowingAuthorIds(new Set());
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: myFollows } = await supabase
        .from("professional_follows" as any)
        .select("professional_id")
        .eq("user_id", user.id);
      const followedProIds = [...new Set((myFollows || []).map((r: any) => r.professional_id as string))];
      if (followedProIds.length) {
        const { data: proUs } = await supabase.from("professionals").select("user_id").in("id", followedProIds);
        setFollowingAuthorIds(new Set((proUs || []).map((r: any) => r.user_id as string)));
      } else {
        setFollowingAuthorIds(new Set());
      }

      const { data: postRows, error: pe } = await supabase
        .from("community_posts" as any)
        .select("id, author_id, body, image_url, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (pe) throw pe;
      const plist = (postRows || []) as PostRow[];
      setPosts(plist);
      if (!plist.length) {
        setAuthors({});
        setReactions([]);
        setCommentsByPost({});
        setCommentAuthors({});
        setProPathByUserId({});
        return;
      }
      const authorIds = [...new Set(plist.map((p) => p.author_id))];
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, display_name, full_name, avatar_url")
        .in("user_id", authorIds);
      const amap: Record<string, AuthorRow> = {};
      (profs || []).forEach((p: any) => {
        amap[p.user_id] = p as AuthorRow;
      });
      setAuthors(amap);

      const pids = plist.map((p) => p.id);
      const { data: rx } = await supabase
        .from("community_post_reactions" as any)
        .select("post_id, user_id, reaction_type")
        .in("post_id", pids);
      setReactions((rx || []) as ReactionRow[]);

      const { data: cmts } = await supabase
        .from("community_post_comments" as any)
        .select("id, post_id, user_id, body, created_at")
        .in("post_id", pids)
        .order("created_at", { ascending: true });
      const cList = (cmts || []) as CommentRow[];
      const byPost: Record<string, CommentRow[]> = {};
      cList.forEach((c) => {
        if (!byPost[c.post_id]) byPost[c.post_id] = [];
        byPost[c.post_id].push(c);
      });
      setCommentsByPost(byPost);
      const cAuthorIds = [...new Set(cList.map((c) => c.user_id))];
      const needProfiles = cAuthorIds.filter((id) => !amap[id]);
      if (needProfiles.length) {
        const { data: cprofs } = await supabase
          .from("profiles")
          .select("user_id, display_name, full_name, avatar_url")
          .in("user_id", needProfiles);
        const cmap: Record<string, AuthorRow> = {};
        (cprofs || []).forEach((p: any) => {
          cmap[p.user_id] = p as AuthorRow;
        });
        setCommentAuthors(cmap);
      } else {
        setCommentAuthors({});
      }

      const allUids = [...new Set([...authorIds, ...cAuthorIds])];
      if (allUids.length) {
        const { data: proRows } = await supabase
          .from("professionals")
          .select("user_id, id, slug")
          .in("user_id", allUids);
        const paths: Record<string, string> = {};
        (proRows || []).forEach((row: any) => {
          const key = String(row.slug || row.id || "").trim();
          if (key) paths[row.user_id] = `/professional/${encodeURIComponent(key)}`;
        });
        setProPathByUserId(paths);
      } else {
        setProPathByUserId({});
      }
    } catch (e: any) {
      console.error(e);
      toast({
        title: "Erro ao carregar Comunidade",
        description: e.message || "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  useEffect(() => {
    if (!composerFile) {
      setComposerPreview(null);
      return;
    }
    const url = URL.createObjectURL(composerFile);
    setComposerPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [composerFile]);

  const displayPosts = useMemo(() => {
    if (feedScope === "all") return posts;
    return posts.filter((p) => followingAuthorIds.has(p.author_id));
  }, [posts, feedScope, followingAuthorIds]);

  const reactionSummary = useMemo(() => {
    const m: Record<string, Partial<Record<ReactionType, number>>> = {};
    reactions.forEach((r) => {
      if (!m[r.post_id]) m[r.post_id] = {};
      const row = m[r.post_id]!;
      row[r.reaction_type] = (row[r.reaction_type] || 0) + 1;
    });
    return m;
  }, [reactions]);

  const myReactionByPost = useMemo(() => {
    if (!user) return {};
    const m: Record<string, ReactionType> = {};
    reactions.forEach((r) => {
      if (r.user_id === user.id) m[r.post_id] = r.reaction_type;
    });
    return m;
  }, [reactions, user]);

  const publishPost = async () => {
    if (!user || !canPost) return;
    const text = composerText.trim();
    if (!text && !composerFile) {
      toast({ title: "Escreva algo ou adicione uma foto", variant: "destructive" });
      return;
    }
    setPublishing(true);
    try {
      let imageUrl: string | null = null;
      if (composerFile) {
        const ext = composerFile.name.split(".").pop() || "jpg";
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("community-feed")
          .upload(path, composerFile, { upsert: false, contentType: composerFile.type });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("community-feed").getPublicUrl(path);
        imageUrl = pub.publicUrl;
      }
      const { error: insErr } = await supabase.from("community_posts" as any).insert({
        author_id: user.id,
        body: text,
        image_url: imageUrl,
      });
      if (insErr) throw insErr;
      setComposerText("");
      setComposerFile(null);
      toast({ title: "Publicado na Comunidade" });
      await loadFeed();
    } catch (e: any) {
      toast({ title: "Erro ao publicar", description: e.message, variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  };

  const setReaction = async (postId: string, type: ReactionType) => {
    if (!user) return;
    const current = myReactionByPost[postId];
    try {
      if (current === type) {
        const { error } = await supabase
          .from("community_post_reactions" as any)
          .delete()
          .eq("post_id", postId)
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("community_post_reactions" as any).upsert(
          { post_id: postId, user_id: user.id, reaction_type: type },
          { onConflict: "post_id,user_id" },
        );
        if (error) throw error;
      }
      await loadFeed();
    } catch (e: any) {
      toast({ title: "Erro na reação", description: e.message, variant: "destructive" });
    }
  };

  const submitComment = async (postId: string) => {
    if (!user) return;
    const body = (commentDrafts[postId] || "").trim();
    if (!body) return;
    setCommentSubmitting(postId);
    try {
      const { error } = await supabase.from("community_post_comments" as any).insert({
        post_id: postId,
        user_id: user.id,
        body,
      });
      if (error) throw error;
      setCommentDrafts((d) => ({ ...d, [postId]: "" }));
      await loadFeed();
    } catch (e: any) {
      toast({ title: "Erro ao comentar", description: e.message, variant: "destructive" });
    } finally {
      setCommentSubmitting(null);
    }
  };

  const deleteComment = async (commentId: string) => {
    try {
      const { error } = await supabase.from("community_post_comments" as any).delete().eq("id", commentId);
      if (error) throw error;
      await loadFeed();
    } catch (e: any) {
      toast({ title: "Erro ao apagar", description: e.message, variant: "destructive" });
    }
  };

  const searchShareUsers = useCallback(
    async (q: string) => {
      if (!user || q.trim().length < 2) {
        setShareResults([]);
        return;
      }
      setShareSearching(true);
      try {
        const raw = q.trim().replace(/[%_,]/g, " ");
        if (raw.length < 2) {
          setShareResults([]);
          return;
        }
        const term = `%${raw.split(/\s+/)[0]}%`;
        const { data, error } = await supabase
          .from("profiles")
          .select("user_id, display_name, full_name, avatar_url")
          .neq("user_id", user.id)
          .or(`display_name.ilike.${term},full_name.ilike.${term}`)
          .limit(15);
        if (error) throw error;
        setShareResults((data || []) as AuthorRow[]);
      } catch {
        setShareResults([]);
      } finally {
        setShareSearching(false);
      }
    },
    [user],
  );

  useEffect(() => {
    const t = setTimeout(() => searchShareUsers(shareQuery), 300);
    return () => clearTimeout(t);
  }, [shareQuery, searchShareUsers]);

  const highlightDoneRef = useRef<string | null>(null);
  useEffect(() => {
    if (!highlightPostId) {
      highlightDoneRef.current = null;
      return;
    }
    if (loading || posts.length === 0) return;
    if (!posts.some((p) => p.id === highlightPostId)) return;
    if (highlightDoneRef.current === highlightPostId) return;
    highlightDoneRef.current = highlightPostId;
    requestAnimationFrame(() => {
      document.getElementById(`community-post-${highlightPostId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      setExpandedPostId(highlightPostId);
    });
  }, [highlightPostId, loading, posts]);

  useEffect(() => {
    if (!sharePost || !user) {
      setFollowedForShare([]);
      setLoadingFollowedShare(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingFollowedShare(true);
      try {
        const { data: follows } = await supabase
          .from("professional_follows" as any)
          .select("professional_id, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(40);
        const rows = (follows || []) as { professional_id: string }[];
        const seen = new Set<string>();
        const orderedPids: string[] = [];
        for (const r of rows) {
          if (!seen.has(r.professional_id)) {
            seen.add(r.professional_id);
            orderedPids.push(r.professional_id);
          }
        }
        if (!orderedPids.length) {
          if (!cancelled) setFollowedForShare([]);
          return;
        }
        const { data: pros } = await supabase.from("professionals").select("id, user_id").in("id", orderedPids);
        const uidByPid = new Map((pros || []).map((p: any) => [p.id, p.user_id as string]));
        const uids = orderedPids.map((pid) => uidByPid.get(pid)).filter(Boolean) as string[];
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, display_name, full_name, avatar_url")
          .in("user_id", uids);
        const profMap = new Map((profs || []).map((p: any) => [p.user_id as string, p as AuthorRow]));
        const ordered: AuthorRow[] = [];
        for (const pid of orderedPids) {
          const uid = uidByPid.get(pid);
          if (uid && profMap.has(uid)) ordered.push(profMap.get(uid)!);
        }
        if (!cancelled) setFollowedForShare(ordered);
      } catch {
        if (!cancelled) setFollowedForShare([]);
      } finally {
        if (!cancelled) setLoadingFollowedShare(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sharePost?.id, user?.id]);

  const sendShare = async (toUserId: string) => {
    if (!user || !sharePost) return;
    setShareSending(true);
    try {
      const { error: sErr } = await supabase.from("community_post_shares" as any).insert({
        post_id: sharePost.id,
        from_user_id: user.id,
        to_user_id: toUserId,
      });
      if (sErr) throw sErr;
      const me = (profile?.full_name || "Alguém").trim();
      await supabase.from("notifications").insert({
        user_id: toUserId,
        title: "Comunidade Chamô",
        message: `${me} encaminhou uma publicação para você.`,
        type: "info",
        link: `${communityLink}&post=${encodeURIComponent(sharePost.id)}`,
      });
      toast({ title: "Enviado" });
      setSharePost(null);
      setShareQuery("");
      setShareResults([]);
    } catch (e: any) {
      toast({ title: "Erro ao compartilhar", description: e.message, variant: "destructive" });
    } finally {
      setShareSending(false);
    }
  };

  const buildShareCopy = (post: PostRow) => {
    const author = authors[post.author_id];
    const name = authorLabel(author);
    const raw = (post.body || "").replace(/\s+/g, " ").trim();
    const snippet = raw.slice(0, 140);
    const url = getCommunityPostShareUrl(post.id);
    const text = raw
      ? `“${snippet}${raw.length > 140 ? "…" : ""}” — ${name} no Chamô`
      : `${name} no Chamô — Comunidade`;
    const full = `${text}\n\n${url}`;
    return { url, text, full };
  };

  const shareCopyLinkExternal = async () => {
    if (!sharePost) return;
    const { url } = buildShareCopy(sharePost);
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copiado!" });
    } catch {
      toast({ title: "Seu link", description: url });
    }
  };

  const shareNativeExternal = async () => {
    if (!sharePost) return;
    const { full, url } = buildShareCopy(sharePost);
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Comunidade Chamô",
          text: full,
          url,
        });
        return;
      } catch {
        /* cancelado */
      }
    }
    await shareCopyLinkExternal();
  };

  const shareWhatsAppExternal = () => {
    if (!sharePost) return;
    const { full } = buildShareCopy(sharePost);
    window.open(`https://wa.me/?text=${encodeURIComponent(full)}`, "_blank", "noopener,noreferrer");
  };

  const shareSmsExternal = () => {
    if (!sharePost) return;
    const { full } = buildShareCopy(sharePost);
    window.location.href = `sms:?&body=${encodeURIComponent(full)}`;
  };

  const shareInstagramHint = async () => {
    if (!sharePost) return;
    const { url } = buildShareCopy(sharePost);
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: "Link copiado",
        description: "Cole no Direct ou nos stories do Instagram.",
      });
    } catch {
      toast({ title: "Copie o link", description: url });
    }
  };

  const commentAuthor = (uid: string) => commentAuthors[uid] || authors[uid];

  if (!user) {
    return (
      <div className="max-w-lg mx-auto px-4 py-10 text-center">
        <p className="text-muted-foreground mb-4">Entre na sua conta para ver a Comunidade.</p>
        <Button asChild className="rounded-xl">
          <Link to="/login" state={{ from: communityLink }}>
            Entrar
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <main
      className={cn(
        "mx-auto w-full max-w-lg px-4 py-3 pb-24",
        embedded &&
          "min-h-[60vh] bg-gradient-to-b from-[#faf9f7] via-[#f4f3f0] to-[#ebe8e3]",
      )}
    >
      {!embedded && (
        <div className="flex items-center gap-3 mb-4">
          <Link
            to="/pro"
            className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-muted hover:bg-muted/80 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-foreground">Comunidade</h1>
            <p className="text-xs text-muted-foreground">Rede de profissionais Chamô</p>
          </div>
        </div>
      )}

      {embedded && (
        <div className="mb-4 px-0.5">
          <p className="text-[13px] text-foreground/85 leading-snug font-medium">
            Comunidade Chamô
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
            Feed profissional: conquistas, dicas e networking — com a cara do Chamô.
          </p>
        </div>
      )}

      {user && (
        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={() => setFeedScope("all")}
            className={cn(
              "px-4 py-2 rounded-full text-xs font-bold transition-all border shadow-sm",
              feedScope === "all"
                ? "bg-primary text-primary-foreground border-primary shadow-primary/25"
                : "bg-white/95 text-foreground border-border/60 hover:bg-muted/60",
            )}
          >
            Para você
          </button>
          <button
            type="button"
            onClick={() => setFeedScope("following")}
            className={cn(
              "px-4 py-2 rounded-full text-xs font-bold transition-all border shadow-sm",
              feedScope === "following"
                ? "bg-primary text-primary-foreground border-primary shadow-primary/25"
                : "bg-white/95 text-foreground border-border/60 hover:bg-muted/60",
            )}
          >
            Seguindo
          </button>
        </div>
      )}

      {canPost && (
        <div
          className={cn(
            "rounded-[20px] bg-white p-3.5 mb-4 border border-border/50 shadow-md shadow-black/[0.04]",
            embedded && "ring-1 ring-primary/[0.12]",
          )}
        >
          <div className="flex gap-3 items-start">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary/15 to-primary/5 overflow-hidden shrink-0 flex items-center justify-center ring-2 ring-primary/20">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm font-bold text-primary">
                  {(profile?.full_name || "V").slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <Textarea
                placeholder="No que você está pensando?"
                value={composerText}
                onChange={(e) => setComposerText(e.target.value)}
                className="min-h-[72px] rounded-xl resize-none border-0 bg-muted/40 focus-visible:ring-1 focus-visible:ring-primary/30 text-[15px]"
                data-tab-swipe-ignore
              />
              {composerPreview && (
                <div className="relative rounded-xl overflow-hidden border">
                  <img src={composerPreview} alt="" className="w-full max-h-52 object-cover" />
                  <button
                    type="button"
                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center"
                    onClick={() => setComposerFile(null)}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              <div className="flex items-center justify-between gap-2 pt-1">
                <label className="inline-flex items-center gap-2 text-sm font-semibold text-primary cursor-pointer">
                  <ImagePlus className="w-5 h-5" />
                  <span>Foto</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => setComposerFile(e.target.files?.[0] || null)}
                  />
                </label>
                <Button
                  type="button"
                  size="sm"
                  className="rounded-full px-5 font-semibold"
                  disabled={publishing || (!composerText.trim() && !composerFile)}
                  onClick={publishPost}
                >
                  {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Publicar"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!canPost && (
        <p className="text-sm text-muted-foreground mb-4 rounded-2xl border border-dashed bg-white/80 px-3 py-2.5 shadow-sm">
          <strong>Profissionais e empresas</strong> publicam aqui. Você pode reagir, comentar e receber
          compartilhamentos.
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-9 h-9 animate-spin text-primary" />
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-[20px] bg-white border border-border/50 py-14 px-4 text-center shadow-md shadow-black/[0.04]">
          <p className="text-muted-foreground text-sm">Nenhuma publicação ainda.</p>
          {canPost && <p className="text-xs text-muted-foreground mt-2">Seja o primeiro a compartilhar.</p>}
        </div>
      ) : displayPosts.length === 0 && feedScope === "following" ? (
        <div className="rounded-[20px] bg-white border border-border/50 py-14 px-4 text-center shadow-md shadow-black/[0.04]">
          <p className="text-muted-foreground text-sm">Nenhuma publicação de quem você segue.</p>
          <p className="text-xs text-muted-foreground mt-2">
            Explore perfis e toque em <strong>Seguir</strong> para ver os posts aqui.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayPosts.map((post) => {
            const author = authors[post.author_id];
            const sum = reactionSummary[post.id] || {};
            const myR = myReactionByPost[post.id];
            const comments = commentsByPost[post.id] || [];
            const open = expandedPostId === post.id;
            const totalRx = REACTIONS.reduce((s, r) => s + (sum[r.type] || 0), 0);
            const bodyExpanded = expandedBodies[post.id];
            const longBody = post.body.length > BODY_COLLAPSE_LEN;
            const bodyShown =
              !longBody || bodyExpanded ? post.body : `${post.body.slice(0, BODY_COLLAPSE_LEN).trim()}…`;

            const authorProfileTo = proPathByUserId[post.author_id];

            return (
              <article
                key={post.id}
                id={`community-post-${post.id}`}
                className="rounded-[20px] bg-white shadow-md shadow-black/[0.05] overflow-hidden border border-border/45 ring-1 ring-black/[0.02] scroll-mt-24"
              >
                <div className="p-4 pb-2">
                  <div className="flex gap-3">
                    {authorProfileTo ? (
                      <Link
                        to={authorProfileTo}
                        className="w-11 h-11 rounded-full bg-muted overflow-hidden shrink-0 flex items-center justify-center ring-2 ring-background active:scale-[0.98] transition-transform"
                      >
                        {author?.avatar_url ? (
                          <img src={author.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-sm font-bold text-primary">
                            {authorLabel(author).slice(0, 2).toUpperCase()}
                          </span>
                        )}
                      </Link>
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-muted overflow-hidden shrink-0 flex items-center justify-center ring-2 ring-background">
                        {author?.avatar_url ? (
                          <img src={author.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-sm font-bold text-primary">
                            {authorLabel(author).slice(0, 2).toUpperCase()}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      {authorProfileTo ? (
                        <Link
                          to={authorProfileTo}
                          className="font-semibold text-[15px] leading-tight text-foreground hover:text-primary transition-colors block"
                        >
                          {authorLabel(author)}
                        </Link>
                      ) : (
                        <p className="font-semibold text-[15px] leading-tight text-foreground">
                          {authorLabel(author)}
                        </p>
                      )}
                      <p className="text-[12px] text-muted-foreground mt-0.5">
                        {postTimeLabel(post.created_at)} ·{" "}
                        <span className="text-primary/80 font-medium">Público</span>
                      </p>
                    </div>
                  </div>
                  {post.body ? (
                    <div className="mt-3 text-[15px] text-foreground leading-snug whitespace-pre-wrap">
                      {bodyShown}
                      {longBody && !bodyExpanded && (
                        <button
                          type="button"
                          className="text-primary font-semibold ml-1 text-sm"
                          onClick={() => setExpandedBodies((b) => ({ ...b, [post.id]: true }))}
                        >
                          mais
                        </button>
                      )}
                    </div>
                  ) : null}
                  {post.image_url ? (
                    <img
                      src={post.image_url}
                      alt=""
                      className="mt-3 rounded-xl w-full max-h-[min(420px,70vh)] object-cover bg-muted"
                    />
                  ) : null}
                </div>

                {(totalRx > 0 || comments.length > 0) && (
                  <div className="px-4 py-1.5 flex items-center justify-between text-[12px] text-muted-foreground border-t border-border/50">
                    <div className="flex items-center gap-1 min-h-[20px]">
                      {totalRx > 0 ? (
                        <>
                          <span className="flex -space-x-1">
                            {REACTIONS.filter((r) => (sum[r.type] || 0) > 0)
                              .slice(0, 3)
                              .map((r) => (
                                <span
                                  key={r.type}
                                  className="w-5 h-5 rounded-full bg-white border border-border flex items-center justify-center text-[10px]"
                                >
                                  <r.Icon className="w-3 h-3 text-primary" />
                                </span>
                              ))}
                          </span>
                          <span className="ml-1">{totalRx}</span>
                        </>
                      ) : (
                        <span />
                      )}
                    </div>
                    {comments.length > 0 && (
                      <span>
                        {comments.length} comentário{comments.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                )}

                <div className="px-3 py-2.5 flex flex-wrap gap-1.5 border-t border-border/40 bg-gradient-to-b from-muted/25 to-transparent">
                  {REACTIONS.map(({ type, label, Icon }) => {
                    const n = sum[type] || 0;
                    const active = myR === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setReaction(post.id, type)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold transition-colors",
                          active
                            ? "bg-primary/15 text-primary"
                            : "text-muted-foreground hover:bg-white/80",
                        )}
                      >
                        <Icon className={cn("w-3.5 h-3.5", type === "love" && active && "fill-primary")} />
                        {label}
                        {n > 0 && <span className="opacity-70">({n})</span>}
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 border-t border-border/55 bg-white/90 backdrop-blur-[2px]">
                  <button
                    type="button"
                    className={cn(
                      "flex items-center justify-center gap-2 py-3.5 text-[13px] font-bold text-muted-foreground hover:bg-muted/50 active:bg-muted/70 transition-colors border-r border-border/45",
                      open && "text-primary bg-primary/[0.07]",
                    )}
                    onClick={() => setExpandedPostId(open ? null : post.id)}
                  >
                    <MessageCircle className="w-[18px] h-[18px]" />
                    Comentar
                  </button>
                  <button
                    type="button"
                    className="flex items-center justify-center gap-2 py-3.5 text-[13px] font-bold text-muted-foreground hover:bg-muted/50 active:bg-muted/70 transition-colors"
                    onClick={() => setSharePost(post)}
                  >
                    <Share2 className="w-[18px] h-[18px]" />
                    Compartilhar
                  </button>
                </div>

                {open && (
                  <div className="px-4 py-3 bg-gradient-to-b from-muted/30 to-muted/10 border-t border-border/50 space-y-3">
                    {comments.map((c) => {
                      const ca = commentAuthor(c.user_id);
                      const canDel = user && (c.user_id === user.id || post.author_id === user.id);
                      const cTo = proPathByUserId[c.user_id];
                      return (
                        <div key={c.id} className="flex gap-2 text-sm">
                          <div className="flex-1 min-w-0">
                            {cTo ? (
                              <Link
                                to={cTo}
                                className="font-semibold text-[13px] text-foreground hover:text-primary transition-colors"
                              >
                                {authorLabel(ca)}
                              </Link>
                            ) : (
                              <span className="font-semibold text-[13px]">{authorLabel(ca)}</span>
                            )}
                            <span className="text-muted-foreground text-[11px] ml-2">
                              {postTimeLabel(c.created_at)}
                            </span>
                            <p className="text-foreground mt-0.5 whitespace-pre-wrap text-[14px]">{c.body}</p>
                          </div>
                          {canDel && (
                            <button
                              type="button"
                              className="p-1 text-muted-foreground hover:text-destructive shrink-0"
                              aria-label="Apagar comentário"
                              onClick={() => deleteComment(c.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                    <div className="flex gap-2">
                      <Textarea
                        placeholder="Adicione um comentário…"
                        value={commentDrafts[post.id] || ""}
                        onChange={(e) =>
                          setCommentDrafts((d) => ({ ...d, [post.id]: e.target.value }))
                        }
                        className="min-h-[48px] rounded-xl text-sm flex-1 resize-none bg-white"
                        data-tab-swipe-ignore
                      />
                      <Button
                        type="button"
                        size="icon"
                        className="rounded-xl shrink-0 self-end h-10 w-10"
                        disabled={commentSubmitting === post.id || !(commentDrafts[post.id] || "").trim()}
                        onClick={() => submitComment(post.id)}
                      >
                        {commentSubmitting === post.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <Sheet
        open={!!sharePost}
        onOpenChange={(o) => {
          if (!o) {
            setSharePost(null);
            setShareQuery("");
            setShareResults([]);
          }
        }}
      >
        <SheetContent
          side="bottom"
          className="rounded-t-[28px] p-0 gap-0 max-h-[min(92vh,760px)] flex flex-col overflow-hidden border-t border-border/60 shadow-[0_-8px_40px_rgba(0,0,0,0.12)]"
        >
          <div className="mx-auto mt-2.5 mb-1 h-1 w-11 rounded-full bg-muted-foreground/20 shrink-0" aria-hidden />
          <SheetHeader className="px-5 pt-1 pb-3 text-left space-y-1 border-b border-border/40">
            <SheetTitle className="text-lg font-bold tracking-tight">Compartilhar publicação</SheetTitle>
            <p className="text-[13px] text-muted-foreground font-normal leading-snug pr-6">
              Envie para alguém no Chamô ou compartilhe o link (WhatsApp, Instagram, Mensagens…).
            </p>
          </SheetHeader>

          <div className="px-5 pt-3 pb-2 shrink-0">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Pesquisar"
                value={shareQuery}
                onChange={(e) => setShareQuery(e.target.value)}
                className="rounded-full bg-muted/70 border-0 h-11 pl-10 text-[15px] focus-visible:ring-primary/25"
              />
            </div>
          </div>

          {(loadingFollowedShare || followedForShare.length > 0) && (
            <div className="px-5 pb-3 shrink-0 border-b border-border/30">
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-2">
                Quem você segue
              </p>
              {loadingFollowedShare ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none touch-pan-x">
                  {followedForShare.map((r) => (
                    <button
                      key={r.user_id}
                      type="button"
                      disabled={shareSending}
                      onClick={() => sendShare(r.user_id)}
                      className="flex flex-col items-center shrink-0 w-[76px] active:opacity-80 disabled:opacity-50"
                    >
                      <div className="w-[52px] h-[52px] rounded-full bg-muted overflow-hidden flex items-center justify-center text-xs font-bold ring-2 ring-background shadow-sm">
                        {r.avatar_url ? (
                          <img src={r.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          authorLabel(r).slice(0, 2).toUpperCase()
                        )}
                      </div>
                      <span className="text-[10px] font-medium text-center leading-tight mt-1.5 line-clamp-2 text-foreground">
                        {authorLabel(r)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex-1 min-h-[120px] overflow-y-auto px-5 py-2 space-y-1">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide py-1">
              Resultados da busca
            </p>
            {shareSearching && (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {!shareSearching && shareQuery.trim().length >= 2 && shareResults.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">Ninguém encontrado.</p>
            )}
            {!shareSearching &&
              shareResults.map((r) => (
                <button
                  key={r.user_id}
                  type="button"
                  className="w-full flex items-center gap-3 p-2.5 rounded-2xl hover:bg-muted/80 text-left transition-colors"
                  disabled={shareSending}
                  onClick={() => sendShare(r.user_id)}
                >
                  <div className="w-10 h-10 rounded-full bg-muted overflow-hidden flex items-center justify-center text-xs font-bold shrink-0">
                    {r.avatar_url ? (
                      <img src={r.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      authorLabel(r).slice(0, 2).toUpperCase()
                    )}
                  </div>
                  <span className="font-semibold text-sm">{authorLabel(r)}</span>
                </button>
              ))}
          </div>

          <div className="shrink-0 border-t border-border/50 bg-gradient-to-t from-muted/40 to-muted/10 px-4 pt-3 pb-6 safe-area-bottom">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-3 px-1">
              Compartilhar em
            </p>
            <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none touch-pan-x justify-start">
              <button
                type="button"
                onClick={() => shareNativeExternal()}
                className="flex flex-col items-center shrink-0 w-[72px]"
              >
                <span className="w-[52px] h-[52px] rounded-full bg-muted flex items-center justify-center shadow-inner border border-border/50">
                  <Upload className="w-[22px] h-[22px] text-foreground" />
                </span>
                <span className="text-[10px] font-semibold text-center mt-1.5 leading-tight text-foreground/90">
                  Mais opções
                </span>
              </button>
              <button
                type="button"
                onClick={() => shareCopyLinkExternal()}
                className="flex flex-col items-center shrink-0 w-[72px]"
              >
                <span className="w-[52px] h-[52px] rounded-full bg-muted flex items-center justify-center shadow-inner border border-border/50">
                  <Link2 className="w-[22px] h-[22px] text-foreground" />
                </span>
                <span className="text-[10px] font-semibold text-center mt-1.5 leading-tight text-foreground/90">
                  Copiar link
                </span>
              </button>
              <button
                type="button"
                onClick={() => shareWhatsAppExternal()}
                className="flex flex-col items-center shrink-0 w-[72px]"
              >
                <span className="w-[52px] h-[52px] rounded-full bg-[#25D366] flex items-center justify-center text-white text-lg font-bold shadow-md">
                  W
                </span>
                <span className="text-[10px] font-semibold text-center mt-1.5 leading-tight text-foreground/90">
                  WhatsApp
                </span>
              </button>
              <button
                type="button"
                onClick={() => shareInstagramHint()}
                className="flex flex-col items-center shrink-0 w-[72px]"
              >
                <span
                  className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-white text-xs font-bold shadow-md"
                  style={{
                    background: "linear-gradient(45deg, #f58529, #dd2a7b, #8134af, #515bd4)",
                  }}
                >
                  IG
                </span>
                <span className="text-[10px] font-semibold text-center mt-1.5 leading-tight text-foreground/90">
                  Instagram
                </span>
              </button>
              <button
                type="button"
                onClick={() => shareSmsExternal()}
                className="flex flex-col items-center shrink-0 w-[72px]"
              >
                <span className="w-[52px] h-[52px] rounded-full bg-[#34C759] flex items-center justify-center shadow-md">
                  <MessageSquare className="w-[22px] h-[22px] text-white" />
                </span>
                <span className="text-[10px] font-semibold text-center mt-1.5 leading-tight text-foreground/90">
                  Mensagens
                </span>
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </main>
  );
}
