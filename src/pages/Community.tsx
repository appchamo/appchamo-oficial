import { useCallback, useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

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

const Community = () => {
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
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentSubmitting, setCommentSubmitting] = useState<string | null>(null);

  const [sharePost, setSharePost] = useState<PostRow | null>(null);
  const [shareQuery, setShareQuery] = useState("");
  const [shareResults, setShareResults] = useState<AuthorRow[]>([]);
  const [shareSearching, setShareSearching] = useState(false);
  const [shareSending, setShareSending] = useState(false);

  const canPost =
    profile?.user_type === "professional" || profile?.user_type === "company";

  const loadFeed = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
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
        link: "/pro/comunidade",
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

  const commentAuthor = (uid: string) => commentAuthors[uid] || authors[uid];

  return (
    <AppLayout>
      <main className="max-w-lg mx-auto px-4 py-4 pb-24">
        <div className="flex items-center gap-3 mb-4">
          <Link
            to="/pro"
            className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-muted hover:bg-muted/80 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-foreground">Comunidade</h1>
            <p className="text-xs text-muted-foreground">Feed de profissionais no Chamô</p>
          </div>
        </div>

        {canPost && (
          <div className="rounded-2xl border bg-card p-4 shadow-sm mb-6 space-y-3">
            <Textarea
              placeholder="Compartilhe uma ideia, conquista ou dica…"
              value={composerText}
              onChange={(e) => setComposerText(e.target.value)}
              className="min-h-[88px] rounded-xl resize-none"
              data-tab-swipe-ignore
            />
            {composerPreview && (
              <div className="relative rounded-xl overflow-hidden border">
                <img src={composerPreview} alt="" className="w-full max-h-56 object-cover" />
                <button
                  type="button"
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center"
                  onClick={() => setComposerFile(null)}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <label className="inline-flex items-center gap-2 text-sm text-primary cursor-pointer font-medium">
                <ImagePlus className="w-4 h-4" />
                Foto
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => setComposerFile(e.target.files?.[0] || null)}
                />
              </label>
              <Button
                type="button"
                className="rounded-xl"
                disabled={publishing || (!composerText.trim() && !composerFile)}
                onClick={publishPost}
              >
                {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span className="ml-2">Publicar</span>
              </Button>
            </div>
          </div>
        )}

        {!canPost && (
          <p className="text-sm text-muted-foreground mb-4 rounded-xl border border-dashed bg-muted/30 px-3 py-2">
            Apenas perfis <strong>profissional</strong> ou <strong>empresa</strong> publicam aqui. Você pode curtir,
            comentar e receber compartilhamentos.
          </p>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : posts.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">Nenhuma publicação ainda. Seja o primeiro!</p>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => {
              const author = authors[post.author_id];
              const sum = reactionSummary[post.id] || {};
              const myR = myReactionByPost[post.id];
              const comments = commentsByPost[post.id] || [];
              const open = expandedPostId === post.id;

              return (
                <article
                  key={post.id}
                  className="rounded-2xl border bg-card shadow-sm overflow-hidden"
                >
                  <div className="p-4 flex gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0 overflow-hidden">
                      {author?.avatar_url ? (
                        <img src={author.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-sm font-bold text-primary">
                          {authorLabel(author).slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm">{authorLabel(author)}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(post.created_at).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      {post.body ? (
                        <p className="text-sm text-foreground mt-2 whitespace-pre-wrap">{post.body}</p>
                      ) : null}
                      {post.image_url ? (
                        <img
                          src={post.image_url}
                          alt=""
                          className="mt-3 rounded-xl w-full max-h-80 object-cover border"
                        />
                      ) : null}
                    </div>
                  </div>

                  <div className="px-4 pb-2 flex flex-wrap gap-1.5 border-t border-border/60 pt-3">
                    {REACTIONS.map(({ type, label, Icon }) => {
                      const n = sum[type] || 0;
                      const active = myR === type;
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setReaction(post.id, type)}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors",
                            active
                              ? "bg-primary/15 border-primary text-primary"
                              : "bg-muted/50 border-transparent text-muted-foreground hover:bg-muted",
                          )}
                        >
                          <Icon className={cn("w-3.5 h-3.5", type === "love" && active && "fill-primary")} />
                          {label}
                          {n > 0 && <span className="opacity-80">({n})</span>}
                        </button>
                      );
                    })}
                  </div>

                  <div className="px-4 pb-3 flex items-center gap-4 border-b border-border/40">
                    <button
                      type="button"
                      className="text-xs font-medium text-muted-foreground flex items-center gap-1 hover:text-foreground"
                      onClick={() => setExpandedPostId(open ? null : post.id)}
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      Comentários ({comments.length})
                    </button>
                    <button
                      type="button"
                      className="text-xs font-medium text-muted-foreground flex items-center gap-1 hover:text-foreground"
                      onClick={() => setSharePost(post)}
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      Compartilhar
                    </button>
                  </div>

                  {open && (
                    <div className="px-4 py-3 bg-muted/20 space-y-3">
                      {comments.map((c) => {
                        const ca = commentAuthor(c.user_id);
                        const canDel = user && (c.user_id === user.id || post.author_id === user.id);
                        return (
                          <div key={c.id} className="flex gap-2 text-sm">
                            <div className="flex-1 min-w-0">
                              <span className="font-medium">{authorLabel(ca)}</span>
                              <span className="text-muted-foreground text-xs ml-2">
                                {new Date(c.created_at).toLocaleString("pt-BR", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                              <p className="text-foreground mt-0.5 whitespace-pre-wrap">{c.body}</p>
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
                          placeholder="Escreva um comentário…"
                          value={commentDrafts[post.id] || ""}
                          onChange={(e) =>
                            setCommentDrafts((d) => ({ ...d, [post.id]: e.target.value }))
                          }
                          className="min-h-[52px] rounded-xl text-sm flex-1 resize-none"
                          data-tab-swipe-ignore
                        />
                        <Button
                          type="button"
                          size="icon"
                          className="rounded-xl shrink-0 self-end"
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

        <Dialog open={!!sharePost} onOpenChange={(o) => !o && setSharePost(null)}>
          <DialogContent className="rounded-2xl max-w-md">
            <DialogHeader>
              <DialogTitle>Encaminhar para…</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              A pessoa recebe uma notificação no Chamô com um link para a Comunidade.
            </p>
            <Input
              placeholder="Buscar por nome…"
              value={shareQuery}
              onChange={(e) => setShareQuery(e.target.value)}
              className="rounded-xl"
            />
            <div className="max-h-56 overflow-y-auto space-y-1">
              {shareSearching && (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              )}
              {!shareSearching &&
                shareResults.map((r) => (
                  <button
                    key={r.user_id}
                    type="button"
                    className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-muted text-left"
                    disabled={shareSending}
                    onClick={() => sendShare(r.user_id)}
                  >
                    <div className="w-9 h-9 rounded-full bg-muted overflow-hidden flex items-center justify-center text-xs font-bold">
                      {r.avatar_url ? (
                        <img src={r.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        authorLabel(r).slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <span className="font-medium text-sm">{authorLabel(r)}</span>
                  </button>
                ))}
            </div>
            <DialogFooter>
              <Button variant="outline" className="rounded-xl" onClick={() => setSharePost(null)}>
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </AppLayout>
  );
};

export default Community;
