import { useEffect, useState } from "react";
import { Heart, UserPlus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const getOptimizedAvatar = (url: string | null | undefined) => {
  if (!url) return undefined;
  if (url.includes("supabase.co/storage/v1/object/public/")) {
    return url.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/") +
      "?width=96&height=96&resize=cover&quality=62";
  }
  return url;
};

type UserPreviewModalProps = {
  userId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Perfil reduzido (cliente sem página pública) — mesmo padrão do modal no chat. */
const UserPreviewModal = ({ userId, open, onOpenChange }: UserPreviewModalProps) => {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [proId, setProId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [socialBusy, setSocialBusy] = useState(false);
  const [following, setFollowing] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [me, setMe] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled) return;
        setMe(user?.id ?? null);
        const { data: prof } = await supabase.from("profiles_public" as any).select("full_name, avatar_url").eq("user_id", userId).maybeSingle();
        const { data: proRow } = await supabase.from("professionals").select("id").eq("user_id", userId).maybeSingle();
        if (cancelled) return;
        setName((prof as { full_name?: string } | null)?.full_name?.trim() || "Usuário");
        setAvatar((prof as { avatar_url?: string | null } | null)?.avatar_url ?? null);
        const pid = (proRow as { id?: string } | null)?.id ?? null;
        setProId(pid);
        if (pid && user?.id) {
          const [fo, fa] = await Promise.all([
            supabase.from("professional_follows" as any).select("id").eq("user_id", user.id).eq("professional_id", pid).maybeSingle(),
            supabase.from("professional_favorites" as any).select("id").eq("user_id", user.id).eq("professional_id", pid).maybeSingle(),
          ]);
          if (cancelled) return;
          setFollowing(!!fo.data);
          setFavorite(!!fa.data);
        } else if (user?.id && userId !== user.id) {
          const { data: ufo } = await supabase
            .from("user_follows" as any)
            .select("follower_user_id")
            .eq("follower_user_id", user.id)
            .eq("followed_user_id", userId)
            .maybeSingle();
          if (cancelled) return;
          setFollowing(!!ufo);
          setFavorite(false);
        } else {
          setFollowing(false);
          setFavorite(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";

  const toggleFollow = async () => {
    if (!me || !userId || userId === me) return;
    setSocialBusy(true);
    try {
      if (proId) {
        if (following) {
          const { error } = await supabase.from("professional_follows" as any).delete().eq("user_id", me).eq("professional_id", proId);
          if (error) throw error;
          setFollowing(false);
        } else {
          const { error } = await supabase.from("professional_follows" as any).insert({ user_id: me, professional_id: proId });
          if (error) throw error;
          setFollowing(true);
        }
      } else {
        if (following) {
          const { error } = await supabase
            .from("user_follows" as any)
            .delete()
            .eq("follower_user_id", me)
            .eq("followed_user_id", userId);
          if (error) throw error;
          setFollowing(false);
        } else {
          const { error } = await supabase
            .from("user_follows" as any)
            .insert({ follower_user_id: me, followed_user_id: userId });
          if (error) throw error;
          setFollowing(true);
        }
      }
    } catch {
      toast({ title: "Não foi possível atualizar", variant: "destructive" });
    } finally {
      setSocialBusy(false);
    }
  };

  const toggleFavorite = async () => {
    if (!me || !proId) return;
    setSocialBusy(true);
    try {
      if (favorite) {
        const { error } = await supabase.from("professional_favorites" as any).delete().eq("user_id", me).eq("professional_id", proId);
        if (error) throw error;
        setFavorite(false);
      } else {
        const { error } = await supabase.from("professional_favorites" as any).insert({ user_id: me, professional_id: proId });
        if (error) throw error;
        setFavorite(true);
      }
    } catch {
      toast({ title: "Não foi possível atualizar", variant: "destructive" });
    } finally {
      setSocialBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-center">{loading ? "…" : name}</DialogTitle>
          <DialogDescription className="text-center">
            {proId ? "Perfil profissional" : "Cliente no Chamô"}
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="relative">
              {avatar ? (
                <img src={getOptimizedAvatar(avatar)} alt="" className="w-24 h-24 rounded-full object-cover border-4 border-muted shadow-md" />
              ) : (
                <div className="w-24 h-24 rounded-full bg-primary/15 flex items-center justify-center text-2xl font-bold text-primary border-4 border-muted">
                  {initials}
                </div>
              )}
            </div>
            {proId ? (
              <DialogFooter className="flex-col sm:flex-col gap-2 w-full">
                <div className="grid grid-cols-2 gap-2 w-full">
                  <Button
                    type="button"
                    variant={following ? "secondary" : "outline"}
                    className="rounded-xl font-semibold gap-2"
                    disabled={socialBusy}
                    onClick={() => void toggleFollow()}
                  >
                    <UserPlus className={`w-4 h-4 ${following ? "text-primary" : ""}`} />
                    {following ? "Seguindo" : "Seguir"}
                  </Button>
                  <Button
                    type="button"
                    variant={favorite ? "secondary" : "outline"}
                    className="rounded-xl font-semibold gap-2"
                    disabled={socialBusy}
                    onClick={() => void toggleFavorite()}
                  >
                    <Heart className={`w-4 h-4 ${favorite ? "fill-rose-500 text-rose-500" : ""}`} />
                    {favorite ? "Favorito" : "Favoritar"}
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="rounded-xl w-full"
                  onClick={() => {
                    onOpenChange(false);
                    navigate(`/professional/${encodeURIComponent(proId)}`);
                  }}
                >
                  Abrir perfil completo
                </Button>
              </DialogFooter>
            ) : me && userId && userId !== me ? (
              <DialogFooter className="flex-col sm:flex-col gap-2 w-full">
                <Button
                  type="button"
                  variant={following ? "secondary" : "outline"}
                  className="rounded-xl font-semibold gap-2 w-full"
                  disabled={socialBusy}
                  onClick={() => void toggleFollow()}
                >
                  <UserPlus className={`w-4 h-4 ${following ? "text-primary" : ""}`} />
                  {following ? "Seguindo" : "Seguir"}
                </Button>
              </DialogFooter>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default UserPreviewModal;
