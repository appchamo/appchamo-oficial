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
        "id, description, urgency, city, state, neighborhood, created_at, category_id, max_professional_interests, categories(name)",
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

  const notifyClientInterest = async (openRequestId: string) => {
    const { data: r } = await supabase.from("open_service_requests").select("client_id").eq("id", openRequestId).maybeSingle();
    const clientId = (r as { client_id?: string } | null)?.client_id;
    if (!clientId) return;
    const proName = profile?.full_name?.trim() || "Um profissional";
    await supabase.from("notifications").insert({
      user_id: clientId,
      title: "Interesse no seu pedido",
      message: `${proName} quer saber mais sobre sua solicitação.`,
      type: "open_request_interest",
      link: `/client/pedidos-abertos/${openRequestId}`,
    } as never);
  };

  const expressInterest = async (openRequestId: string) => {
    if (!proRow) return;
    setActionId(openRequestId);
    const { error } = await supabase.from("open_service_request_interests").insert({
      open_request_id: openRequestId,
      professional_id: proRow.id,
    });
    setActionId(null);
    if (error) {
      toast({
        title: "Não foi possível manifestar interesse",
        description: error.message.includes("Limite") ? "Este pedido já atingiu o máximo de interessados." : error.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Interesse enviado!", description: "O cliente será notificado." });
    await notifyClientInterest(openRequestId);
    try {
      window.dispatchEvent(new CustomEvent("chamo-open-requests-changed"));
    } catch {
      /* ignore */
    }
    void load();
  };

  const withdrawInterest = async (openRequestId: string) => {
    if (!proRow) return;
    setActionId(openRequestId);
    const { error } = await supabase
      .from("open_service_request_interests")
      .delete()
      .eq("open_request_id", openRequestId)
      .eq("professional_id", proRow.id);
    setActionId(null);
    if (error) {
      toast({ title: "Erro ao desistir", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Interesse retirado" });
    try {
      window.dispatchEvent(new CustomEvent("chamo-open-requests-changed"));
    } catch {
      /* ignore */
    }
    void load();
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
              Pedidos na região
            </h1>
            <p className="text-sm text-muted-foreground">
              Pedidos abertos na sua UF
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
              Quando clientes publicarem pedidos na sua UF
              {proRow?.category_id ? " e categoria" : ""}, eles aparecerão aqui.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {rows.map((r) => {
              const c = counts[r.id] ?? 0;
              const max = r.max_professional_interests;
              const full = c >= max;
              const hasMine = mine.has(r.id);
              const busy = actionId === r.id;
              return (
                <li key={r.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <Badge variant="outline">{urgencyLabel(r.urgency)}</Badge>
                    {r.categories?.name && (
                      <span className="text-xs font-medium text-muted-foreground">{r.categories.name}</span>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {c}/{max} interessados
                    </span>
                  </div>
                  <p className="text-sm text-foreground leading-snug whitespace-pre-wrap">{r.description}</p>
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
                  <div className="mt-4 flex flex-col sm:flex-row gap-2">
                    {hasMine ? (
                      <>
                        <Badge className="w-fit bg-emerald-600 hover:bg-emerald-600">Você manifestou interesse</Badge>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="font-semibold"
                          disabled={!!actionId}
                          onClick={() => void withdrawInterest(r.id)}
                        >
                          {busy ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <Undo2 className="w-4 h-4 mr-1.5" />
                              Desistir
                            </>
                          )}
                        </Button>
                      </>
                    ) : full ? (
                      <span className="text-sm text-muted-foreground">Limite de interessados atingido.</span>
                    ) : (
                      <Button
                        type="button"
                        className={cn("font-bold", "w-full sm:w-auto")}
                        disabled={!!actionId}
                        onClick={() => void expressInterest(r.id)}
                      >
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Tenho interesse"}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-xs text-muted-foreground mt-6 text-center">
          A UF do pedido precisa coincidir com a do seu{" "}
          <Link to="/profile/settings/endereco" className="text-primary font-medium underline-offset-2 hover:underline">
            endereço no perfil
          </Link>
          .
        </p>
      </div>
    </AppLayout>
  );
};

export default ProOpenRequests;
