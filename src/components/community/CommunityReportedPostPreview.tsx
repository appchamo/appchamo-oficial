import { useEffect, useState } from "react";
import { Loader2, BadgeCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

type Author = {
  user_id: string;
  display_name: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

type Post = {
  id: string;
  author_id: string;
  body: string | null;
  image_url: string | null;
  video_url: string | null;
  created_at: string;
};

function authorLabel(a: Author | null): string {
  if (!a) return "Utilizador";
  const d = (a.display_name || "").trim();
  if (d) return d;
  return (a.full_name || "").trim() || "Utilizador";
}

function postTimeLabel(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR }).toUpperCase();
  } catch {
    return "";
  }
}

interface CommunityReportedPostPreviewProps {
  postId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Pré-visualização só de leitura da publicação denunciada (suporte / admin). */
const CommunityReportedPostPreview = ({ postId, open, onOpenChange }: CommunityReportedPostPreviewProps) => {
  const [loading, setLoading] = useState(false);
  const [post, setPost] = useState<Post | null>(null);
  const [author, setAuthor] = useState<Author | null>(null);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (!open || !postId) {
      setPost(null);
      setAuthor(null);
      setVerified(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const { data: row, error: pe } = await supabase
          .from("community_posts" as any)
          .select("id, author_id, body, image_url, video_url, audience, created_at")
          .eq("id", postId)
          .maybeSingle();
        if (cancelled) return;
        if (pe || !row) {
          setPost(null);
          setAuthor(null);
          setVerified(false);
          return;
        }
        setPost(row as Post);
        const { data: prof } = await supabase
          .from("profiles")
          .select("user_id, display_name, full_name, avatar_url")
          .eq("user_id", (row as Post).author_id)
          .maybeSingle();
        if (cancelled) return;
        setAuthor((prof as Author) || null);
        const { data: pro } = await supabase
          .from("professionals")
          .select("verified")
          .eq("user_id", (row as Post).author_id)
          .maybeSingle();
        if (!cancelled) setVerified(!!(pro as { verified?: boolean } | null)?.verified);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, postId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-2 border-b border-border/60">
          <DialogTitle className="text-base">Publicação denunciada</DialogTitle>
        </DialogHeader>
        <div className="p-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : !post ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Publicação não encontrada ou foi removida.
            </p>
          ) : (
            <article
              className={cn(
                "rounded-[24px] bg-white/98 dark:bg-zinc-900/90 overflow-hidden border border-black/[0.06] dark:border-white/[0.08]",
                "shadow-[0_4px_24px_-4px_rgba(0,0,0,0.08)]",
              )}
            >
              <div className="px-5 pt-5 pb-1">
                <div className="flex gap-3.5 items-start">
                  <div className="w-[52px] h-[52px] rounded-full bg-zinc-200/80 dark:bg-zinc-800 overflow-hidden shrink-0 flex items-center justify-center ring-1 ring-black/[0.06] dark:ring-white/10">
                    {author?.avatar_url ? (
                      <img src={author.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[15px] font-bold text-primary tracking-tight">
                        {authorLabel(author).slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-[17px] font-bold leading-tight tracking-tight text-zinc-900 dark:text-zinc-50 truncate">
                        {authorLabel(author)}
                      </span>
                      {verified ? (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-sky-500/10 text-sky-700 dark:text-sky-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide border border-sky-500/20">
                          <BadgeCheck className="w-3 h-3 shrink-0" aria-hidden />
                          Verificado
                        </span>
                      ) : null}
                    </div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500 tabular-nums">
                      {postTimeLabel(post.created_at)}
                    </p>
                  </div>
                </div>

                {post.body ? (
                  <div className="mt-4 text-[15px] text-zinc-800 dark:text-zinc-100 leading-[1.55] whitespace-pre-line">
                    {post.body}
                  </div>
                ) : null}

                {post.image_url ? (
                  <div className="mt-4 rounded-[18px] overflow-hidden ring-1 ring-black/[0.07] dark:ring-white/10">
                    <img
                      src={post.image_url}
                      alt=""
                      className="w-full max-h-[min(440px,60vh)] object-cover bg-zinc-100 dark:bg-zinc-800"
                    />
                  </div>
                ) : null}

                {post.video_url ? (
                  <div className="mt-4 rounded-[18px] overflow-hidden ring-1 ring-black/[0.07]">
                    <video src={post.video_url} controls className="w-full max-h-[min(440px,60vh)] bg-black" />
                  </div>
                ) : null}
              </div>
            </article>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CommunityReportedPostPreview;
