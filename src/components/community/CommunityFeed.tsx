import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Heart,
  PartyPopper,
  Lightbulb,
  ThumbsUp,
  MessageCircle,
  Send,
  ImagePlus,
  Loader2,
  Trash2,
  X,
  Link2,
  MessageSquare,
  Upload,
  Search,
  BadgeCheck,
  UserPlus,
  Check,
  Video,
  Globe,
  Users,
  Maximize2,
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
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getCommunityPostShareUrl } from "@/lib/publicAppUrl";
import { compressImageForChat } from "@/lib/compressChatImage";

export type CommunityFeedVariant = "embedded" | "standalone";

type ReactionType = "like" | "love" | "congrats" | "genius";

const REACTIONS: { type: ReactionType; label: string; Icon: typeof ThumbsUp }[] = [
  { type: "like", label: "Curtir", Icon: ThumbsUp },
  { type: "love", label: "Amei", Icon: Heart },
  { type: "congrats", label: "Parabéns", Icon: PartyPopper },
  { type: "genius", label: "Genial", Icon: Lightbulb },
];

function reactionRowLabelClass(type: ReactionType, active: boolean): string {
  if (!active) return "text-muted-foreground hover:bg-white/60";
  switch (type) {
    case "like":
      return "text-sky-700 font-semibold";
    case "love":
      return "text-red-600 font-semibold";
    case "congrats":
      return "text-amber-600 font-semibold [text-shadow:0_0_8px_rgba(59,130,246,0.45)]";
    case "genius":
      return "text-violet-700 font-semibold";
    default:
      return "text-primary font-semibold";
  }
}

function reactionRowIconClass(type: ReactionType, active: boolean): string {
  if (!active) return "text-muted-foreground";
  switch (type) {
    case "like":
      return "text-sky-600";
    case "love":
      return "text-red-500 fill-red-500";
    case "congrats":
      return "text-amber-500";
    case "genius":
      return "text-amber-400 fill-amber-200";
    default:
      return "";
  }
}

function reactionSummaryIconClass(type: ReactionType): string {
  switch (type) {
    case "like":
      return "text-sky-600";
    case "love":
      return "text-red-500 fill-red-500";
    case "congrats":
      return "text-amber-500";
    case "genius":
      return "text-amber-400 fill-amber-200";
    default:
      return "text-primary";
  }
}

function reactionFullscreenCircle(type: ReactionType, active: boolean): string {
  const base =
    "flex h-11 w-11 items-center justify-center rounded-full bg-black/45 backdrop-blur-md border";
  if (!active) return cn(base, "border-white/15 text-white/90");
  switch (type) {
    case "like":
      return cn(base, "border-sky-400/60 bg-sky-500/20 text-sky-300");
    case "love":
      return cn(base, "border-red-400/60 bg-red-500/25 text-red-400");
    case "congrats":
      return cn(base, "border-amber-400/60 bg-amber-500/20 text-amber-300");
    case "genius":
      return cn(base, "border-violet-400/50 bg-violet-500/15 text-amber-300");
    default:
      return cn(base, "border-white/15");
  }
}

interface PostRow {
  id: string;
  author_id: string;
  body: string;
  image_url: string | null;
  video_url?: string | null;
  audience?: string | null;
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
  const [composerMedia, setComposerMedia] = useState<{ kind: "image" | "video"; file: File } | null>(
    null,
  );
  const [composerPreview, setComposerPreview] = useState<string | null>(null);
  const [composerModalOpen, setComposerModalOpen] = useState(false);
  const [postAudience, setPostAudience] = useState<"public" | "followers">("public");
  const [publishing, setPublishing] = useState(false);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [commentsSheetPost, setCommentsSheetPost] = useState<PostRow | null>(null);
  const [fullscreenPost, setFullscreenPost] = useState<PostRow | null>(null);
  const [authorProMeta, setAuthorProMeta] = useState<
    Record<string, { proId: string; headline: string; verified: boolean }>
  >({});
  const [commentReactions, setCommentReactions] = useState<{ comment_id: string; user_id: string }[]>([]);
  const [replyTarget, setReplyTarget] = useState<{ postId: string; name: string } | null>(null);
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

  const loadFeed = useCallback(async (opts?: { silent?: boolean }) => {
    if (!user) {
      setFollowingAuthorIds(new Set());
      if (!opts?.silent) setLoading(false);
      return;
    }
    if (!opts?.silent) setLoading(true);
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
        .select("id, author_id, body, image_url, video_url, audience, created_at")
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
        setAuthorProMeta({});
        setCommentReactions([]);
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
      const cids = cList.map((c) => c.id);
      if (cids.length) {
        const { data: crxData } = await supabase
          .from("community_comment_reactions" as any)
          .select("comment_id, user_id")
          .in("comment_id", cids);
        setCommentReactions((crxData || []) as { comment_id: string; user_id: string }[]);
      } else {
        setCommentReactions([]);
      }
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
          .select("user_id, id, slug, verified, professions(name), categories(name)")
          .in("user_id", allUids);
        const paths: Record<string, string> = {};
        const pmeta: Record<string, { proId: string; headline: string; verified: boolean }> = {};
        (proRows || []).forEach((row: any) => {
          const key = String(row.slug || row.id || "").trim();
          if (key) paths[row.user_id] = `/professional/${encodeURIComponent(key)}`;
          const pn = row.professions?.name;
          const headline = pn && String(pn).trim() ? String(pn).trim() : "";
          pmeta[row.user_id] = { proId: row.id, headline, verified: !!row.verified };
        });
        setProPathByUserId(paths);
        setAuthorProMeta(pmeta);
      } else {
        setProPathByUserId({});
        setAuthorProMeta({});
      }
    } catch (e: any) {
      console.error(e);
      toast({
        title: "Erro ao carregar Comunidade",
        description: e.message || "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  useEffect(() => {
    if (!composerMedia) {
      setComposerPreview(null);
      return;
    }
    const url = URL.createObjectURL(composerMedia.file);
    setComposerPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [composerMedia]);

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

  const commentLikeStats = useMemo(() => {
    const counts = new Map<string, number>();
    const my = new Set<string>();
    commentReactions.forEach((r) => {
      counts.set(r.comment_id, (counts.get(r.comment_id) || 0) + 1);
      if (user && r.user_id === user.id) my.add(r.comment_id);
    });
    return { counts, my };
  }, [commentReactions, user]);

  const publishPost = async () => {
    if (!user || !canPost) return;
    const text = composerText.trim();
    if (!text && !composerMedia) {
      toast({ title: "Escreva algo ou adicione uma foto ou vídeo", variant: "destructive" });
      return;
    }
    setPublishing(true);
    try {
      let imageUrl: string | null = null;
      let videoUrl: string | null = null;
      if (composerMedia?.kind === "image") {
        const blob = await compressImageForChat(composerMedia.file, {
          maxEdge: 1600,
          webpQuality: 0.82,
          jpegQuality: 0.85,
        });
        const ext = blob.type.includes("webp") ? "webp" : "jpg";
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const file = new File([blob], `post.${ext}`, { type: blob.type });
        const { error: upErr } = await supabase.storage
          .from("community-feed")
          .upload(path, file, { upsert: false, contentType: blob.type || "image/jpeg" });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("community-feed").getPublicUrl(path);
        imageUrl = pub.publicUrl;
      } else if (composerMedia?.kind === "video") {
        const f = composerMedia.file;
        if (f.size > 45 * 1024 * 1024) {
          toast({
            title: "Vídeo muito grande",
            description: "Use um arquivo de até 45 MB.",
            variant: "destructive",
          });
          return;
        }
        const rawExt = (f.name.split(".").pop() || "mp4").toLowerCase();
        const ext = /^[a-z0-9]{1,8}$/.test(rawExt) ? rawExt : "mp4";
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const ct = f.type?.startsWith("video/") ? f.type : "video/mp4";
        const { error: upErr } = await supabase.storage
          .from("community-feed")
          .upload(path, f, { upsert: false, contentType: ct });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("community-feed").getPublicUrl(path);
        videoUrl = pub.publicUrl;
      }
      const { error: insErr } = await supabase.from("community_posts" as any).insert({
        author_id: user.id,
        body: text,
        image_url: imageUrl,
        video_url: videoUrl,
        audience: postAudience,
      });
      if (insErr) throw insErr;
      setComposerText("");
      setComposerMedia(null);
      setPostAudience("public");
      setComposerModalOpen(false);
      toast({ title: "Publicado na Comunidade" });
      await loadFeed({ silent: true });
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
      await loadFeed({ silent: true });
    } catch (e: any) {
      toast({ title: "Erro na reação", description: e.message, variant: "destructive" });
    }
  };

  const submitComment = async (postId: string) => {
    if (!user) return;
    let body = (commentDrafts[postId] || "").trim();
    if (!body) return;
    if (replyTarget?.postId === postId && replyTarget.name) {
      const tag = `@${replyTarget.name.split(/\s+/)[0]} `;
      if (!body.startsWith("@")) body = `${tag}${body}`;
    }
    setCommentSubmitting(postId);
    try {
      const { error } = await supabase.from("community_post_comments" as any).insert({
        post_id: postId,
        user_id: user.id,
        body,
      });
      if (error) throw error;
      setCommentDrafts((d) => ({ ...d, [postId]: "" }));
      setReplyTarget(null);
      await loadFeed({ silent: true });
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
      await loadFeed({ silent: true });
    } catch (e: any) {
      toast({ title: "Erro ao apagar", description: e.message, variant: "destructive" });
    }
  };

  const toggleFollowAuthor = async (authorUserId: string) => {
    if (!user) return;
    const meta = authorProMeta[authorUserId];
    if (!meta?.proId) return;
    try {
      if (followingAuthorIds.has(authorUserId)) {
        const { error } = await supabase
          .from("professional_follows" as any)
          .delete()
          .eq("user_id", user.id)
          .eq("professional_id", meta.proId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("professional_follows" as any).insert({
          user_id: user.id,
          professional_id: meta.proId,
        });
        if (error) throw error;
      }
      await loadFeed({ silent: true });
    } catch (e: any) {
      toast({ title: "Erro ao seguir", description: e.message, variant: "destructive" });
    }
  };

  const toggleCommentLike = async (commentId: string) => {
    if (!user) return;
    const liked = commentLikeStats.my.has(commentId);
    try {
      if (liked) {
        const { error } = await supabase
          .from("community_comment_reactions" as any)
          .delete()
          .eq("comment_id", commentId)
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("community_comment_reactions" as any).insert({
          comment_id: commentId,
          user_id: user.id,
        });
        if (error) throw error;
      }
      await loadFeed({ silent: true });
    } catch (e: any) {
      toast({ title: "Erro na curtida", description: e.message, variant: "destructive" });
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
      const hp = posts.find((p) => p.id === highlightPostId);
      if (hp) setCommentsSheetPost(hp);
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
        <>
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
              <button
                type="button"
                onClick={() => setComposerModalOpen(true)}
                className="flex-1 min-h-[72px] rounded-xl bg-muted/40 px-3 py-3 text-left text-[15px] text-muted-foreground hover:bg-muted/55 active:bg-muted/65 transition-colors"
              >
                {!composerText.trim() && !composerMedia ? (
                  "No que você está pensando?"
                ) : (
                  <span className="text-foreground line-clamp-4 block whitespace-pre-wrap break-words">
                    {[
                      composerText.trim() &&
                        composerText.trim().slice(0, 280) +
                          (composerText.trim().length > 280 ? "…" : ""),
                      composerMedia &&
                        (composerMedia.kind === "video" ? "Vídeo anexado" : "Foto anexada"),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )}
              </button>
            </div>
          </div>

          <Dialog open={composerModalOpen} onOpenChange={setComposerModalOpen}>
            <DialogContent
              className="!fixed !inset-0 !left-0 !top-0 z-[60] flex h-[100dvh] max-h-none w-full max-w-none !translate-x-0 !translate-y-0 flex-col gap-0 rounded-none border-0 bg-background p-0 overflow-hidden shadow-none data-[state=open]:slide-in-from-bottom-0 data-[state=closed]:slide-out-to-bottom-0 [&>button]:hidden"
              onOpenAutoFocus={(e) => {
                e.preventDefault();
                queueMicrotask(() => composerTextareaRef.current?.focus());
              }}
            >
              <DialogTitle className="sr-only">Nova publicação na comunidade</DialogTitle>
              <div className="flex items-center gap-2 px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] border-b border-border/50 shrink-0 bg-background">
                <button
                  type="button"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted"
                  onClick={() => setComposerModalOpen(false)}
                  aria-label="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
                <span className="font-bold text-[17px] flex-1 text-center pr-10">Criar publicação</span>
              </div>
              <div className="flex-1 flex flex-col gap-4 overflow-y-auto px-4 py-4 min-h-0">
                <Textarea
                  ref={composerTextareaRef}
                  placeholder="No que você está pensando?"
                  value={composerText}
                  onChange={(e) => setComposerText(e.target.value)}
                  className="min-h-[140px] rounded-xl resize-none text-[16px] border-border/60"
                  data-tab-swipe-ignore
                />
                <div>
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-2">
                    Quem pode ver
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setPostAudience("public")}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold border transition-colors",
                        postAudience === "public"
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/50 border-border text-muted-foreground",
                      )}
                    >
                      <Globe className="w-4 h-4" />
                      Todos no Chamô
                    </button>
                    <button
                      type="button"
                      onClick={() => setPostAudience("followers")}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold border transition-colors",
                        postAudience === "followers"
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/50 border-border text-muted-foreground",
                      )}
                    >
                      <Users className="w-4 h-4" />
                      Só meus seguidores
                    </button>
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-2">
                    Mídia
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <label className="inline-flex items-center gap-2 rounded-xl border border-border/60 px-4 py-2.5 text-sm font-semibold text-foreground cursor-pointer hover:bg-muted/50">
                      <ImagePlus className="w-5 h-5 text-primary" />
                      Foto
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) setComposerMedia({ kind: "image", file: f });
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <label className="inline-flex items-center gap-2 rounded-xl border border-border/60 px-4 py-2.5 text-sm font-semibold text-foreground cursor-pointer hover:bg-muted/50">
                      <Video className="w-5 h-5 text-primary" />
                      Vídeo
                      <input
                        type="file"
                        accept="video/mp4,video/webm,video/quicktime,video/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) setComposerMedia({ kind: "video", file: f });
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Fotos são comprimidas automaticamente. Vídeos: até 45 MB.
                  </p>
                </div>
                {composerPreview && composerMedia ? (
                  <div className="relative rounded-xl overflow-hidden border border-border/60 bg-black">
                    {composerMedia.kind === "video" ? (
                      <video
                        src={composerPreview}
                        controls
                        className="w-full max-h-64 object-contain"
                        playsInline
                      />
                    ) : (
                      <img src={composerPreview} alt="" className="w-full max-h-64 object-cover" />
                    )}
                    <button
                      type="button"
                      className="absolute top-2 right-2 w-9 h-9 rounded-full bg-black/65 text-white flex items-center justify-center"
                      onClick={() => setComposerMedia(null)}
                      aria-label="Remover mídia"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="shrink-0 border-t border-border/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-background">
                <Button
                  type="button"
                  className="w-full rounded-xl h-12 text-base font-bold"
                  disabled={publishing || (!composerText.trim() && !composerMedia)}
                  onClick={publishPost}
                >
                  {publishing ? <Loader2 className="w-5 h-5 animate-spin" /> : "Publicar"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </>
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
            const sheetOpen = commentsSheetPost?.id === post.id;
            const proMeta = authorProMeta[post.author_id];
            const totalRx = REACTIONS.reduce((s, r) => s + (sum[r.type] || 0), 0);
            const bodyExpanded = expandedBodies[post.id];
            const longBody = post.body.length > BODY_COLLAPSE_LEN;
            const bodyShown =
              !longBody || bodyExpanded ? post.body : `${post.body.slice(0, BODY_COLLAPSE_LEN).trim()}…`;

            const authorProfileTo = proPathByUserId[post.author_id];
            const showFollowUI = !!(user && post.author_id !== user.id && proMeta);
            const isFollowingAuthor = followingAuthorIds.has(post.author_id);

            return (
              <article
                key={post.id}
                id={`community-post-${post.id}`}
                className="rounded-[20px] bg-white shadow-md shadow-black/[0.05] overflow-hidden border border-border/45 ring-1 ring-black/[0.02] scroll-mt-24"
              >
                <div className="p-4 pb-2">
                  <div className="flex gap-3 items-start">
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
                    <div className="min-w-0 flex-1 flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        {authorProfileTo ? (
                          <Link
                            to={authorProfileTo}
                            className="inline-flex items-center gap-1 max-w-full font-semibold text-[15px] leading-tight text-foreground hover:text-primary transition-colors"
                          >
                            <span className="truncate">{authorLabel(author)}</span>
                            {proMeta?.verified ? (
                              <BadgeCheck className="w-4 h-4 shrink-0 text-sky-500" aria-label="Verificado" />
                            ) : null}
                          </Link>
                        ) : (
                          <p className="inline-flex items-center gap-1 max-w-full font-semibold text-[15px] leading-tight text-foreground">
                            <span className="truncate">{authorLabel(author)}</span>
                            {proMeta?.verified ? (
                              <BadgeCheck className="w-4 h-4 shrink-0 text-sky-500" aria-label="Verificado" />
                            ) : null}
                          </p>
                        )}
                        {proMeta?.headline ? (
                          <p className="text-[12px] text-muted-foreground mt-0.5 line-clamp-2">
                            {proMeta.headline}
                          </p>
                        ) : null}
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {postTimeLabel(post.created_at)} ·{" "}
                          <span className="text-primary/80 font-medium">
                            {post.audience === "followers" ? "Seguidores" : "Público"}
                          </span>
                        </p>
                      </div>
                      {showFollowUI &&
                        (isFollowingAuthor ? (
                          <button
                            type="button"
                            onClick={() => toggleFollowAuthor(post.author_id)}
                            className="shrink-0 inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-bold text-muted-foreground hover:bg-muted/70 transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Seguindo
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleFollowAuthor(post.author_id)}
                            className="shrink-0 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground shadow-sm hover:opacity-95 transition-opacity"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            Seguir
                          </button>
                        ))}
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
                  {post.video_url ? (
                    <div className="relative mt-3 rounded-xl overflow-hidden bg-black">
                      <video
                        src={post.video_url}
                        controls
                        className="w-full max-h-[min(420px,70vh)] object-contain bg-black"
                        playsInline
                      />
                      <button
                        type="button"
                        className="absolute top-2 right-2 rounded-full bg-black/55 p-2 text-white backdrop-blur-sm"
                        onClick={() => setFullscreenPost(post)}
                        aria-label="Ver em tela cheia"
                      >
                        <Maximize2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : post.image_url ? (
                    <button
                      type="button"
                      className="mt-3 w-full p-0 border-0 bg-transparent rounded-xl overflow-hidden block text-left cursor-zoom-in active:opacity-95"
                      onClick={() => setFullscreenPost(post)}
                    >
                      <img
                        src={post.image_url}
                        alt=""
                        className="rounded-xl w-full max-h-[min(420px,70vh)] object-cover bg-muted pointer-events-none"
                      />
                    </button>
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
                                  <r.Icon className={cn("w-3 h-3", reactionSummaryIconClass(r.type))} />
                                </span>
                              ))}
                          </span>
                          <span className="ml-1">{totalRx}</span>
                        </>
                      ) : (
                        <span />
                      )}
                    </div>
                    {comments.length > 0 ? (
                      <button
                        type="button"
                        className="font-medium text-muted-foreground hover:text-foreground hover:underline"
                        onClick={() => setCommentsSheetPost(post)}
                      >
                        {comments.length} comentário{comments.length !== 1 ? "s" : ""}
                      </button>
                    ) : null}
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
                          "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] transition-colors",
                          reactionRowLabelClass(type, active),
                        )}
                      >
                        <Icon
                          className={cn("w-3.5 h-3.5 shrink-0", reactionRowIconClass(type, active))}
                        />
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
                      sheetOpen && "text-primary bg-primary/[0.07]",
                    )}
                    onClick={() => setCommentsSheetPost(sheetOpen ? null : post)}
                  >
                    <MessageCircle className="w-[18px] h-[18px]" />
                    Comentar
                  </button>
                  <button
                    type="button"
                    className="flex items-center justify-center gap-2 py-3.5 text-[13px] font-bold text-muted-foreground hover:bg-muted/50 active:bg-muted/70 transition-colors"
                    onClick={() => setSharePost(post)}
                  >
                    <Send className="w-[18px] h-[18px] -rotate-12" />
                    Compartilhar
                  </button>
                </div>
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
          onOpenAutoFocus={(e) => e.preventDefault()}
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
                autoFocus={false}
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

      <Sheet
        open={!!commentsSheetPost}
        onOpenChange={(o) => {
          if (!o) {
            setCommentsSheetPost(null);
            setReplyTarget(null);
          }
        }}
      >
        <SheetContent
          side="bottom"
          className="rounded-t-[28px] p-0 gap-0 max-h-[min(88vh,720px)] flex flex-col overflow-hidden border-t border-border/60 shadow-[0_-8px_40px_rgba(0,0,0,0.12)]"
        >
          <div className="mx-auto mt-2.5 mb-1 h-1 w-11 rounded-full bg-muted-foreground/20 shrink-0" aria-hidden />
          <SheetHeader className="px-5 pt-1 pb-3 text-left border-b border-border/40">
            <SheetTitle className="text-lg font-bold tracking-tight">Comentários</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">
            {commentsSheetPost &&
              (commentsByPost[commentsSheetPost.id] || []).map((c) => {
                const ca = commentAuthor(c.user_id);
                const cMeta = authorProMeta[c.user_id];
                const canDel =
                  user && (c.user_id === user.id || commentsSheetPost.author_id === user.id);
                const cTo = proPathByUserId[c.user_id];
                const liked = commentLikeStats.my.has(c.id);
                const likeCount = commentLikeStats.counts.get(c.id) || 0;
                const avatarInner = ca?.avatar_url ? (
                  <img src={ca.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[10px] font-bold text-primary">
                    {authorLabel(ca).slice(0, 2).toUpperCase()}
                  </span>
                );
                return (
                  <div key={c.id} className="flex gap-3">
                    {cTo ? (
                      <Link
                        to={cTo}
                        className="w-9 h-9 rounded-full bg-muted overflow-hidden shrink-0 flex items-center justify-center ring-1 ring-border/50 active:scale-[0.98] transition-transform"
                      >
                        {avatarInner}
                      </Link>
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-muted overflow-hidden shrink-0 flex items-center justify-center ring-1 ring-border/50">
                        {avatarInner}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
                        {cTo ? (
                          <Link
                            to={cTo}
                            className="font-bold text-[14px] text-foreground hover:text-primary transition-colors"
                          >
                            {authorLabel(ca)}
                          </Link>
                        ) : (
                          <span className="font-bold text-[14px]">{authorLabel(ca)}</span>
                        )}
                        {cMeta?.verified ? (
                          <BadgeCheck className="w-3.5 h-3.5 shrink-0 text-sky-500" aria-label="Verificado" />
                        ) : null}
                        <span className="text-[11px] text-muted-foreground">
                          {postTimeLabel(c.created_at)}
                        </span>
                      </div>
                      {cMeta?.headline ? (
                        <p className="text-[11px] text-muted-foreground mt-0.5">{cMeta.headline}</p>
                      ) : null}
                      <p className="text-[14px] text-foreground mt-1 whitespace-pre-wrap leading-snug">
                        {c.body}
                      </p>
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-[12px] font-semibold">
                        <button
                          type="button"
                          className={cn(
                            "transition-colors",
                            liked
                              ? "text-red-500 font-semibold"
                              : "text-muted-foreground hover:text-red-500/90",
                          )}
                          onClick={() => toggleCommentLike(c.id)}
                        >
                          Curtir{likeCount > 0 ? ` · ${likeCount}` : ""}
                        </button>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-primary transition-colors"
                          onClick={() =>
                            setReplyTarget({
                              postId: commentsSheetPost.id,
                              name: authorLabel(ca),
                            })
                          }
                        >
                          Responder
                        </button>
                        {canDel ? (
                          <button
                            type="button"
                            className="p-1 text-muted-foreground hover:text-destructive shrink-0 ml-auto"
                            aria-label="Apagar comentário"
                            onClick={() => deleteComment(c.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
          {commentsSheetPost ? (
            <div className="shrink-0 border-t border-border/50 bg-muted/25 px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-2">
              {replyTarget?.postId === commentsSheetPost.id ? (
                <div className="flex items-center justify-between text-[12px] text-muted-foreground">
                  <span>
                    Respondendo a{" "}
                    <span className="font-semibold text-foreground">{replyTarget.name}</span>
                  </span>
                  <button
                    type="button"
                    className="p-1 rounded-full hover:bg-muted transition-colors"
                    onClick={() => setReplyTarget(null)}
                    aria-label="Cancelar resposta"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : null}
              <div className="flex gap-2">
                <Textarea
                  placeholder="Adicione um comentário…"
                  value={commentDrafts[commentsSheetPost.id] || ""}
                  onChange={(e) =>
                    setCommentDrafts((d) => ({ ...d, [commentsSheetPost.id]: e.target.value }))
                  }
                  className="min-h-[44px] max-h-[120px] rounded-xl text-sm flex-1 resize-none bg-white"
                  data-tab-swipe-ignore
                />
                <Button
                  type="button"
                  size="icon"
                  className="rounded-xl shrink-0 self-end h-10 w-10"
                  disabled={
                    commentSubmitting === commentsSheetPost.id ||
                    !(commentDrafts[commentsSheetPost.id] || "").trim()
                  }
                  onClick={() => submitComment(commentsSheetPost.id)}
                >
                  {commentSubmitting === commentsSheetPost.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={!!fullscreenPost} onOpenChange={(o) => !o && setFullscreenPost(null)}>
        <DialogContent className="!fixed !inset-0 !left-0 !top-0 z-50 flex h-[100dvh] max-h-none w-full max-w-none !translate-x-0 !translate-y-0 flex-col gap-0 rounded-none border-0 bg-black p-0 overflow-hidden shadow-none data-[state=open]:slide-in-from-bottom-0 data-[state=closed]:slide-out-to-bottom-0 [&>button]:hidden">
          <DialogTitle className="sr-only">Publicação na comunidade</DialogTitle>
          {fullscreenPost ? (
            <>
              <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center">
                <button
                  type="button"
                  className="absolute left-3 z-20 rounded-full bg-black/50 p-2 text-white backdrop-blur-sm"
                  style={{ top: "max(0.75rem, env(safe-area-inset-top))" }}
                  onClick={() => setFullscreenPost(null)}
                  aria-label="Fechar"
                >
                  <ArrowLeft className="w-6 h-6" />
                </button>
                {fullscreenPost.video_url ? (
                  <video
                    src={fullscreenPost.video_url}
                    controls
                    className="max-h-full max-w-full object-contain"
                    playsInline
                  />
                ) : fullscreenPost.image_url ? (
                  <img
                    src={fullscreenPost.image_url}
                    alt=""
                    className="max-h-full max-w-full object-contain"
                  />
                ) : null}
                <div
                  className="absolute right-2 z-20 flex flex-col gap-3"
                  style={{
                    bottom: "max(5.5rem, calc(env(safe-area-inset-bottom) + 4rem))",
                  }}
                >
                  {REACTIONS.map(({ type, label, Icon }) => {
                    const sm = reactionSummary[fullscreenPost.id] || {};
                    const n = sm[type] || 0;
                    const active = myReactionByPost[fullscreenPost.id] === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setReaction(fullscreenPost.id, type)}
                        className="flex flex-col items-center gap-0.5 text-white/90"
                      >
                        <span className={reactionFullscreenCircle(type, active)}>
                          <Icon
                            className={cn("h-5 w-5", type === "love" && active && "fill-current")}
                          />
                        </span>
                        <span className="text-[9px] font-bold">{label}</span>
                        {n > 0 ? <span className="text-[10px] opacity-80">{n}</span> : null}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      const p = fullscreenPost;
                      setFullscreenPost(null);
                      setCommentsSheetPost(p);
                    }}
                    className="flex flex-col items-center gap-0.5 text-white/90"
                  >
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45 backdrop-blur-md border border-white/15">
                      <MessageCircle className="h-5 w-5" />
                    </span>
                    <span className="text-[9px] font-bold">Comentários</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const p = fullscreenPost;
                      setFullscreenPost(null);
                      setSharePost(p);
                    }}
                    className="flex flex-col items-center gap-0.5 text-white/90"
                  >
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45 backdrop-blur-md border border-white/15">
                      <Send className="h-5 w-5 -rotate-12" />
                    </span>
                    <span className="text-[9px] font-bold">Partilhar</span>
                  </button>
                </div>
              </div>
              {fullscreenPost.body ? (
                <div className="shrink-0 bg-gradient-to-t from-black via-black/95 to-transparent px-4 pt-8 pb-[max(1rem,env(safe-area-inset-bottom))]">
                  <p className="text-[14px] text-white/95 whitespace-pre-wrap leading-snug">
                    {fullscreenPost.body}
                  </p>
                </div>
              ) : (
                <div className="h-[max(0.5rem,env(safe-area-inset-bottom))] shrink-0" />
              )}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </main>
  );
}
