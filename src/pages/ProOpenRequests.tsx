import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Handshake, Undo2 } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type OpenRow = {
  id: string;
  client_id: string;
  description: string;
  urgency: string;
  city: string;
  state: string;
  neighborhood: string | null;
  created_at: string;
  category_id: string;
  max_professional_interests: number;
  categories: { name: string } | null;
};

type ClientInfo = { full_name: string; avatar_url: string | null };

const clientAvatarUrl = (avatarUrl?: string | null): string | null => {
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith("http")) return avatarUrl;
  return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/uploads/${avatarUrl}`;
};

const urgencyLabel = (u: string) => {
  if (u === "now") return "Agora";
  if (u === "today") return "Hoje";
  if (u === "flexible") return "Flexível";
  return u;
};

const urgencyRank = (u: string) => {
  if (u === "now") return 0;
  if (u === "today") return 1;
  return 2;
};

const ProOpenRequests = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [proRow, setProRow] = useState<{
    id: string;
    category_id: string | null;
    profile_status: string;
    active: boolean;
  } | null>(null);
  const [rows, setRows] = useState<OpenRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [clients, setClients] = useState<Record<string, ClientInfo>>({});
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);

    const { data: pro, error: proErr } = await supabase
      .from("professionals")
      .select("id, category_id, profile_status, active")
      .eq("user_id", user.id)
      .maybeSingle();

    if (proErr || !pro) {
      setProRow(null);
      setRows([]);
      setLoading(false);
      return;
    }

    setProRow({
      id: pro.id,
      category_id: pro.category_id,
      profile_status: pro.profile_status,
      active: pro.active,
    });

    const { data: raw, error: reqErr } = await supabase
      .from("open_service_requests")
      .select(
        "id, client_id, description, urgency, city, state, neighborhood, created_at, category_id, max_professional_interests, categories(name)",
      )
      .order("created_at", { ascending: false });

    if (reqErr) {
      setRows([]);
      setCounts({});
      setMine(new Set());
      setLoading(false);
      return;
    }

    const list = (raw as OpenRow[]) || [];
    const filtered = list.filter((r) => {
      if (pro.category_id && r.category_id !== pro.category_id) return false;
      return true;
    });

    filtered.sort((a, b) => {
      const ur = urgencyRank(a.urgency) - urgencyRank(b.urgency);
      if (ur !== 0) return ur;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    setRows(filtered);

    // Info dos clientes (foto + nome) para mostrar em cada pedido.
    const clientIds = [...new Set(filtered.map((r) => r.client_id).filter(Boolean))];
    if (clientIds.length > 0) {
      const { data: cprofs } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", clientIds);
      const cmap: Record<string, ClientInfo> = {};
      for (const p of (cprofs as { user_id: string; full_name: string | null; avatar_url: string | null }[]) || []) {
        cmap[p.user_id] = { full_name: p.full_name || "Cliente", avatar_url: p.avatar_url };
      }
      setClients(cmap);
    } else {
      setClients({});
    }

    const ids = filtered.map((r) => r.id);
    if (ids.length === 0) {
      setCounts({});
      setMine(new Set());
      setLoading(false);
      return;
    }

    const { data: allInts } = await supabase
      .from("open_service_request_interests")
      .select("open_request_id, professional_id")
      .in("open_request_id", ids);

    const countMap: Record<string, number> = {};
    const mySet = new Set<string>();
    for (const row of filtered) countMap[row.id] = 0;
    for (const it of (allInts as { open_request_id: string; professional_id: string }[]) || []) {
      countMap[it.open_request_id] = (countMap[it.open_request_id] || 0) + 1;
      if (it.professional_id === pro.id) mySet.add(it.open_request_id);
    }
    setCounts(countMap);
    setMine(mySet);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const h = () => void load();
    window.addEventListener("chamo-open-requests-changed", h);
    return () => window.removeEventListener("chamo-open-requests-changed", h);
  }, [load]);

  /**
   * "Tenho interesse": abre uma conversa (chamada com status ACEITA) com o cliente,
   * envia a mensagem automática do profissional e notifica o cliente (push/email/wpp).
   * Tudo via edge function, pois criar a service_request exige service role (RLS).
   */
  const handleInterest = async (openRequestId: string) => {
    if (!proRow) return;
    setActionId(openRequestId);
    const { data, error } = await supabase.functions.invoke("pro-express-interest", {
      body: { openRequestId },
    });
    setActionId(null);
    const res = (data ?? {}) as { serviceRequestId?: string; error?: string };
    if (error || res.error || !res.serviceRequestId) {
      toast({
        title: "Não foi possível abrir a conversa",
        description: res.error || error?.message || "Tente novamente em instantes.",
        variant: "destructive",
      });
      return;
    }
    try {
      window.dispatchEvent(new CustomEvent("chamo-open-requests-changed"));
    } catch {
      /* ignore */
    }
    navigate(`/messages/${res.serviceRequestId}`);
  };

  const eligibilityMessage = useMemo(() => {
    if (!proRow) return null;
    if (proRow.profile_status !== "approved") return "Seu cadastro profissional ainda não foi aprovado.";
    if (!proRow.active) return "Seu perfil profissional está inativo.";
    return null;
  }, [proRow]);

  return (
    <AppLayout>
      <div className="max-w-screen-lg mx-auto px-4 py-4 pb-8">
        <div className="flex items-center gap-3 mb-5">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl border border-border hover:bg-muted transition-colors"
            aria-label="Voltar"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Handshake className="w-6 h-6 text-primary shrink-0" />
              Serviços disponíveis
            </h1>
            <p className="text-sm text-muted-foreground">
              Pedidos na sua cidade e UF
              {proRow?.category_id ? " · mesma categoria do seu perfil" : ""}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : !proRow ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-foreground">
            <p className="mb-3">É necessário cadastro profissional para ver pedidos na região.</p>
            <Button asChild>
              <Link to="/signup-pro">Tornar-se profissional</Link>
            </Button>
          </div>
        ) : eligibilityMessage ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-center text-sm text-foreground">
            {eligibilityMessage}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-border p-8 text-center">
            <Handshake className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-70" />
            <p className="font-semibold text-foreground mb-1">Nenhum pedido no momento</p>
            <p className="text-sm text-muted-foreground">
              Quando clientes publicarem pedidos na sua cidade
              {proRow?.category_id ? ", na sua categoria" : ""}, eles aparecerão aqui.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {rows.map((r) => {
              const hasMine = mine.has(r.id);
              const busy = actionId === r.id;
              const client = clients[r.client_id];
              const clientAvatar = clientAvatarUrl(client?.avatar_url);
              return (
                <li key={r.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  {/* Cliente do pedido */}
                  {client && (
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className="w-9 h-9 rounded-full bg-muted overflow-hidden flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                        {clientAvatar ? (
                          <img
                            src={clientAvatar}
                            alt={client.full_name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : (
                          client.full_name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <span className="text-sm font-semibold text-foreground truncate">{client.full_name}</span>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <Badge variant="outline">{urgencyLabel(r.urgency)}</Badge>
                    {r.categories?.name && (
                      <span className="text-xs font-medium text-muted-foreground">{r.categories.name}</span>
                    )}
                    <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold px-2.5 py-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      DISPONÍVEL
                    </span>
                  </div>
                  <p className="text-sm text-foreground leading-snug whitespace-pre-wrap">
                    <span className="font-bold">SERVIÇO: </span>{r.description}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {[r.neighborhood, r.city, r.state].filter(Boolean).join(" · ")}
                    {" · "}
                    {new Date(r.created_at).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  <div className="mt-4">
                    <Button
                      type="button"
                      className="font-bold w-full"
                      disabled={!!actionId}
                      onClick={() => void handleInterest(r.id)}
                    >
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : hasMine ? "Abrir conversa" : "Oferecer meus serviços"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppLayout>
  );
};

export default ProOpenRequests;
