import AppLayout from "@/components/AppLayout";
import BottomNav from "@/components/BottomNav";
import { CalendarCheck, MessageSquare, CalendarClock, X, Loader2, Archive } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
interface AppointmentRow {
  id: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: string;
  chat_request_id: string | null;
  agenda_services: { name: string } | null;
  agenda_atendentes: { name: string } | null;
}

const statusLabel: Record<string, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  completed: "Concluído",
  done: "Concluído",
  canceled: "Cancelado",
  rejected: "Recusado",
  no_show: "Não compareceu",
};

const ARCHIVE_KEY = "chamo_agenda_archived";

const MeusAgendamentos = () => {
  const navigate = useNavigate();
  const [list, setList] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const today = format(new Date(), "yyyy-MM-dd");
    const fromDate = format(new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");
    const { data, error } = await supabase
      .from("agenda_appointments")
      .select(`
        id, appointment_date, start_time, end_time, status, chat_request_id,
        agenda_services(name),
        agenda_atendentes(name)
      `)
      .eq("client_id", user.id)
      .gte("appointment_date", fromDate)
      .order("appointment_date", { ascending: true })
      .order("start_time", { ascending: true });
    if (error) {
      console.error("MeusAgendamentos load:", error);
      toast({ title: "Erro ao carregar agendamentos", description: error.message, variant: "destructive" });
    }
    let archived: string[] = [];
    try {
      const raw = localStorage.getItem(ARCHIVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, string[]>;
        archived = parsed[user.id] ?? [];
      }
    } catch {}
    const filtered = ((data as AppointmentRow[]) || []).filter((a) => !archived.includes(a.id));
    setList(filtered);
    setLoading(false);
  };

  const archiveAppointment = (appointmentId: string) => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      try {
        const raw = localStorage.getItem(ARCHIVE_KEY);
        const parsed: Record<string, string[]> = raw ? JSON.parse(raw) : {};
        const list = parsed[user.id] ?? [];
        if (!list.includes(appointmentId)) {
          parsed[user.id] = [...list, appointmentId];
          localStorage.setItem(ARCHIVE_KEY, JSON.stringify(parsed));
          setList((prev) => prev.filter((a) => a.id !== appointmentId));
          toast({ title: "Removido da lista" });
        }
      } catch {}
    });
  };

  useEffect(() => {
    load();
  }, []);

  const canAct = (status: string) => status === "pending" || status === "confirmed";

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5 pb-24">
        <h1 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
          <CalendarCheck className="w-5 h-5 text-primary" />
          Meus agendamentos
        </h1>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[200px] text-muted-foreground gap-3">
            <CalendarCheck className="w-12 h-12 text-muted-foreground/40" />
            <p className="text-sm text-center">Você não tem agendamentos.</p>
            <Link to="/search" className="text-sm font-medium text-primary hover:underline">
              Buscar profissionais
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {list.map((a) => (
              <div
                key={a.id}
                className="bg-card border rounded-xl p-4 flex flex-col gap-3"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-foreground">
                      {(a.agenda_services as { name: string } | null)?.name ?? "Serviço"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Profissional
                      {a.agenda_atendentes?.name && ` • ${(a.agenda_atendentes as { name: string }).name}`}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      a.status === "completed" || a.status === "done"
                        ? "bg-primary/10 text-primary"
                        : a.status === "canceled" || a.status === "rejected"
                        ? "bg-muted text-muted-foreground"
                        : "bg-primary/10 text-primary"
                    }`}
                  >
                    {statusLabel[a.status] ?? a.status}
                  </span>
                </div>
                <p className="text-sm text-foreground">
                  {format(new Date(a.appointment_date + "T00:00:00"), "EEEE, d 'de' MMMM", { locale: ptBR })} às {a.start_time}
                </p>
                {canAct(a.status) && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {a.chat_request_id && (
                      <Button
                        variant="default"
                        size="sm"
                        className="rounded-lg"
                        onClick={() => navigate(`/messages/${a.chat_request_id}`)}
                      >
                        <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
                        Abrir chat
                      </Button>
                    )}
                    {a.chat_request_id && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-lg"
                        onClick={() => navigate(`/messages/${a.chat_request_id}`, { state: { showAgendaModal: "reschedule" } })}
                      >
                        <CalendarClock className="w-3.5 h-3.5 mr-1.5" />
                        Remarcar
                      </Button>
                    )}
                    {a.chat_request_id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => navigate(`/messages/${a.chat_request_id}`, { state: { showAgendaModal: "cancel" } })}
                      >
                        <X className="w-3.5 h-3.5 mr-1.5" />
                        Cancelar
                      </Button>
                    )}
                  </div>
                )}
                {(a.status === "done" || a.status === "canceled" || a.status === "rejected") && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-lg text-muted-foreground hover:text-foreground"
                      onClick={() => archiveAppointment(a.id)}
                    >
                      <Archive className="w-3.5 h-3.5 mr-1.5" />
                      Remover da lista
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
      <BottomNav />
    </AppLayout>
  );
};

export default MeusAgendamentos;
