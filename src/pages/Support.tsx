import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, HelpCircle, Plus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import BottomNav from "@/components/BottomNav";

interface Ticket {
  id: string;
  protocol: string | null;
  subject: string;
  status: string;
  created_at: string;
}

const Support = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("support_tickets")
        .select("id, protocol, subject, status, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setTickets((data as Ticket[]) || []);
      setLoading(false);
    };
    load();
  }, [user]);

  const handleNewTicket = async () => {
    if (!user) return;
    setCreating(true);
    const { data: newTicket, error } = await supabase
      .from("support_tickets")
      .insert({ user_id: user.id, subject: "Nova solicitação", message: "Abertura de suporte" })
      .select("id")
      .single();
    if (error || !newTicket) {
      setCreating(false);
      return;
    }
    navigate(`/support/${newTicket.id}`);
  };

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20">
      <header className="sticky top-0 z-30 bg-amber-500/90 backdrop-blur-md border-b border-amber-600/30">
        <div className="flex items-center gap-3 px-4 py-2.5 max-w-screen-lg mx-auto">
          <Link to="/home" className="p-1.5 rounded-lg hover:bg-amber-600/20 transition-colors">
            <ArrowLeft className="w-5 h-5 text-white" />
          </Link>
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
            <HelpCircle className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">Suporte Chamô</p>
            <p className="text-[10px] text-white/70">Suas solicitações</p>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-screen-lg mx-auto w-full px-4 py-4">
        <button
          onClick={handleNewTicket}
          disabled={creating}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 mb-4"
        >
          <Plus className="w-4 h-4" />
          {creating ? "Criando..." : "Nova solicitação de suporte"}
        </button>

        {tickets.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            <HelpCircle className="w-10 h-10 mx-auto mb-3 text-amber-500/40" />
            <p className="font-medium">Nenhuma solicitação ainda</p>
            <p className="text-xs mt-1">Clique acima para abrir sua primeira solicitação.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {tickets.map((t) => (
              <Link
                key={t.id}
                to={`/support/${t.id}`}
                className="flex items-center gap-3 bg-card border rounded-xl p-4 hover:border-primary/30 hover:shadow-card transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <HelpCircle className="w-5 h-5 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm text-foreground truncate">{t.protocol || "Suporte"}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      t.status === "closed" ? "bg-muted text-muted-foreground" : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    }`}>
                      {t.status === "closed" ? "Encerrado" : "Aberto"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(t.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
};

export default Support;
