import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronRight, Loader2, Plus, Radio } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Row = {
  id: string;
  description: string;
  urgency: string;
  status: string;
  city: string;
  state: string;
  neighborhood: string | null;
  created_at: string;
  categories: { name: string } | null;
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

const ClientOpenRequests = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("open_service_requests")
      .select("id, description, urgency, status, city, state, neighborhood, created_at, categories(name)")
      .eq("client_id", user.id)
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      setRows([]);
      return;
    }
    setRows((data as Row[]) || []);
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const h = () => void load();
    window.addEventListener("chamo-open-requests-changed", h);
    return () => window.removeEventListener("chamo-open-requests-changed", h);
  }, [load]);

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
            <h1 className="text-xl font-bold text-foreground truncate">Meus pedidos abertos</h1>
            <p className="text-sm text-muted-foreground">Solicitações publicadas para profissionais da região</p>
          </div>
        </div>

        <Button asChild className="w-full mb-6 font-bold gap-2">
          <Link to="/solicitar-servico">
            <Plus className="w-5 h-5" />
            Novo pedido aberto
          </Link>
        </Button>

        {loading ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-border p-8 text-center">
            <Radio className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-70" />
            <p className="font-semibold text-foreground mb-1">Nenhum pedido ainda</p>
            <p className="text-sm text-muted-foreground mb-4">
              Publique o que precisa e receba interesse de profissionais qualificados.
            </p>
            <Button asChild>
              <Link to="/solicitar-servico">Solicitar serviço</Link>
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  to={`/client/pedidos-abertos/${r.id}`}
                  className="flex rounded-2xl border border-border bg-card p-4 shadow-sm hover:border-primary/35 hover:shadow-md transition-all gap-3 group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Badge variant={r.status === "open" ? "default" : "secondary"}>{statusLabel(r.status)}</Badge>
                      <Badge variant="outline">{urgencyLabel(r.urgency)}</Badge>
                      {r.categories?.name && (
                        <span className="text-xs font-medium text-muted-foreground">{r.categories.name}</span>
                      )}
                    </div>
                    <p className="text-sm text-foreground leading-snug line-clamp-4">{r.description}</p>
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
                  </div>
                  <ChevronRight className="w-5 h-5 text-primary shrink-0 self-center opacity-70 group-hover:opacity-100" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppLayout>
  );
};

export default ClientOpenRequests;
