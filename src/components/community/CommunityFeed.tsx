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
  Video,
  Maximize2,
  MoreHorizontal,
  ChevronDown,
  EyeOff,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getCommunityPostShareUrl } from "@/lib/publicAppUrl";
import { fetchFavoritedProfessionalOwnerUserIds } from "@/lib/chamoFriends";
import { compressImageForChat } from "@/lib/compressChatImage";
import { LinkedInLikeControl, type LinkedInReactionType } from "@/components/community/LinkedInLikeControl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  parent_id?: string | null;
}

interface CommentReactionRow {
  comment_id: string;
  user_id: string;
  reaction_type: ReactionType;
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
const COMMENT_BODY_COLLAPSE = 220;

function filterVisibleComments(list: CommentRow[], hidden: Set<string>): CommentRow[] {
  return list.filter((c) => {
    if (hidden.has(c.id)) return false;
    if (c.parent_id && hidden.has(c.parent_id)) return false;
    return true;
  });
}

function totalReactionCount(sum: Partial<Record<ReactionType, number>> | undefined): number {
  if (!sum) return 0;
  return (sum.like || 0) + (sum.love || 0) + (sum.congrats || 0) + (sum.genius || 0);
}

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
  const [publishing, setPublishing] = useState(false);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [commentsSheetPost, setCommentsSheetPost] = useState<PostRow | null>(null);
  const [fullscreenPost, setFullscreenPost] = useState<PostRow | null>(null);
  const [authorProMeta, setAuthorProMeta] = useState<
    Record<string, { proId: string; headline: string; verified: boolean }>
  >({});
  const [commentReactions, setCommentReactions] = useState<CommentReactionRow[]>([]);
  const [replyTarget, setReplyTarget] = useState<{
    postId: string;
    parentCommentId: string | null;
    name: string;
  } | null>(null);
  const [hiddenCommentIds, setHiddenCommentIds] = useState<Set<string>>(() => new Set());
  const [expandedReplyIds, setExpandedReplyIds] = useState<Record<string, boolean>>({});
  const [reportDialog, setReportDialog] = useState<
    | { kind: "comment"; commentId: string }
    | { kind: "post"; postId: string }
    | null
  >(null);
  const [hiddenPostIds, setHiddenPostIds] = useState<Set<string>>(() => new Set());
  const [reportReason, setReportReason] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [undoHideId, setUndoHideId] = useState<string | null>(null);
  const [undoHidePostId, setUndoHidePostId] = useState<string | null>(null);
  const [hiddenPostsSheetOpen, setHiddenPostsSheetOpen] = useState(false);
  /** Posts ocultos que já não estão no feed carregado (só para o painel Ocultas). */
  const [hiddenPostStubs, setHiddenPostStubs] = useState<
    Record<string, { id: string; body: string | null; created_at: string }>
  >({});
  const [expandedBodies, setExpandedBodies] = useState<Record<string, boolean>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentSubmitting, setCommentSubmitting] = useState<string | null>(null);
  /** Ordenação dos comentários no painel (raízes). Respostas mantêm ordem cronológica por thread. */
  const [commentsSortOrder, setCommentsSortOrder] = useState<"relevant" | "recent">("relevant");

  const [sharePost, setSharePost] = useState<PostRow | null>(null);
  const [shareQuery, setShareQuery] = useState("");
  const [shareResults, setShareResults] = useState<AuthorRow[]>([]);
  const [shareSearching, setShareSearching] = useState(false);
  const [shareSending, setShareSending] = useState(false);
  const [proPathByUserId, setProPathByUserId] = useState<Record<string, string>>({});
  const [favoritesForShare, setFavoritesForShare] = useState<AuthorRow[]>([]);
  const [loadingFavoritesShare, setLoadingFavoritesShare] = useState(false);
  const [feedScope, setFeedScope] = useState<"all" | "favorites">("all");
  const [favoritedAuthorUserIds, setFavoritedAuthorUserIds] = useState<Set<string>>(() => new Set());

  const highlightPostIdRef = useRef<string | null | undefined>(highlightPostId);
  useEffect(() => {
    highlightPostIdRef.current = highlightPostId;
  }, [highlightPostId]);

  const postsRef = useRef<PostRow[]>([]);
  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  const communityLink = "/home?feed=comunidade";

  const canPost =
    profile?.user_type === "professional" || profile?.user_type === "company";

  const loadFeed = useCallback(async (opts?: { silent?: boolean }) => {
    if (!user) {
      setFavoritedAuthorUserIds(new Set());
      setHiddenPostIds(new Set());
      if (!opts?.silent) setLoading(false);
      return;
    }
    if (!opts?.silent) setLoading(true);
    try {
      const favUids = await fetchFavoritedProfessionalOwnerUserIds(supabase, user.id);
      setFavoritedAuthorUserIds(new Set(favUids));

      const { data: hideRows } = await supabase
        .from("community_comment_user_hides" as any)
        .select("comment_id")
        .eq("user_id", user.id);
      setHiddenCommentIds(new Set((hideRows || []).map((h: any) => h.comment_id as string)));
      const { data: postHideRows } = await supabase
        .from("community_post_user_hides" as any)
        .select("post_id")
        .eq("user_id", user.id);
      setHiddenPostIds(new Set((postHideRows || []).map((h: any) => h.post_id as string)));

      const { data: postRows, error: pe } = await supabase
        .from("community_posts" as any)
        .select("id, author_id, body, image_url, video_url, audience, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (pe) throw pe;
      const plist = (postRows || []) as PostRow[];
      const hId = String(highlightPostIdRef.current || "").trim();
      const prevPosts = postsRef.current;
      let mergedList = plist;
      if (hId) {
        const extra = prevPosts.find((p) => p.id === hId);
        if (extra && !plist.some((p) => p.id === hId)) {
          mergedList = [extra, ...plist];
        }
      }
      setPosts(mergedList);
      if (!mergedList.length) {
        setAuthors({});
        setReactions([]);
        setCommentsByPost({});
        setCommentAuthors({});
        setProPathByUserId({});
        setAuthorProMeta({});
        setCommentReactions([]);
        return;
      }
      const authorIds = [...new Set(mergedList.map((p) => p.author_id))];
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, display_name, full_name, avatar_url")
        .in("user_id", authorIds);
      const amap: Record<string, AuthorRow> = {};
      (profs || []).forEach((p: any) => {
        amap[p.user_id] = p as AuthorRow;
      });
      setAuthors(amap);

      const pids = mergedList.map((p) => p.id);
      const { data: rx } = await supabase
        .from("community_post_reactions" as any)
        .select("post_id, user_id, reaction_type")
        .in("post_id", pids);
      setReactions((rx || []) as ReactionRow[]);

      const { data: cmts } = await supabase
        .from("community_post_comments" as any)
        .select("id, post_id, user_id, body, created_at, parent_id")
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
          .select("comment_id, user_id, reaction_type")
          .in("comment_id", cids);
        setCommentReactions((crxData || []) as CommentReactionRow[]);
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

  /** Deep link / suporte: post fora dos últimos 50 ou denúncia antiga — carrega o post pelo id. */
  useEffect(() => {
    if (!user || !highlightPostId) return;
    if (loading) return;
    if (posts.some((p) => p.id === highlightPostId)) return;

    let cancelled = false;
    const hid = highlightPostId;

    void (async () => {
      try {
        const { data: row, error: pe } = await supabase
          .from("community_posts" as any)
          .select("id, author_id, body, image_url, video_url, audience, created_at")
          .eq("id", hid)
          .maybeSingle();
        if (cancelled || pe || !row) return;

        const pr = row as PostRow;
        setPosts((prev) => (prev.some((p) => p.id === pr.id) ? prev : [pr, ...prev]));

        const { data: prof } = await supabase
          .from("profiles")
          .select("user_id, display_name, full_name, avatar_url")
          .eq("user_id", pr.author_id)
          .maybeSingle();
        if (!cancelled && prof) {
          setAuthors((a) => ({ ...a, [pr.author_id]: prof as AuthorRow }));
        }

        const { data: rx } = await supabase
          .from("community_post_reactions" as any)
          .select("post_id, user_id, reaction_type")
          .eq("post_id", hid);
        if (!cancelled && rx?.length) {
          setReactions((prev) => [...prev.filter((r) => r.post_id !== hid), ...(rx as ReactionRow[])]);
        }

        const { data: cmts } = await supabase
          .from("community_post_comments" as any)
          .select("id, post_id, user_id, body, created_at, parent_id")
          .eq("post_id", hid)
          .order("created_at", { ascending: true });
        if (!cancelled) {
          const cList = (cmts || []) as CommentRow[];
          setCommentsByPost((prev) => ({ ...prev, [hid]: cList }));
          const cAuthorIds = [...new Set(cList.map((c) => c.user_id))].filter((id) => id !== pr.author_id);
          if (cAuthorIds.length) {
            const { data: cprofs } = await supabase
              .from("profiles")
              .select("user_id, display_name, full_name, avatar_url")
              .in("user_id", cAuthorIds);
            if (!cancelled && cprofs?.length) {
              setCommentAuthors((prev) => {
                const m = { ...prev };
                (cprofs as any[]).forEach((p) => {
                  m[p.user_id] = p as AuthorRow;
                });
                return m;
              });
            }
          }
          const cids = cList.map((c) => c.id);
          if (cids.length) {
            const { data: crxData } = await supabase
              .from("community_comment_reactions" as any)
              .select("comment_id, user_id, reaction_type")
              .in("comment_id", cids);
            if (!cancelled && crxData?.length) {
              setCommentReactions((prev) => [
                ...prev.filter((r) => !cids.includes(r.comment_id)),
                ...(crxData as CommentReactionRow[]),
              ]);
            }
          }
        }

        const { data: proRow } = await supabase
          .from("professionals")
          .select("user_id, id, slug, verified, professions(name), categories(name)")
          .eq("user_id", pr.author_id)
          .maybeSingle();
        if (!cancelled && proRow) {
          const r: any = proRow;
          const key = String(r.slug || r.id || "").trim();
          if (key) {
            setProPathByUserId((prev) => ({
              ...prev,
              [pr.author_id]: `/professional/${encodeURIComponent(key)}`,
            }));
          }
          const pn = r.professions?.name;
          const headline = pn && String(pn).trim() ? String(pn).trim() : "";
          setAuthorProMeta((prev) => ({
            ...prev,
            [pr.author_id]: { proId: r.id, headline, verified: !!r.verified },
          }));
        }
      } catch (e) {
        console.error(e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, highlightPostId, loading, posts]);

  useEffect(() => {
    if (!composerMedia) {
      setComposerPreview(null);
      return;
    }
    const url = URL.createObjectURL(composerMedia.file);
    setComposerPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [composerMedia]);

  const hasPostsFromFavorites = useMemo(
    () => posts.some((p) => favoritedAuthorUserIds.has(p.author_id)),
    [posts, favoritedAuthorUserIds],
  );

  const displayPosts = useMemo(() => {
    const scope =
      feedScope === "all" ? posts : posts.filter((p) => favoritedAuthorUserIds.has(p.author_id));
    return scope.filter(
      (p) =>
        !hiddenPostIds.has(p.id) ||
        (!!highlightPostId && highlightPostId.length > 0 && p.id === highlightPostId),
    );
  }, [posts, feedScope, favoritedAuthorUserIds, hiddenPostIds, highlightPostId]);

  const hiddenPostsList = useMemo(() => {
    const rows: { id: string; body: string | null; created_at: string }[] = [];
    hiddenPostIds.forEach((id) => {
      const p = posts.find((x) => x.id === id);
      const s = hiddenPostStubs[id];
      if (p) rows.push({ id: p.id, body: p.body, created_at: p.created_at });
      else if (s) rows.push(s);
      else rows.push({ id, body: null, created_at: "" });
    });
    return rows.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  }, [hiddenPostIds, posts, hiddenPostStubs]);

  useEffect(() => {
    if (!hiddenPostsSheetOpen || !user) return;
    const missing = [...hiddenPostIds].filter((id) => !posts.some((p) => p.id === id));
    if (!missing.length) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("community_posts" as any)
        .select("id, body, created_at")
        .in("id", missing);
      if (cancelled || error) return;
      const next: Record<string, { id: string; body: string | null; created_at: string }> = {};
      (data || []).forEach((row: any) => {
        next[row.id] = {
          id: row.id,
          body: row.body ?? null,
          created_at: row.created_at ?? "",
        };
      });
      setHiddenPostStubs((prev) => ({ ...prev, ...next }));
    })();
    return () => {
      cancelled = true;
    };
  }, [hiddenPostsSheetOpen, user, hiddenPostIds, posts]);

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

  const commentReactionSummary = useMemo(() => {
    const m: Record<string, Partial<Record<ReactionType, number>>> = {};
    commentReactions.forEach((r) => {
      if (!m[r.comment_id]) m[r.comment_id] = {};
      const row = m[r.comment_id]!;
      const t = (r.reaction_type || "like") as ReactionType;
      row[t] = (row[t] || 0) + 1;
    });
    return m;
  }, [commentReactions]);

  const myReactionByComment = useMemo(() => {
    if (!user) return {};
    const map: Record<string, ReactionType> = {};
    commentReactions.forEach((r) => {
      if (r.user_id === user.id) map[r.comment_id] = (r.reaction_type || "like") as ReactionType;
    });
    return map;
  }, [commentReactions, user]);

  const commentsSheetThreads = useMemo(() => {
    if (!commentsSheetPost) {
      return { roots: [] as CommentRow[], repliesByParent: {} as Record<string, CommentRow[]> };
    }
    const sheetComments = filterVisibleComments(
      commentsByPost[commentsSheetPost.id] || [],
      hiddenCommentIds,
    );
    const roots: CommentRow[] = [];
    const repliesByParent: Record<string, CommentRow[]> = {};
    sheetComments.forEach((c) => {
      if (c.parent_id) {
        if (!repliesByParent[c.parent_id]) repliesByParent[c.parent_id] = [];
        repliesByParent[c.parent_id].push(c);
      } else {
        roots.push(c);
      }
    });
    return { roots, repliesByParent };
  }, [commentsSheetPost, commentsByPost, hiddenCommentIds]);

  const sortedSheetRoots = useMemo(() => {
    const { roots, repliesByParent } = commentsSheetThreads;
    if (roots.length === 0) return roots;

    const reactionScore = (commentId: string) => {
      const sum = commentReactionSummary[commentId] || {};
      return totalReactionCount(sum);
    };

    const threadScore = (rootId: string) => {
      let s = reactionScore(rootId);
      const reps = repliesByParent[rootId] || [];
      for (const rep of reps) {
        s += reactionScore(rep.id);
      }
      return s;
    };

    const sorted = [...roots];
    if (commentsSortOrder === "recent") {
      sorted.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    } else {
      sorted.sort((a, b) => {
        const diff = threadScore(b.id) - threadScore(a.id);
        if (diff !== 0) return diff;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    }
    return sorted;
  }, [commentsSheetThreads, commentReactionSummary, commentsSortOrder]);

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
        audience: "public",
      });
      if (insErr) throw insErr;
      setComposerText("");
      setComposerMedia(null);
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
    const uid = user.id;
    const current = myReactionByPost[postId];
    setReactions((prev) => {
      const rest = prev.filter((x) => !(x.post_id === postId && x.user_id === uid));
      if (current === type) return rest;
      return [...rest, { post_id: postId, user_id: uid, reaction_type: type }];
    });
    try {
      if (current === type) {
        const { error } = await supabase
          .from("community_post_reactions" as any)
          .delete()
          .eq("post_id", postId)
          .eq("user_id", uid);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("community_post_reactions" as any).upsert(
          { post_id: postId, user_id: uid, reaction_type: type },
          { onConflict: "post_id,user_id" },
        );
        if (error) throw error;
      }
    } catch (e: any) {
      toast({ title: "Erro na reação", description: e.message, variant: "destructive" });
      await loadFeed({ silent: true });
    }
  };

  const submitComment = async (postId: string) => {
    if (!user) return;
    let body = (commentDrafts[postId] || "").trim();
    if (!body) return;
    if (replyTarget?.postId === postId && replyTarget.name && replyTarget.parentCommentId) {
      const tag = `@${replyTarget.name.split(/\s+/)[0]} `;
      if (!body.startsWith("@")) body = `${tag}${body}`;
    }
    setCommentSubmitting(postId);
    try {
      const row: Record<string, unknown> = {
        post_id: postId,
        user_id: user.id,
        body,
      };
      if (replyTarget?.postId === postId && replyTarget.parentCommentId) {
        row.parent_id = replyTarget.parentCommentId;
      }
      const { error } = await supabase.from("community_post_comments" as any).insert(row);
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

  const setCommentReaction = async (commentId: string, type: ReactionType) => {
    if (!user) return;
    const uid = user.id;
    const current = myReactionByComment[commentId];
    setCommentReactions((prev) => {
      const rest = prev.filter((x) => !(x.comment_id === commentId && x.user_id === uid));
      if (current === type) return rest;
      return [...rest, { comment_id: commentId, user_id: uid, reaction_type: type }];
    });
    try {
      if (current === type) {
        const { error } = await supabase
          .from("community_comment_reactions" as any)
          .delete()
          .eq("comment_id", commentId)
          .eq("user_id", uid);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("community_comment_reactions" as any).upsert(
          { comment_id: commentId, user_id: uid, reaction_type: type },
          { onConflict: "comment_id,user_id" },
        );
        if (error) throw error;
      }
    } catch (e: any) {
      toast({ title: "Erro na reação", description: e.message, variant: "destructive" });
      await loadFeed({ silent: true });
    }
  };

  const hideCommentForMe = async (commentId: string) => {
    if (!user) return;
    try {
      const { error } = await supabase.from("community_comment_user_hides" as any).insert({
        user_id: user.id,
        comment_id: commentId,
      });
      if (error) throw error;
      setHiddenCommentIds((prev) => new Set([...prev, commentId]));
      setUndoHideId(commentId);
      toast({ title: "Comentário oculto para você" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const undoHideComment = async () => {
    if (!user || !undoHideId) return;
    try {
      const { error } = await supabase
        .from("community_comment_user_hides" as any)
        .delete()
        .eq("user_id", user.id)
        .eq("comment_id", undoHideId);
      if (error) throw error;
      setHiddenCommentIds((prev) => {
        const n = new Set(prev);
        n.delete(undoHideId);
        return n;
      });
      setUndoHideId(null);
    } catch (e: any) {
      toast({ title: "Erro ao desfazer", description: e.message, variant: "destructive" });
    }
  };

  const submitCommunityReport = async () => {
    if (!user || !reportDialog || reportReason.trim().length < 10) {
      toast({ title: "Descreva o motivo (mín. 10 caracteres)", variant: "destructive" });
      return;
    }
    setReportSubmitting(true);
    try {
      if (reportDialog.kind === "comment") {
        const { error } = await supabase.from("community_comment_reports" as any).insert({
          comment_id: reportDialog.commentId,
          reporter_id: user.id,
          reason: reportReason.trim(),
        });
        if (error) throw error;
        const { data: sp } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("email", "suporte@appchamo.com")
          .maybeSingle();
        if (sp?.user_id) {
          await supabase.from("notifications").insert({
            user_id: sp.user_id,
            title: "Denúncia de comentário na Comunidade",
            message: "Um comentário foi denunciado. Revise na Central de Suporte.",
            type: "support",
            link: "/suporte-desk",
          });
        }
      } else {
        const { error } = await supabase.from("community_post_reports" as any).insert({
          post_id: reportDialog.postId,
          reporter_id: user.id,
          reason: reportReason.trim(),
        });
        if (error) throw error;
        const { data: sp } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("email", "suporte@appchamo.com")
          .maybeSingle();
        if (sp?.user_id) {
          await supabase.from("notifications").insert({
            user_id: sp.user_id,
            title: "Denúncia de publicação na Comunidade",
            message: "Uma publicação foi denunciada. Revise na Central de Suporte.",
            type: "support",
            link: "/suporte-desk",
          });
        }
      }
      setReportDialog(null);
      setReportReason("");
      toast({ title: "Denúncia enviada" });
    } catch (e: any) {
      toast({ title: "Erro ao denunciar", description: e.message, variant: "destructive" });
    } finally {
      setReportSubmitting(false);
    }
  };

  const hidePostForMe = async (postId: string) => {
    if (!user) return;
    try {
      const { error } = await supabase.from("community_post_user_hides" as any).insert({
        user_id: user.id,
        post_id: postId,
      });
      if (error) throw error;
      setHiddenPostIds((prev) => new Set([...prev, postId]));
      setUndoHidePostId(postId);
      if (commentsSheetPost?.id === postId) setCommentsSheetPost(null);
      if (fullscreenPost?.id === postId) setFullscreenPost(null);
      if (sharePost?.id === postId) setSharePost(null);
      toast({
        title: "Publicação oculta para você",
        description: "Só afeta a tua conta. Usa Desfazer ou “Ocultas” para voltar a ver.",
      });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const undoHidePost = async (postId?: string) => {
    const pid = postId ?? undoHidePostId;
    if (!user || !pid) return;
    try {
      const { error } = await supabase
        .from("community_post_user_hides" as any)
        .delete()
        .eq("user_id", user.id)
        .eq("post_id", pid);
      if (error) throw error;
      setHiddenPostIds((prev) => {
        const n = new Set(prev);
        n.delete(pid);
        return n;
      });
      if (undoHidePostId === pid) setUndoHidePostId(null);
      toast({ title: "Publicação visível outra vez" });
    } catch (e: any) {
      toast({ title: "Erro ao desfazer", description: e.message, variant: "destructive" });
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

        const favIds = await fetchFavoritedProfessionalOwnerUserIds(supabase, user.id);
        const favSet = new Set(favIds);

        const { data, error } = await supabase
          .from("profiles")
          .select("user_id, display_name, full_name, avatar_url")
          .neq("user_id", user.id)
          .or(`display_name.ilike.${term},full_name.ilike.${term}`)
          .limit(20);
        if (error) throw error;
        const rows = (data || []) as AuthorRow[];
        const filtered = rows.filter((r) => favSet.has(r.user_id));
        setShareResults(filtered);
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
      setFavoritesForShare([]);
      setLoadingFavoritesShare(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingFavoritesShare(true);
      try {
        const favUids = await fetchFavoritedProfessionalOwnerUserIds(supabase, user.id);
        if (favUids.length === 0) {
          if (!cancelled) setFavoritesForShare([]);
          return;
        }

        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, display_name, full_name, avatar_url")
          .in("user_id", favUids);
        const profMap = new Map((profs || []).map((p: any) => [p.user_id as string, p as AuthorRow]));
        const ordered: AuthorRow[] = favUids
          .map((uid) => profMap.get(uid))
          .filter(Boolean) as AuthorRow[];
        ordered.sort((a, b) =>
          authorLabel(a).localeCompare(authorLabel(b), "pt-BR", { sensitivity: "base" }),
        );

        if (!cancelled) setFavoritesForShare(ordered);
      } catch {
        if (!cancelled) setFavoritesForShare([]);
      } finally {
        if (!cancelled) setLoadingFavoritesShare(false);
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
      const { data: proRow, error: proLookupErr } = await supabase
        .from("professionals")
        .select("id")
        .eq("user_id", toUserId)
        .maybeSingle();
      if (proLookupErr || !proRow?.id) {
        toast({
          title: "Só com profissionais favoritos",
          description: "Só é possível enviar pelo Chamô para perfis profissionais que estão nos seus favoritos.",
          variant: "destructive",
        });
        return;
      }
      const { data: favRow } = await supabase
        .from("professional_favorites" as any)
        .select("id")
        .eq("user_id", user.id)
        .eq("professional_id", proRow.id)
        .maybeSingle();
      if (!favRow) {
        toast({
          title: "Adicione aos favoritos",
          description: "Favorite o perfil profissional desta pessoa para partilhar a publicação na conversa.",
          variant: "destructive",
        });
        return;
      }

      const { error: sErr } = await supabase.from("community_post_shares" as any).insert({
        post_id: sharePost.id,
        from_user_id: user.id,
        to_user_id: toUserId,
      });
      if (sErr) throw sErr;

      const { data: threadId, error: rpcErr } = await supabase.rpc("ensure_following_direct_thread", {
        p_professional_id: proRow.id,
      });
      if (!rpcErr && threadId) {
        await supabase.from("chat_messages").insert({
          request_id: threadId,
          sender_id: user.id,
          content: `[COMMUNITY_POST:${sharePost.id}]`,
        });
      }

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

  const renderSheetComment = (
    c: CommentRow,
    ctx: { post: PostRow; isReply: boolean; threadRootId: string },
  ) => {
    const ca = commentAuthor(c.user_id);
    const cMeta = authorProMeta[c.user_id];
    const canDel = !!(user && (c.user_id === user.id || ctx.post.author_id === user.id));
    const cTo = proPathByUserId[c.user_id];
    const sum = commentReactionSummary[c.id] || {};
    const rxTotal = totalReactionCount(sum);
    const myRx = myReactionByComment[c.id];
    const canCommentMenu = !!(user && c.user_id !== user.id);
    const avatarInner = ca?.avatar_url ? (
      <img src={ca.avatar_url} alt="" className="w-full h-full object-cover" />
    ) : (
      <span className="text-[10px] font-bold text-primary">
        {authorLabel(ca).slice(0, 2).toUpperCase()}
      </span>
    );
    const collapseBody = c.body.length > COMMENT_BODY_COLLAPSE;
    const bodyOpen = expandedBodies[c.id];
    const threadReplyCount =
      !ctx.isReply && commentsSheetThreads.repliesByParent[c.id]?.length
        ? commentsSheetThreads.repliesByParent[c.id].length
        : 0;

    const avSize = ctx.isReply ? "w-7 h-7 min-w-7 min-h-7" : "w-9 h-9 min-w-9 min-h-9";
    const avatarEl = cTo ? (
      <Link
        to={cTo}
        className={cn(
          "rounded-full bg-muted overflow-hidden shrink-0 flex items-center justify-center ring-1 ring-border/50 active:scale-[0.98] transition-transform",
          avSize,
        )}
      >
        {avatarInner}
      </Link>
    ) : (
      <div
        className={cn(
          "rounded-full bg-muted overflow-hidden shrink-0 flex items-center justify-center ring-1 ring-border/50",
          avSize,
        )}
      >
        {avatarInner}
      </div>
    );

    return (
      <div
        className={cn(
          "flex gap-2.5",
          ctx.isReply && "mt-2 ml-6 pl-4 border-l border-border/50",
        )}
      >
        {avatarEl}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0">
                {cTo ? (
                  <Link
                    to={cTo}
                    className={cn(
                      "font-bold text-foreground hover:text-primary transition-colors",
                      ctx.isReply ? "text-[13px]" : "text-[14px]",
                    )}
                  >
                    {authorLabel(ca)}
                  </Link>
                ) : (
                  <span className={cn("font-bold", ctx.isReply ? "text-[13px]" : "text-[14px]")}>
                    {authorLabel(ca)}
                  </span>
                )}
                {cMeta?.verified ? (
                  <BadgeCheck
                    className={cn(
                      "shrink-0 text-sky-500",
                      ctx.isReply ? "w-3 h-3" : "w-3.5 h-3.5",
                    )}
                    aria-label="Verificado"
                  />
                ) : null}
              </div>
              {cMeta?.headline ? (
                <p
                  className={cn(
                    "text-muted-foreground leading-tight mt-0.5",
                    ctx.isReply ? "text-[10px]" : "text-[11px]",
                  )}
                >
                  {cMeta.headline}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <span
                className={cn(
                  "text-muted-foreground whitespace-nowrap",
                  ctx.isReply ? "text-[10px]" : "text-[11px]",
                )}
              >
                {postTimeLabel(c.created_at)}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="p-1 rounded-full text-muted-foreground hover:bg-muted transition-colors"
                    aria-label="Opções do comentário"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {canCommentMenu ? (
                    <>
                      <DropdownMenuItem
                        onClick={() => {
                          setReportDialog({ kind: "comment", commentId: c.id });
                        }}
                      >
                        Denunciar comentário
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => void hideCommentForMe(c.id)}
                        className="text-destructive focus:text-destructive"
                      >
                        Não quero ver isto
                      </DropdownMenuItem>
                    </>
                  ) : null}
                  {canDel ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive gap-2"
                        onClick={() => void deleteComment(c.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                        Apagar
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div
            className={cn(
              "text-foreground mt-1 leading-snug",
              ctx.isReply ? "text-[13px]" : "text-[14px]",
            )}
          >
            {collapseBody && !bodyOpen ? (
              <>
                <span className="whitespace-pre-wrap">{c.body.slice(0, COMMENT_BODY_COLLAPSE)}</span>
                <span>… </span>
                <button
                  type="button"
                  className={cn(
                    "text-primary font-semibold inline p-0 h-auto align-baseline bg-transparent border-0 cursor-pointer",
                    ctx.isReply ? "text-[13px]" : "text-[14px]",
                  )}
                  onClick={() => setExpandedBodies((e) => ({ ...e, [c.id]: true }))}
                >
                  mais
                </button>
              </>
            ) : (
              <span className="whitespace-pre-wrap">{c.body}</span>
            )}
          </div>

          <div className={cn("flex flex-wrap items-center gap-1", ctx.isReply ? "mt-1.5" : "mt-2")}>
            <div className="flex items-center gap-0.5">
              <LinkedInLikeControl
                fillRow={false}
                label="Curtir"
                activeType={myRx}
                onPickReaction={(t) => void setCommentReaction(c.id, t as ReactionType)}
                onQuickLikeToggle={() => void setCommentReaction(c.id, "like")}
              />
              {rxTotal > 0 ? (
                <span className="text-[11px] font-semibold text-muted-foreground tabular-nums">{rxTotal}</span>
              ) : null}
            </div>
            <button
              type="button"
              className="flex items-center gap-1 text-[12px] font-semibold text-muted-foreground hover:text-primary transition-colors ml-1"
              onClick={() =>
                setReplyTarget({
                  postId: ctx.post.id,
                  parentCommentId: ctx.threadRootId,
                  name: authorLabel(ca),
                })
              }
            >
              <MessageCircle className="w-[15px] h-[15px]" />
              {threadReplyCount > 0 ? (
                <span className="tabular-nums">· {threadReplyCount}</span>
              ) : null}
            </button>
            {rxTotal > 0 ? (
              <span className="flex -space-x-1 ml-auto pl-2">
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
            ) : null}
          </div>
        </div>
      </div>
    );
  };

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
        "mx-auto w-full max-w-lg lg:max-w-3xl xl:max-w-4xl px-4 py-3 pb-24 lg:pb-8",
        embedded &&
          "min-h-[60vh] bg-gradient-to-b from-[#faf9f7] via-[#f4f3f0] to-[#ebe8e3]",
      )}
    >
      {!embedded && (
        <div className="flex items-center gap-3 mb-5">
          <Link
            to="/pro"
            className="inline-flex items-center justify-center w-10 h-10 rounded-xl border border-border/70 bg-card shadow-sm hover:bg-muted/60 transition-colors"
            aria-label="Voltar"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Comunidade</h1>
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">Rede de profissionais Chamô</p>
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
        <div className="flex flex-wrap gap-2 mb-3 items-center">
          <button
            type="button"
            onClick={() => setFeedScope("all")}
            className={cn(
              "px-4 py-2 rounded-full text-xs font-bold transition-all border shadow-sm uppercase tracking-wide",
              feedScope === "all"
                ? "bg-primary text-primary-foreground border-primary shadow-primary/25"
                : "bg-white/95 text-foreground border-border/60 hover:bg-muted/60",
            )}
          >
            Ver todos
          </button>
          <button
            type="button"
            onClick={() => setFeedScope("favorites")}
            className={cn(
              "px-4 py-2 rounded-full text-xs font-bold transition-all border shadow-sm uppercase tracking-wide",
              feedScope === "favorites"
                ? "bg-primary text-primary-foreground border-primary shadow-primary/25"
                : "bg-white/95 text-foreground border-border/60 hover:bg-muted/60",
            )}
          >
            Ver favoritos
          </button>
          {hiddenPostIds.size > 0 ? (
            <button
              type="button"
              onClick={() => setHiddenPostsSheetOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold border border-border/70 bg-muted/40 text-muted-foreground hover:bg-muted/70 transition-colors"
            >
              <EyeOff className="w-3.5 h-3.5" />
              Ocultas ({hiddenPostIds.size})
            </button>
          ) : null}
        </div>
      )}

      {user && undoHidePostId ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/35 px-3 py-2.5 mb-3 text-[13px]">
          <p className="text-muted-foreground leading-snug min-w-0">
            Publicação oculta na tua conta. Podes desfazer agora ou gerir em <strong className="text-foreground">Ocultas</strong>.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 h-8 font-bold text-primary"
            onClick={() => void undoHidePost()}
          >
            Desfazer
          </Button>
        </div>
      ) : null}

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
                <p className="text-[12px] text-muted-foreground leading-snug">
                  Sua publicação fica visível para <span className="font-semibold text-foreground">todos</span> na
                  Comunidade.
                </p>
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
                        playsInline
                        preload="metadata"
                        className="w-full max-h-64 object-contain"
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
      ) : displayPosts.length === 0 && feedScope === "favorites" && !hasPostsFromFavorites ? (
        <div className="rounded-[20px] bg-white border border-border/50 py-14 px-4 text-center shadow-md shadow-black/[0.04]">
          <p className="text-muted-foreground text-sm">Nenhuma publicação dos seus favoritos.</p>
          <p className="text-xs text-muted-foreground mt-2">
            Toque em <strong>Favoritar</strong> no perfil de um profissional para filtrar o feed aqui.
          </p>
        </div>
      ) : displayPosts.length === 0 && posts.length > 0 ? (
        <div className="rounded-[20px] bg-white border border-border/50 py-14 px-4 text-center shadow-md shadow-black/[0.04]">
          <p className="text-muted-foreground text-sm">Nenhuma publicação para mostrar aqui.</p>
          <p className="text-xs text-muted-foreground mt-2">
            Você pode ter ocultado os posts com <strong>Não quero ver isto</strong> ou pode mudar o filtro
            acima.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayPosts.map((post) => {
            const author = authors[post.author_id];
            const sum = reactionSummary[post.id] || {};
            const myR = myReactionByPost[post.id];
            const comments = commentsByPost[post.id] || [];
            const visibleComments = filterVisibleComments(comments, hiddenCommentIds);
            const commentCount = visibleComments.length;
            const sheetOpen = commentsSheetPost?.id === post.id;
            const proMeta = authorProMeta[post.author_id];
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
                    <div className="min-w-0 flex-1 flex items-start justify-between gap-2">
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
                        <p className="text-[11px] text-muted-foreground mt-0.5">{postTimeLabel(post.created_at)}</p>
                      </div>
                      <div className="flex items-start gap-1 shrink-0">
                        {user ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="p-1 rounded-full text-muted-foreground hover:bg-muted transition-colors"
                                aria-label="Opções da publicação"
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              {post.author_id !== user.id ? (
                                <>
                                  <DropdownMenuItem
                                    onClick={() => setReportDialog({ kind: "post", postId: post.id })}
                                  >
                                    Denunciar publicação
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => void hidePostForMe(post.id)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    Não quero ver isto
                                  </DropdownMenuItem>
                                </>
                              ) : (
                                <DropdownMenuItem
                                  onClick={() => void hidePostForMe(post.id)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  Não quero ver isto
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </div>
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
                        key={post.video_url}
                        src={post.video_url}
                        controls
                        playsInline
                        preload="metadata"
                        className="w-full max-h-[min(420px,70vh)] object-contain bg-black"
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

                {(totalRx > 0 || commentCount > 0) && (
                  <div className="px-4 py-2 flex items-center justify-between text-[12px] text-muted-foreground border-t border-border/40 bg-muted/20">
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
                    {commentCount > 0 ? (
                      <button
                        type="button"
                        className="font-medium text-muted-foreground hover:text-foreground hover:underline"
                        onClick={() => setCommentsSheetPost(post)}
                      >
                        {commentCount} comentário{commentCount !== 1 ? "s" : ""}
                      </button>
                    ) : null}
                  </div>
                )}

                <div className="grid grid-cols-3 border-t border-border/40 bg-muted/25 select-none [&_button]:touch-manipulation">
                  <LinkedInLikeControl
                    activeType={myR}
                    onPickReaction={(t) => void setReaction(post.id, t as ReactionType)}
                    onQuickLikeToggle={() => void setReaction(post.id, "like")}
                  />
                  <button
                    type="button"
                    style={{ WebkitUserSelect: "none", userSelect: "none" }}
                    className={cn(
                      "select-none flex flex-col items-center justify-center gap-0.5 py-3.5 text-muted-foreground hover:bg-background/80 active:bg-background active:scale-[0.98] transition-all border-x border-border/35",
                      sheetOpen && "text-primary bg-background/90",
                    )}
                    onClick={() => setCommentsSheetPost(sheetOpen ? null : post)}
                  >
                    <MessageCircle className="w-[21px] h-[21px]" />
                    <span className="text-[11px] font-semibold tracking-tight">Comentar</span>
                  </button>
                  <button
                    type="button"
                    style={{ WebkitUserSelect: "none", userSelect: "none" }}
                    className="select-none flex flex-col items-center justify-center gap-0.5 py-3.5 text-muted-foreground hover:bg-background/80 active:bg-background active:scale-[0.98] transition-all"
                    onClick={() => setSharePost(post)}
                  >
                    <Send className="w-[21px] h-[21px] -rotate-12" />
                    <span className="text-[11px] font-semibold tracking-tight">Compartilhar</span>
                  </button>
                </div>

                {myR ? (
                  <div className="flex items-center gap-2.5 px-3 py-2.5 border-t border-border/35 bg-gradient-to-b from-muted/15 to-muted/5">
                    <div className="w-9 h-9 rounded-full bg-background overflow-hidden shrink-0 flex items-center justify-center ring-1 ring-border/45 shadow-sm">
                      {profile?.avatar_url ? (
                        <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs font-bold text-primary">
                          {(profile?.full_name || "U").slice(0, 1).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setCommentsSheetPost(post)}
                      className="flex-1 text-left rounded-full border border-border/45 bg-background px-4 py-2.5 text-[13px] text-muted-foreground shadow-sm hover:border-border hover:bg-muted/30 transition-colors"
                    >
                      Adicionar comentário…
                    </button>
                  </div>
                ) : null}
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
              Envie no chat para profissionais que estão nos seus <strong>favoritos</strong>. Também pode partilhar o link nas redes.
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

          <div className="px-5 pb-3 shrink-0 border-b border-border/30">
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-2">
                Favoritos
              </p>
              {loadingFavoritesShare ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : favoritesForShare.length === 0 ? (
                <p className="text-[13px] text-muted-foreground py-3 text-center leading-snug">
                  Nenhum favorito ainda. Favorite perfis profissionais para enviar publicações pelo chat — ou use o link para WhatsApp / Instagram.
                </p>
              ) : (
                <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none touch-pan-x">
                  {favoritesForShare.map((r) => (
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
              <p className="text-sm text-muted-foreground py-4 text-center">
                Ninguém encontrado entre os seus favoritos com esse nome.
              </p>
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
            setCommentsSortOrder("relevant");
          }
        }}
      >
        <SheetContent
          side="bottom"
          className="rounded-t-[28px] p-0 gap-0 max-h-[min(88vh,720px)] flex flex-col overflow-hidden border-t border-border/60 shadow-[0_-8px_40px_rgba(0,0,0,0.12)]"
        >
          <div className="mx-auto mt-2.5 mb-1 h-1 w-11 rounded-full bg-muted-foreground/20 shrink-0" aria-hidden />
          <SheetHeader className="px-5 pt-1 pb-0 text-left border-b border-border/40 space-y-0">
            <div className="flex items-center justify-between gap-2 pb-3">
              <SheetTitle className="text-lg font-bold tracking-tight">Comentários</SheetTitle>
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-[13px] font-semibold text-foreground rounded-lg px-2 py-1 hover:bg-muted/80 transition-colors"
                    aria-label="Ordenação dos comentários"
                  >
                    {commentsSortOrder === "relevant" ? "Mais relevantes" : "Mais recentes"}
                    <ChevronDown className="w-4 h-4 opacity-70" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem
                    className="font-medium"
                    onClick={() => setCommentsSortOrder("relevant")}
                  >
                    Mais relevantes (reações)
                  </DropdownMenuItem>
                  <DropdownMenuItem className="font-medium" onClick={() => setCommentsSortOrder("recent")}>
                    Mais recentes (data)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">
            {commentsSheetPost && undoHideId ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/40 px-3 py-2.5 text-[13px]">
                <span className="text-muted-foreground">Comentário oculto para você.</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 h-8 font-bold text-primary hover:text-primary"
                  onClick={() => void undoHideComment()}
                >
                  Desfazer
                </Button>
              </div>
            ) : null}
            {commentsSheetPost && commentsSheetThreads.roots.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">Ainda não há comentários.</p>
            ) : null}
            {commentsSheetPost &&
              sortedSheetRoots.map((root) => {
                const replies = commentsSheetThreads.repliesByParent[root.id] || [];
                const expanded = !!expandedReplyIds[root.id];
                const visibleReplies = expanded ? replies : replies.slice(0, 1);
                const moreReplies = !expanded && replies.length > 1 ? replies.length - 1 : 0;
                return (
                  <div key={root.id} className="pb-2 border-b border-border/30 last:border-0">
                    {renderSheetComment(root, {
                      post: commentsSheetPost,
                      isReply: false,
                      threadRootId: root.id,
                    })}
                    {visibleReplies.map((rep) => (
                      <div key={rep.id}>
                        {renderSheetComment(rep, {
                          post: commentsSheetPost,
                          isReply: true,
                          threadRootId: root.id,
                        })}
                      </div>
                    ))}
                    {moreReplies > 0 ? (
                      <button
                        type="button"
                        className="mt-2 ml-14 text-[13px] font-semibold text-primary hover:underline text-left"
                        onClick={() => setExpandedReplyIds((x) => ({ ...x, [root.id]: true }))}
                      >
                        Ver mais {moreReplies} {moreReplies === 1 ? "resposta" : "respostas"}
                      </button>
                    ) : null}
                    {expanded && replies.length > 1 ? (
                      <button
                        type="button"
                        className="mt-2 ml-14 text-[13px] font-semibold text-muted-foreground hover:text-foreground text-left"
                        onClick={() => setExpandedReplyIds((x) => ({ ...x, [root.id]: false }))}
                      >
                        Ocultar respostas
                      </button>
                    ) : null}
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
                  placeholder="Adicionar comentário…"
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

      <Sheet
        open={hiddenPostsSheetOpen}
        onOpenChange={(o) => {
          setHiddenPostsSheetOpen(o);
        }}
      >
        <SheetContent
          side="bottom"
          className="rounded-t-[28px] p-0 gap-0 max-h-[min(85vh,640px)] flex flex-col overflow-hidden border-t border-border/60"
        >
          <div className="mx-auto mt-2.5 mb-1 h-1 w-11 rounded-full bg-muted-foreground/20 shrink-0" aria-hidden />
          <SheetHeader className="px-5 pt-1 pb-3 text-left border-b border-border/40 space-y-1">
            <SheetTitle className="text-lg font-bold tracking-tight">Publicações ocultas</SheetTitle>
            <SheetDescription className="text-[13px] text-muted-foreground leading-snug">
              Só deixam de aparecer no teu feed — ninguém mais é afetado. Podes voltar a mostrar qualquer uma aqui.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-0">
            {hiddenPostsList.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">Não tens publicações ocultas.</p>
            ) : (
              hiddenPostsList.map((row) => {
                const preview = (row.body || "").trim().slice(0, 120);
                const label =
                  preview.length > 0
                    ? preview + (row.body && row.body.length > 120 ? "…" : "")
                    : "Sem texto";
                return (
                  <div
                    key={row.id}
                    className="flex items-start justify-between gap-3 rounded-xl border border-border/50 bg-muted/25 px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-foreground leading-snug line-clamp-3">{label}</p>
                      {row.created_at ? (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(row.created_at), { addSuffix: true, locale: ptBR })}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 h-8 text-xs font-bold"
                      onClick={() => void undoHidePost(row.id)}
                    >
                      Mostrar
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog
        open={!!reportDialog}
        onOpenChange={(o) => {
          if (!o) {
            setReportDialog(null);
            setReportReason("");
          }
        }}
      >
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {reportDialog?.kind === "post" ? "Denunciar publicação" : "Denunciar comentário"}
            </DialogTitle>
            <DialogDescription>
              A denúncia será analisada pela equipa de suporte. Descreva o motivo (mínimo de 10
              caracteres).
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
            placeholder="Ex.: conteúdo ofensivo, spam…"
            className="min-h-[100px] rounded-xl text-sm"
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => {
                setReportDialog(null);
                setReportReason("");
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="rounded-xl"
              disabled={reportSubmitting || reportReason.trim().length < 10}
              onClick={() => void submitCommunityReport()}
            >
              {reportSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar denúncia"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                    key={fullscreenPost.video_url}
                    src={fullscreenPost.video_url}
                    controls
                    playsInline
                    preload="metadata"
                    className="max-h-full max-w-full object-contain"
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
