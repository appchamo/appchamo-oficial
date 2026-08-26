import AdminLayout from "@/components/AdminLayout";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { MessagesSquare, Trash2, Pencil, Search, Loader2, ImageIcon, Video } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface PostRow {
  id: string; author_id: string; body: string | null; image_url: string | null;
  video_url: string | null; created_at: string; audience: string | null;
}

// deno-lint-ignore no-explicit-any
const mediaUrl = (u: string | null): string | null => {
  if (!u) return null;
  if (u.startsWith("http")) return u;
  return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/uploads/${u}`;
};

const AdminComunidade = () => {
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [authors, setAuthors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [editPost, setEditPost] = useState<PostRow | null>(null);
  const [editBody, setEditBody] = useState("");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("community_posts" as any)
      .select("id, author_id, body, image_url, video_url, created_at, audience")
      .order("created_at", { ascending: false })
      .limit(500);
    const list = ((data as unknown) as PostRow[]) || [];
    setPosts(list);
    const ids = [...new Set(list.map((p) => p.author_id).filter(Boolean))];
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", ids);
      // deno-lint-ignore no-explicit-any
      setAuthors(Object.fromEntries(((profs || []) as any[]).map((p) => [p.user_id, (p.full_name || "").trim() || "Usuário"])));
    }
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return posts;
    return posts.filter((p) => (p.body || "").toLowerCase().includes(t) || (authors[p.author_id] || "").toLowerCase().includes(t));
  }, [posts, q, authors]);

  const del = async (id: string) => {
    setBusy(id);
    const { error } = await supabase.from("community_posts" as any).delete().eq("id", id);
    setBusy(null);
    if (error) { toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" }); return; }
    setPosts((prev) => prev.filter((x) => x.id !== id));
    setConfirmDel(null);
    toast({ title: "Post excluído." });
  };

  const saveEdit = async () => {
    if (!editPost) return;
    setBusy(editPost.id);
    const { error } = await supabase.from("community_posts" as any).update({ body: editBody }).eq("id", editPost.id);
    setBusy(null);
    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return; }
    setPosts((prev) => prev.map((x) => (x.id === editPost.id ? { ...x, body: editBody } : x)));
    setEditPost(null);
    toast({ title: "Post atualizado." });
  };

  return (
    <AdminLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5">
        <h1 className="text-xl font-bold mb-1 flex items-center gap-2"><MessagesSquare className="w-6 h-6 text-primary" /> Comunidade</h1>
        <p className="text-sm text-muted-foreground mb-4">Modere os posts da comunidade · {posts.length} carregados.</p>
        <div className="flex items-center gap-2 border rounded-xl px-3 py-2.5 bg-card mb-4">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por texto ou autor" className="flex-1 bg-transparent text-sm outline-none" />
        </div>
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Nenhum post encontrado.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((p) => {
              const img = mediaUrl(p.image_url);
              return (
                <div key={p.id} className="border rounded-2xl bg-card p-4 flex gap-3">
                  {img ? (
                    <img src={img} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{authors[p.author_id] || "Usuário"}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(p.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      {p.image_url ? <span className="ml-2 inline-flex items-center gap-0.5"><ImageIcon className="w-3 h-3" /> foto</span> : null}
                      {p.video_url ? <span className="ml-2 inline-flex items-center gap-0.5"><Video className="w-3 h-3" /> vídeo</span> : null}
                    </p>
                    {p.body ? <p className="text-sm text-foreground mt-1.5 whitespace-pre-wrap line-clamp-4">{p.body}</p> : <p className="text-sm text-muted-foreground mt-1.5 italic">(sem texto)</p>}
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => { setEditPost(p); setEditBody(p.body || ""); }} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted/60">
                        <Pencil className="w-3.5 h-3.5" /> Editar texto
                      </button>
                      {confirmDel === p.id ? (
                        <div className="flex gap-2">
                          <button onClick={() => setConfirmDel(null)} className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted/60">Cancelar</button>
                          <button onClick={() => del(p.id)} disabled={busy === p.id} className="rounded-lg bg-destructive text-destructive-foreground px-3 py-1.5 text-xs font-semibold">{busy === p.id ? "..." : "Confirmar exclusão"}</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDel(p.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 text-destructive px-3 py-1.5 text-xs font-semibold hover:bg-destructive/5">
                          <Trash2 className="w-3.5 h-3.5" /> Excluir
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Dialog open={!!editPost} onOpenChange={(o) => !o && setEditPost(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Editar post</DialogTitle></DialogHeader>
            <textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              rows={6}
              className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
            <button onClick={() => void saveEdit()} disabled={busy === editPost?.id} className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 disabled:opacity-50">
              {busy === editPost?.id ? "Salvando..." : "Salvar"}
            </button>
          </DialogContent>
        </Dialog>
      </main>
    </AdminLayout>
  );
};

export default AdminComunidade;
