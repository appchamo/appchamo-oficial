import { useEffect, useState } from "react";
import { Heart, UserPlus, Loader2, UserRoundCheck, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import {
  acceptFriendRequest,
  declineOrCancelFriendRequest,
  getFriendRelationshipState,
  sendFriendRequest,
  type FriendRelationshipState,
} from "@/lib/chamoFriends";

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
  const [friendRel, setFriendRel] = useState<FriendRelationshipState | null>(null);
  const [friendBusy, setFriendBusy] = useState(false);

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

        if (user?.id && userId && user.id !== userId) {
          try {
            const rel = await getFriendRelationshipState(supabase, user.id, userId);
            if (!cancelled) setFriendRel(rel);
          } catch {
            if (!cancelled) setFriendRel({ status: "none" });
          }
        } else if (!cancelled) {
          setFriendRel(null);
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

  const friendToast = (r: string) => {
    switch (r) {
      case "request_sent":
        toast({ title: "Pedido enviado", description: "A pessoa precisa aceitar." });
        break;
      case "became_friends":
        toast({ title: "Vocês são amigos!" });
        break;
      case "already_friends":
        toast({ title: "Já são amigos" });
        break;
      case "request_already_pending":
        toast({ title: "Pedido já enviado" });
        break;
      default:
        toast({ title: "Concluído" });
    }
  };

  const handleAddFriend = async () => {
    if (!me || !userId || !friendRel || friendRel.status !== "none") return;
    setFriendBusy(true);
    try {
      const r = await sendFriendRequest(supabase, userId);
      friendToast(r);
      setFriendRel(await getFriendRelationshipState(supabase, me, userId));
    } catch {
      toast({ title: "Não foi possível enviar", variant: "destructive" });
    } finally {
      setFriendBusy(false);
    }
  };

  const handleAcceptFriend = async () => {
    if (!me || !friendRel || friendRel.status !== "incoming_pending") return;
    setFriendBusy(true);
    try {
      await acceptFriendRequest(supabase, friendRel.requestId);
      toast({ title: "Amizade aceita!" });
      setFriendRel(await getFriendRelationshipState(supabase, me, userId!));
    } catch {
      toast({ title: "Não foi possível aceitar", variant: "destructive" });
    } finally {
      setFriendBusy(false);
    }
  };

  const handleDeclineOrCancelFriend = async () => {
    if (!me || !friendRel || (friendRel.status !== "incoming_pending" && friendRel.status !== "outgoing_pending")) return;
    setFriendBusy(true);
    try {
      await declineOrCancelFriendRequest(supabase, friendRel.requestId);
      toast({
        title: friendRel.status === "incoming_pending" ? "Recusado" : "Pedido cancelado",
      });
      setFriendRel(await getFriendRelationshipState(supabase, me, userId!));
    } catch {
      toast({ title: "Não foi possível atualizar", variant: "destructive" });
    } finally {
      setFriendBusy(false);
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
            {me && userId && userId !== me && friendRel && friendRel.status !== "self" ? (
              <div className="w-full space-y-2 border-t border-border/60 pt-3 mt-1">
                {friendRel.status === "none" ? (
                  <Button
                    type="button"
                    className="rounded-xl font-bold w-full gap-2 bg-primary/12 text-primary border border-primary/35 hover:bg-primary/18"
                    disabled={friendBusy}
                    onClick={() => void handleAddFriend()}
                  >
                    {friendBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                    Adicionar aos amigos
                  </Button>
                ) : null}
                {friendRel.status === "outgoing_pending" ? (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 space-y-2">
                    <p className="text-[11px] font-semibold text-amber-900 dark:text-amber-100 flex items-center gap-1.5">
                      <Send className="w-3.5 h-3.5 shrink-0" />
                      Pedido enviado — aguardando
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full h-8 text-xs"
                      disabled={friendBusy}
                      onClick={() => void handleDeclineOrCancelFriend()}
                    >
                      Cancelar pedido
                    </Button>
                  </div>
                ) : null}
                {friendRel.status === "incoming_pending" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl font-bold text-xs"
                      disabled={friendBusy}
                      onClick={() => void handleDeclineOrCancelFriend()}
                    >
                      Recusar
                    </Button>
                    <Button
                      type="button"
                      className="rounded-xl font-bold text-xs gap-1"
                      disabled={friendBusy}
                      onClick={() => void handleAcceptFriend()}
                    >
                      {friendBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserRoundCheck className="w-4 h-4" />}
                      Aceitar
                    </Button>
                  </div>
                ) : null}
                {friendRel.status === "friends" ? (
                  <div className="flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/8 py-2 text-xs font-bold text-primary">
                    <UserRoundCheck className="w-4 h-4" />
                    Amigos no Chamô
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default UserPreviewModal;
