import AppLayout from "@/components/AppLayout";
import { FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";

interface Request {
  id: string;
  status: string;
  description: string | null;
  created_at: string;
  professional_id: string;
}

const statusLabel: Record<string, string> = {
  pending: "Pendente",
  accepted: "Aceito",
  completed: "Concluído",
  cancelled: "Cancelado",
};

const ClientRequests = () => {
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("service_requests").select("*").eq("client_id", user.id).order("created_at", { ascending: false });
      setRequests((data as Request[]) || []);
      setLoading(false);
    };
    load();
  }, []);

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5">
        <h1 className="text-xl font-bold text-foreground mb-4">Minhas Solicitações</h1>
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
            <FileText className="w-10 h-10 text-muted-foreground/40" />
            <p className="text-sm">Você ainda não fez nenhuma solicitação</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {requests.map((r) => (
              <Link key={r.id} to={`/messages/${r.id}`}
                className="flex items-center justify-between bg-card border rounded-xl p-4 hover:border-primary/30 transition-all">
                <div>
                  <p className="text-sm font-medium text-foreground">{r.description || "Solicitação de serviço"}</p>
                  <p className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString("pt-BR")}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  r.status === "completed" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                }`}>
                  {statusLabel[r.status] || r.status}
                </span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </AppLayout>
  );
};

export default ClientRequests;
