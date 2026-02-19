import AdminLayout from "@/components/AdminLayout";
import { Search, Star, Trash2, Eye, MessageSquare } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { translateError } from "@/lib/errorMessages";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";

interface UserProfile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  user_type: string;
  address_city: string | null;
  address_state: string | null;
  created_at: string;
  professional_id: string | null;
  category_name: string | null;
  profession_name: string | null;
  rating: number;
  total_reviews: number;
  verified: boolean;
}

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  client_name: string;
}

const AdminProfiles = () => {
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [deleteReviewId, setDeleteReviewId] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id, user_id, full_name, email, avatar_url, user_type, address_city, address_state, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Erro", description: translateError(error.message), variant: "destructive" });
      setLoading(false);
      return;
    }

    if (!profiles || profiles.length === 0) {
      setUsers([]);
      setLoading(false);
      return;
    }

    const userIds = profiles.map(p => p.user_id);

    const [prosRes, catsRes, profsRes] = await Promise.all([
      supabase.from("professionals").select("id, user_id, category_id, profession_id, rating, total_reviews, verified").in("user_id", userIds),
      supabase.from("categories").select("id, name"),
      supabase.from("professions").select("id, name"),
    ]);

    const proMap = new Map((prosRes.data || []).map(p => [p.user_id, p]));
    const catMap = new Map((catsRes.data || []).map(c => [c.id, c.name]));
    const profMap = new Map((profsRes.data || []).map(p => [p.id, p.name]));

    setUsers(profiles.map(p => {
      const pro = proMap.get(p.user_id);
      return {
        ...p,
        professional_id: pro?.id || null,
        category_name: pro?.category_id ? catMap.get(pro.category_id) || null : null,
        profession_name: pro?.profession_id ? profMap.get(pro.profession_id) || null : null,
        rating: pro?.rating || 0,
        total_reviews: pro?.total_reviews || 0,
        verified: pro?.verified || false,
      };
    }));
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    return (
      u.full_name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.category_name || "").toLowerCase().includes(q) ||
      (u.profession_name || "").toLowerCase().includes(q)
    );
  });

  const openProfile = async (user: UserProfile) => {
    setSelectedUser(user);
    setReviewsLoading(true);

    if (user.professional_id) {
      const { data } = await supabase
        .from("reviews")
        .select("id, rating, comment, created_at, client_id")
        .eq("professional_id", user.professional_id)
        .order("created_at", { ascending: false });

      if (data && data.length > 0) {
        const clientIds = [...new Set(data.map(r => r.client_id))];
        const { data: profiles } = await supabase
          .from("profiles_public" as any)
          .select("user_id, full_name")
          .in("user_id", clientIds) as { data: { user_id: string; full_name: string }[] | null };
        const nameMap = new Map((profiles || []).map(p => [p.user_id, p.full_name]));
        setReviews(data.map(r => ({ ...r, client_name: nameMap.get(r.client_id) || "Cliente" })));
      } else {
        setReviews([]);
      }
    } else {
      setReviews([]);
    }
    setReviewsLoading(false);
  };

  const handleDeleteReview = async () => {
    if (!deleteReviewId || !selectedUser?.professional_id) return;
    await supabase.from("reviews").delete().eq("id", deleteReviewId);

    // Log action
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase.from("admin_logs").insert({
        admin_user_id: session.user.id,
        action: "delete_review",
        target_type: "review",
        target_id: deleteReviewId,
      });
    }

    // Recalculate pro stats
    const { data: remaining } = await supabase.from("reviews").select("rating").eq("professional_id", selectedUser.professional_id);
    const total = remaining?.length || 0;
    const avg = total > 0 ? remaining!.reduce((sum, r) => sum + r.rating, 0) / total : 0;
    await supabase.from("professionals").update({ total_reviews: total, rating: Math.round(avg * 10) / 10 }).eq("id", selectedUser.professional_id);

    toast({ title: "Comentário removido!" });
    setReviews(prev => prev.filter(r => r.id !== deleteReviewId));
    setDeleteReviewId(null);
    fetchUsers();
  };

  const typeLabel = (t: string) => t === "company" ? "Empresa" : t === "professional" ? "Profissional" : "Cliente";

  return (
    <AdminLayout title="Ver Perfis de Usuários">
      <div className="flex items-center gap-2 mb-4">
        <div className="flex-1 flex items-center gap-2 border rounded-xl px-3 py-2.5 bg-card focus-within:ring-2 focus-within:ring-primary/30">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, email, categoria ou profissão..."
            className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="bg-card border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium text-muted-foreground">Nome</th>
                  <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Tipo</th>
                  <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Categoria / Profissão</th>
                  <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Avaliação</th>
                  <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">Comentários</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(user => (
                  <tr key={user.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="p-3">
                      <p className="font-medium text-foreground text-xs md:text-sm">{user.full_name || "—"}</p>
                      <p className="text-[10px] text-muted-foreground">{user.email}</p>
                    </td>
                    <td className="p-3 hidden md:table-cell">
                      <Badge variant="secondary" className="text-[10px]">{typeLabel(user.user_type)}</Badge>
                    </td>
                    <td className="p-3 hidden md:table-cell text-xs text-muted-foreground">
                      {user.category_name || user.profession_name ? (
                        <span>{user.category_name}{user.profession_name ? ` · ${user.profession_name}` : ""}</span>
                      ) : "—"}
                    </td>
                    <td className="p-3 hidden md:table-cell">
                      {user.professional_id ? (
                        <span className="flex items-center gap-1 text-xs">
                          <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                          {user.rating.toFixed(1)}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="p-3 hidden md:table-cell">
                      {user.professional_id ? (
                        <span className="text-xs text-muted-foreground">{user.total_reviews}</span>
                      ) : "—"}
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => openProfile(user)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" /> Ver perfil
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground text-sm">Nenhum usuário encontrado</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Profile & Reviews Dialog */}
      <Dialog open={!!selectedUser} onOpenChange={o => !o && setSelectedUser(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Perfil — {selectedUser?.full_name}
              {selectedUser?.verified && <Badge variant="default" className="text-[10px]">Verificado</Badge>}
            </DialogTitle>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-4">
              {/* User info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Email</p>
                  <p className="font-medium text-foreground">{selectedUser.email}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Tipo</p>
                  <p className="font-medium text-foreground">{typeLabel(selectedUser.user_type)}</p>
                </div>
                {selectedUser.address_city && (
                  <div>
                    <p className="text-muted-foreground text-xs">Localização</p>
                    <p className="font-medium text-foreground">{selectedUser.address_city}{selectedUser.address_state ? `, ${selectedUser.address_state}` : ""}</p>
                  </div>
                )}
                {selectedUser.category_name && (
                  <div>
                    <p className="text-muted-foreground text-xs">Categoria</p>
                    <p className="font-medium text-foreground">{selectedUser.category_name}</p>
                  </div>
                )}
                {selectedUser.profession_name && (
                  <div>
                    <p className="text-muted-foreground text-xs">Profissão</p>
                    <p className="font-medium text-foreground">{selectedUser.profession_name}</p>
                  </div>
                )}
                {selectedUser.professional_id && (
                  <div>
                    <p className="text-muted-foreground text-xs">Avaliação</p>
                    <p className="font-medium text-foreground flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                      {selectedUser.rating.toFixed(1)} ({selectedUser.total_reviews} avaliações)
                    </p>
                  </div>
                )}
              </div>

              {/* Reviews section */}
              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                  <MessageSquare className="w-4 h-4" />
                  Comentários / Avaliações
                </h3>

                {reviewsLoading ? (
                  <div className="flex justify-center py-6">
                    <div className="animate-spin w-5 h-5 border-3 border-primary border-t-transparent rounded-full" />
                  </div>
                ) : !selectedUser.professional_id ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Este usuário não é profissional, não possui avaliações.</p>
                ) : reviews.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhuma avaliação encontrada.</p>
                ) : (
                  <div className="space-y-2.5">
                    {reviews.map(review => (
                      <div key={review.id} className="border rounded-xl p-3 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-foreground">{review.client_name}</span>
                            <span className="flex items-center gap-0.5 text-[10px] text-amber-600">
                              <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />
                              {review.rating}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(review.created_at).toLocaleDateString("pt-BR")}
                            </span>
                          </div>
                          {review.comment && (
                            <p className="text-xs text-muted-foreground">{review.comment}</p>
                          )}
                        </div>
                        <button
                          onClick={() => setDeleteReviewId(review.id)}
                          className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive transition-colors flex-shrink-0"
                          title="Remover comentário"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Review Confirmation */}
      <AlertDialog open={!!deleteReviewId} onOpenChange={o => !o && setDeleteReviewId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover comentário?</AlertDialogTitle>
            <AlertDialogDescription>O comentário será removido permanentemente e a nota do profissional será recalculada.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteReview} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default AdminProfiles;
