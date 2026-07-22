import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  MessageSquare,
  User,
  BadgeCheck,
  Star,
  XCircle,
} from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { startClientChatFromOpenRequest } from "@/lib/openRequestClientChat";
import { cn } from "@/lib/utils";

type RequestRow = {
  id: string;
  description: string;
  urgency: string;
  status: string;
  city: string;
  state: string;
  neighborhood: string | null;
  created_at: string;
  max_professional_interests: number;
  categories: { name: string } | null;
};

type InterestRow = {
  id: string;
  created_at: string;
  professional_id: string;
  professionals: {
    id: string;
    user_id: string;
    slug: string | null;
    verified: boolean;
    rating: number;
    total_reviews: number;
  } | null;
};

const urgencyLabel = (u: string) => {
  if (u === "now") return "Agora";
  if (u === "today") return "Hoje";
  if (u === "flexible") return "Flexível";
  return u;
};

const statusLabel = (s: string) => {
  if (s === "open") return "Aberto";
  if (s === "closed") return "Encerrado";
  if (s === "filled") return "Atendido";
  return s;
};

const ClientOpenRequestDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [row, setRow] = useState<RequestRow | null>(null);
  const [interests, setInterests] = useState<InterestRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { full_name: string | null; avatar_url: string | null }>>({});
  const [interestCount, setInterestCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [chattingId, setChattingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id || !id) return;
    setLoading(true);
    const { data: req, error: reqErr } = await supabase
      .from("open_service_requests")
      .select(
        "id, description, urgency, status, city, state, neighborhood, created_at, max_professional_interests, categories(name)",
      )
      .eq("id", id)
      .eq("client_id", user.id)
      .maybeSingle();

    if (reqErr || !req) {
      setRow(null);
      setInterests([]);
      setLoading(false);
      return;
    }
    setRow(req as RequestRow);

    const { data: ints, error: intErr } = await supabase
      .from("open_service_request_interests")
      .select(
        "id, created_at, professional_id, professionals(id, user_id, slug, verified, rating, total_reviews)",
      )
      .eq("open_request_id", id)
      .order("created_at", { ascending: true });

    if (intErr) {
      setInterests([]);
      setInterestCount(0);
    } else {
      const list = (ints as InterestRow[]) || [];
      setInterests(list);
      setInterestCount(list.length);
      const uids = [...new Set(list.map((i) => i.professionals?.user_id).filter(Boolean) as string[])];
      if (uids.length) {
        const { data: pubs } = await supabase
          .from("profiles_public" as never)
          .select("user_id, full_name, avatar_url")
          .in("user_id", uids);
        const map: Record<string, { full_name: string | null; avatar_url: string | null }> = {};
        for (const p of (pubs as { user_id: string; full_name: string | null; avatar_url: string | null }[]) || []) {
          map[p.user_id] = { full_name: p.full_name, avatar_url: p.avatar_url };
        }
        setProfiles(map);
      } else {
        setProfiles({});
      }
    }
    setLoading(false);
  }, [user?.id, id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const h = () => void load();
    window.addEventListener("chamo-open-requests-changed", h);
    return () => window.removeEventListener("chamo-open-requests-changed", h);
  }, [load]);

  const handleCloseRequest = async () => {
    if (!user?.id || !id) return;
    setClosing(true);
    const { error } = await supabase
      .from("open_service_requests")
      .update({ status: "closed" })
      .eq("id", id)
      .eq("client_id", user.id);
    setClosing(false);
    setCloseOpen(false);
    if (error) {
      toast({ title: "Não foi possível encerrar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Pedido encerrado" });
    try {
      window.dispatchEvent(new CustomEvent("chamo-open-requests-changed"));
    } catch {
      /* ignore */
    }
    void load();
  };

  const handleChat = async (professionalRowId: string) => {
    if (!user?.id || !id || !row) return;
    setChattingId(professionalRowId);
    const r = await startClientChatFromOpenRequest({
      clientUserId: user.id,
      professionalRowId,
      openRequestId: id,
      openRequestDescription: row.description,
      markFilled: false, // não fecha o pedido: o cliente pode falar com vários e escolher
    });
    setChattingId(null);
    if (!r.ok) {
      toast({ title: "Erro ao abrir chat", description: r.message, variant: "destructive" });
      return;
    }
    toast({ title: "Chat iniciado!" });
    navigate(`/messages/${r.serviceRequestId}`);
  };

  const proProfileLink = (p: NonNullable<InterestRow["professionals"]>) => {
    const key = p.slug?.trim() || p.id;
    return `/pro/${encodeURIComponent(key)}`;
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-20 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (!row) {
    return (
      <AppLayout>
        <div className="max-w-screen-lg mx-auto px-4 py-8 text-center">
          <p className="text-muted-foreground mb-4">Pedido não encontrado.</p>
          <Button asChild variant="outline">
            <Link to="/client/pedidos-abertos">Voltar à lista</Link>
          </Button>
        </div>
      </AppLayout>
    );
  }

  const isOpen = row.status === "open";

  return (
    <AppLayout>
      <div className="max-w-screen-lg mx-auto px-4 py-4 pb-8">
        <div className="flex items-center gap-3 mb-5">
          <button
            type="button"
            onClick={() => navigate("/client/pedidos-abertos")}
            className="p-2 rounded-xl border border-border hover:bg-muted transition-colors"
            aria-label="Voltar"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-foreground truncate">Detalhe do pedido</h1>
            <p className="text-sm text-muted-foreground">
              {interestCount}/{row.max_professional_interests} interessados
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm mb-6">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Badge variant={isOpen ? "default" : "secondary"}>{statusLabel(row.status)}</Badge>
            <Badge variant="outline">{urgencyLabel(row.urgency)}</Badge>
            {row.categories?.name && (
              <span className="text-xs font-medium text-muted-foreground">{row.categories.name}</span>
            )}
          </div>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{row.description}</p>
          <p className="text-xs text-muted-foreground mt-3">
            {[row.neighborhood, row.city, row.state].filter(Boolean).join(" · ")}
            {" · "}
            {new Date(row.created_at).toLocaleString("pt-BR", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>

        {isOpen && (
          <Button
            type="button"
            variant="outline"
            className="w-full mb-6 border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={() => setCloseOpen(true)}
          >
            <XCircle className="w-4 h-4 mr-2" />
            Encerrar pedido
          </Button>
        )}

        <h2 className="font-semibold text-foreground mb-1">Profissionais interessados</h2>
        {isOpen && interests.length > 0 && (
          <p className="text-xs text-muted-foreground mb-3">
            Pode conversar com quantos quiser e escolher o melhor. Quando fechar com um, é só encerrar o pedido.
          </p>
        )}
        {(!isOpen || interests.length === 0) && <div className="mb-3" />}
        {interests.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-xl">
            {isOpen
              ? "Ninguém manifestou interesse ainda. Aguarde ou encerre o pedido."
              : "Não há interesses registrados neste pedido."}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {interests.map((it) => {
              const p = it.professionals;
              if (!p) return null;
              const pub = profiles[p.user_id];
              const name = pub?.full_name?.trim() || "Profissional";
              const busy = chattingId === p.id;
              return (
                <li
                  key={it.id}
                  className="rounded-2xl border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center gap-3"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {pub?.avatar_url ? (
                      <img
                        src={pub.avatar_url}
                        alt=""
                        className="w-12 h-12 rounded-full object-cover border border-border shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <User className="w-6 h-6 text-primary" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-foreground truncate">{name}</span>
                        {p.verified && <BadgeCheck className="w-4 h-4 text-sky-500 shrink-0" aria-label="Verificado" />}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                        <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                        <span>
                          {p.rating?.toFixed?.(1) ?? p.rating} ({p.total_reviews} avaliações)
                        </span>
                      </div>
                      <Link
                        to={proProfileLink(p)}
                        className="text-xs font-medium text-primary mt-1 inline-block hover:underline"
                      >
                        Ver perfil
                      </Link>
                    </div>
                  </div>
                  {isOpen && (
                    <Button
                      type="button"
                      className={cn("shrink-0 font-bold", "w-full sm:w-auto")}
                      disabled={!!chattingId}
                      onClick={() => void handleChat(p.id)}
                    >
                      {busy ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <MessageSquare className="w-4 h-4 mr-2" />
                          Conversar
                        </>
                      )}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <AlertDialog open={closeOpen} onOpenChange={setCloseOpen}>
          <AlertDialogContent className="rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Encerrar este pedido?</AlertDialogTitle>
              <AlertDialogDescription>
                Ninguém poderá mais manifestar interesse. Você pode publicar um novo pedido depois, se precisar.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={closing}>Cancelar</AlertDialogCancel>
              <Button
                type="button"
                variant="destructive"
                disabled={closing}
                onClick={() => void handleCloseRequest()}
              >
                {closing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Encerrar pedido"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
};

export default ClientOpenRequestDetail;
