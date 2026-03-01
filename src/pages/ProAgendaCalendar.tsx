import AppLayout from "@/components/AppLayout";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { Link } from "react-router-dom";
import { Calendar, Loader2, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

type AppointmentRow = {
  id: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: string;
  client_id: string | null;
  client_name: string | null;
  service_name: string | null;
  atendente_name: string | null;
  chat_request_id?: string | null;
};

export default function ProAgendaCalendar() {
  const { user } = useAuth();
  const { plan } = useSubscription();
  const [loading, setLoading] = useState(true);
  const [professionalId, setProfessionalId] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [cancelAppointmentId, setCancelAppointmentId] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);

  const isBusiness = plan?.id === "business";

  useEffect(() => {
    if (!user || !isBusiness) {
      setLoading(false);
      return;
    }
    const load = async () => {
      const { data: pro } = await supabase.from("professionals").select("id").eq("user_id", user.id).maybeSingle();
      if (!pro) {
        setLoading(false);
        return;
      }
      setProfessionalId(pro.id);
      const start = startOfMonth(currentMonth);
      const end = endOfMonth(currentMonth);
      const { data: rows } = await supabase
        .from("agenda_appointments")
        .select(`
          id,
          client_id,
          appointment_date,
          start_time,
          end_time,
          status,
          chat_request_id,
          agenda_services(name),
          agenda_atendentes(name)
        `)
        .eq("professional_id", pro.id)
        .in("status", ["pending", "confirmed", "done"])
        .gte("appointment_date", format(start, "yyyy-MM-dd"))
        .lte("appointment_date", format(end, "yyyy-MM-dd"))
        .order("appointment_date")
        .order("start_time");

      const clientIds = [...new Set((rows || []).map((r: any) => r.client_id).filter(Boolean))];
      let clientMap: Record<string, string> = {};
      if (clientIds.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", clientIds);
        clientMap = Object.fromEntries((profiles || []).map((p: any) => [p.user_id, p.full_name || "Cliente"]));
      }

      const withClient = (rows || []).map((r: any) => ({
        id: r.id,
        appointment_date: r.appointment_date,
        start_time: r.start_time?.slice(0, 5) || r.start_time,
        end_time: r.end_time?.slice(0, 5) || r.end_time,
        status: r.status,
        client_id: r.client_id ?? null,
        client_name: r.client_id ? clientMap[r.client_id] || "Cliente" : null,
        service_name: r.agenda_services?.name ?? null,
        atendente_name: r.agenda_atendentes?.name ?? null,
        chat_request_id: r.chat_request_id,
      }));
      setAppointments(withClient);
      setLoading(false);
    };
    load();
  }, [user, isBusiness, currentMonth]);

  if (!isBusiness) {
    return (
      <AppLayout>
        <main className="max-w-screen-lg mx-auto px-4 py-8 text-center">
          <p className="text-muted-foreground">Agenda disponível apenas para plano Business.</p>
          <Link to="/pro/agenda"><Button className="mt-4 rounded-xl">Configurar agenda</Button></Link>
        </main>
      </AppLayout>
    );
  }

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const appointmentsByDate = appointments.reduce<Record<string, AppointmentRow[]>>((acc, a) => {
    const d = a.appointment_date;
    if (!acc[d]) acc[d] = [];
    acc[d].push(a);
    return acc;
  }, {});

  const selectedAppointments = selectedDate ? appointmentsByDate[format(selectedDate, "yyyy-MM-dd")] || [] : [];

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Minha agenda
          </h1>
          <Link to="/pro/agenda">
            <Button variant="outline" size="sm" className="rounded-xl">Configurar agenda</Button>
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <Button variant="ghost" size="icon" className="rounded-lg" onClick={() => setCurrentMonth((m) => subMonths(m, 1))}>
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <span className="font-semibold text-foreground capitalize">{format(currentMonth, "MMMM yyyy", { locale: ptBR })}</span>
              <Button variant="ghost" size="icon" className="rounded-lg" onClick={() => setCurrentMonth((m) => addMonths(m, 1))}>
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-2 text-center text-xs font-medium text-muted-foreground">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 text-sm">
              {Array.from({ length: monthStart.getDay() }).map((_, i) => (
                <div key={`pad-${i}`} className="aspect-square" />
              ))}
              {days.map((day) => {
                const dStr = format(day, "yyyy-MM-dd");
                const count = (appointmentsByDate[dStr] || []).length;
                const isSelected = selectedDate && isSameDay(day, selectedDate);
                return (
                  <button
                    key={dStr}
                    type="button"
                    onClick={() => setSelectedDate(day)}
                    className={`aspect-square rounded-lg border flex flex-col items-center justify-center transition-colors ${
                      isSelected ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted/50 border-border"
                    }`}
                  >
                    <span>{format(day, "d")}</span>
                    {count > 0 && (
                      <span className={`text-[10px] ${isSelected ? "text-primary-foreground/80" : "text-primary"}`}>{count} agend.</span>
                    )}
                  </button>
                );
              })}
            </div>

            {selectedDate && (
              <div className="mt-6 p-4 rounded-2xl bg-card border">
                <h2 className="font-semibold text-foreground mb-3">
                  {format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
                </h2>
                {selectedAppointments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum agendamento neste dia.</p>
                ) : (
                  <ul className="space-y-2">
                    {selectedAppointments.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-2 p-3 rounded-xl bg-muted/30 text-sm flex-wrap">
                        <div className="min-w-0 flex-1">
                          <span className="font-medium text-foreground">{a.start_time} – {a.end_time}</span>
                          {a.service_name && <span className="text-muted-foreground"> · {a.service_name}</span>}
                          {a.atendente_name && <span className="text-muted-foreground"> · {a.atendente_name}</span>}
                        </div>
                        <div className="font-medium">{a.client_name ?? "Cliente"}</div>
                        <div className="flex items-center gap-1">
                          {a.chat_request_id && (
                            <Link to={`/messages/${a.chat_request_id}`}>
                              <Button size="sm" variant="outline" className="rounded-lg">Chat</Button>
                            </Link>
                          )}
                          {(a.status === "pending" || a.status === "confirmed") && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setCancelAppointmentId(a.id)}
                              title="Cancelar agendamento"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <Dialog open={!!cancelAppointmentId} onOpenChange={(open) => !open && setCancelAppointmentId(null)}>
              <DialogContent className="max-w-xs rounded-2xl">
                <DialogHeader>
                  <DialogTitle>Cancelar agendamento?</DialogTitle>
                  <DialogDescription>
                    O cliente será notificado e a mensagem aparecerá no chat. Esta ação não pode ser desfeita.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button variant="outline" onClick={() => setCancelAppointmentId(null)} disabled={canceling} className="rounded-xl">
                    Manter
                  </Button>
                  <Button
                    variant="destructive"
                    className="rounded-xl"
                    disabled={canceling}
                    onClick={async () => {
                      if (!cancelAppointmentId || !professionalId || !user) return;
                      const apt = appointments.find((a) => a.id === cancelAppointmentId);
                      if (!apt) return;
                      setCanceling(true);
                      try {
                        await supabase.from("agenda_appointments").update({ status: "canceled", updated_at: new Date().toISOString() }).eq("id", cancelAppointmentId);
                        if (apt.chat_request_id) {
                          await supabase.from("chat_messages").insert({
                            request_id: apt.chat_request_id,
                            sender_id: user.id,
                            content: "❌ Agendamento cancelado pelo profissional.",
                          });
                        }
                        if (apt.client_id) {
                          await supabase.from("notifications").insert({
                            user_id: apt.client_id,
                            title: "Agendamento cancelado",
                            message: "O profissional cancelou seu agendamento.",
                            type: "agenda",
                            link: apt.chat_request_id ? `/messages/${apt.chat_request_id}` : "/meus-agendamentos",
                          });
                        }
                        toast({ title: "Agendamento cancelado. Cliente notificado." });
                        setCancelAppointmentId(null);
                        setAppointments((prev) => prev.map((a) => (a.id === cancelAppointmentId ? { ...a, status: "canceled" } : a)));
                      } catch (e) {
                        toast({ title: "Erro ao cancelar", variant: "destructive" });
                      } finally {
                        setCanceling(false);
                      }
                    }}
                  >
                    {canceling ? <Loader2 className="w-4 h-4 animate-spin" /> : "Cancelar agendamento"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
      </main>
    </AppLayout>
  );
}
