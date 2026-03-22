import AppLayout from "@/components/AppLayout";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { Link, useNavigate } from "react-router-dom";
import {
  Calendar, Loader2, ChevronLeft, ChevronRight, Trash2,
  MessageSquare, Clock, User, CalendarDays, List,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay,
  addMonths, subMonths, startOfWeek, endOfWeek, addWeeks, subWeeks,
  addDays, subDays, isToday, parseISO, isSameMonth,
} from "date-fns";
import { ptBR } from "date-fns/locale";

type ViewMode = "month" | "week" | "day";

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

function statusMeta(status: string) {
  if (status === "confirmed") return { label: "Confirmado", color: "bg-emerald-500", light: "bg-emerald-50 border-emerald-200 text-emerald-700", dot: "bg-emerald-500" };
  if (status === "pending") return { label: "Aguardando", color: "bg-amber-400", light: "bg-amber-50 border-amber-200 text-amber-700", dot: "bg-amber-400" };
  if (status === "done") return { label: "Concluído", color: "bg-primary", light: "bg-primary/5 border-primary/20 text-primary", dot: "bg-primary" };
  if (status === "canceled") return { label: "Cancelado", color: "bg-rose-400", light: "bg-rose-50 border-rose-200 text-rose-700", dot: "bg-rose-400" };
  return { label: status, color: "bg-muted", light: "bg-muted/30 border-border text-muted-foreground", dot: "bg-muted-foreground" };
}

function AppointmentCard({
  a,
  onCancel,
  compact = false,
}: {
  a: AppointmentRow;
  onCancel: (id: string) => void;
  compact?: boolean;
}) {
  const meta = statusMeta(a.status);
  return (
    <div className={`rounded-xl border p-3 ${meta.light} transition-all`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${meta.dot}`} />
            <span className="text-xs font-semibold">{meta.label}</span>
          </div>
          <p className="font-bold text-sm text-foreground truncate">{a.service_name || "Compromisso"}</p>
          {!compact && a.client_name && (
            <div className="flex items-center gap-1 mt-0.5">
              <User className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              <p className="text-xs text-muted-foreground truncate">{a.client_name}</p>
            </div>
          )}
          <div className="flex items-center gap-1 mt-1">
            <Clock className="w-3 h-3 text-muted-foreground flex-shrink-0" />
            <p className="text-xs text-muted-foreground">{a.start_time}{a.end_time ? ` – ${a.end_time}` : ""}</p>
            {a.atendente_name && <span className="text-xs text-muted-foreground">· {a.atendente_name}</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {a.chat_request_id && (
            <Link to={`/messages/${a.chat_request_id}`}>
              <button className="p-1.5 rounded-lg bg-white/60 hover:bg-white text-foreground transition-colors">
                <MessageSquare className="w-3.5 h-3.5" />
              </button>
            </Link>
          )}
          {(a.status === "pending" || a.status === "confirmed") && (
            <button
              onClick={() => onCancel(a.id)}
              className="p-1.5 rounded-lg bg-white/60 hover:bg-rose-50 text-rose-500 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProAgendaCalendar() {
  const { user } = useAuth();
  const { plan } = useSubscription();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [professionalId, setProfessionalId] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<ViewMode>("month");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [cancelAppointmentId, setCancelAppointmentId] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);

  const isBusiness = plan?.id === "business";

  const fetchRange = useCallback(async (proId: string, from: Date, to: Date) => {
    const { data: rows } = await supabase
      .from("agenda_appointments")
      .select(`id, client_id, appointment_date, start_time, end_time, status, chat_request_id, agenda_services(name), agenda_atendentes(name)`)
      .eq("professional_id", proId)
      .in("status", ["pending", "confirmed", "done"])
      .gte("appointment_date", format(from, "yyyy-MM-dd"))
      .lte("appointment_date", format(to, "yyyy-MM-dd"))
      .order("appointment_date").order("start_time");

    const clientIds = [...new Set((rows || []).map((r: any) => r.client_id).filter(Boolean))];
    let clientMap: Record<string, string> = {};
    if (clientIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", clientIds);
      clientMap = Object.fromEntries((profiles || []).map((p: any) => [p.user_id, p.full_name || "Cliente"]));
    }

    return (rows || []).map((r: any) => ({
      id: r.id,
      appointment_date: r.appointment_date,
      start_time: r.start_time?.slice(0, 5) || "",
      end_time: r.end_time?.slice(0, 5) || "",
      status: r.status,
      client_id: r.client_id ?? null,
      client_name: r.client_id ? (clientMap[r.client_id] || "Cliente") : null,
      service_name: r.agenda_services?.name ?? null,
      atendente_name: r.agenda_atendentes?.name ?? null,
      chat_request_id: r.chat_request_id,
    })) as AppointmentRow[];
  }, []);

  const loadData = useCallback(async (proId: string, v: ViewMode, d: Date) => {
    setLoading(true);
    let from: Date, to: Date;
    if (v === "month") {
      from = startOfMonth(d);
      to = endOfMonth(d);
    } else if (v === "week") {
      from = startOfWeek(d, { weekStartsOn: 0 });
      to = endOfWeek(d, { weekStartsOn: 0 });
    } else {
      from = d;
      to = d;
    }
    const data = await fetchRange(proId, from, to);
    setAppointments(data);
    setLoading(false);
  }, [fetchRange]);

  // Initial load: get professional id
  useEffect(() => {
    if (!user || !isBusiness) { setLoading(false); return; }
    supabase.from("professionals").select("id").eq("user_id", user.id).maybeSingle().then(({ data: pro }) => {
      if (!pro) { setLoading(false); return; }
      setProfessionalId(pro.id);
      loadData(pro.id, view, currentDate);
    });
  }, [user, isBusiness]);

  // Reload when view or date changes (after proId known)
  useEffect(() => {
    if (!professionalId) return;
    loadData(professionalId, view, currentDate);
  }, [view, currentDate, professionalId, loadData]);

  const handleCancel = async () => {
    if (!cancelAppointmentId || !professionalId || !user) return;
    const apt = appointments.find((a) => a.id === cancelAppointmentId);
    if (!apt) return;
    setCanceling(true);
    try {
      await supabase.from("agenda_appointments").update({ status: "canceled", updated_at: new Date().toISOString() }).eq("id", cancelAppointmentId);
      if (apt.chat_request_id) {
        await supabase.from("chat_messages").insert({ request_id: apt.chat_request_id, sender_id: user.id, content: "❌ Agendamento cancelado pelo profissional." });
      }
      if (apt.client_id) {
        await supabase.from("notifications").insert({
          user_id: apt.client_id, title: "Agendamento cancelado",
          message: "O profissional cancelou seu agendamento.", type: "agenda",
          link: apt.chat_request_id ? `/messages/${apt.chat_request_id}` : "/meus-agendamentos",
        });
      }
      toast({ title: "Agendamento cancelado. Cliente notificado." });
      setCancelAppointmentId(null);
      setAppointments((prev) => prev.map((a) => a.id === cancelAppointmentId ? { ...a, status: "canceled" } : a));
    } catch {
      toast({ title: "Erro ao cancelar", variant: "destructive" });
    } finally {
      setCanceling(false);
    }
  };

  if (!isBusiness) {
    return (
      <AppLayout>
        <main className="max-w-screen-lg mx-auto px-4 py-16 text-center">
          <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground mb-4">Agenda disponível apenas para o plano Business.</p>
          <Link to="/pro/agenda"><Button className="rounded-xl">Configurar agenda</Button></Link>
        </main>
      </AppLayout>
    );
  }

  const appointmentsByDate = appointments.reduce<Record<string, AppointmentRow[]>>((acc, a) => {
    if (!acc[a.appointment_date]) acc[a.appointment_date] = [];
    acc[a.appointment_date].push(a);
    return acc;
  }, {});

  // ── Month View ──────────────────────────────────────────────────────────────
  function MonthView() {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const selectedAppts = appointmentsByDate[format(selectedDate, "yyyy-MM-dd")] || [];

    return (
      <div>
        {/* Nav */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <ChevronLeft className="w-5 h-5 text-foreground" />
          </button>
          <div className="text-center">
            <p className="font-bold text-foreground capitalize text-base">{format(currentDate, "MMMM", { locale: ptBR })}</p>
            <p className="text-xs text-muted-foreground">{format(currentDate, "yyyy")}</p>
          </div>
          <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <ChevronRight className="w-5 h-5 text-foreground" />
          </button>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7 text-center text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
          {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => <div key={i}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: monthStart.getDay() }).map((_, i) => <div key={`pad-${i}`} />)}
          {days.map((day) => {
            const dStr = format(day, "yyyy-MM-dd");
            const appts = appointmentsByDate[dStr] || [];
            const isSelected = isSameDay(day, selectedDate);
            const todayDay = isToday(day);
            const hasAppt = appts.length > 0;
            const inMonth = isSameMonth(day, currentDate);

            const confirmedCount = appts.filter(a => a.status === "confirmed").length;
            const pendingCount = appts.filter(a => a.status === "pending").length;

            return (
              <button
                key={dStr}
                onClick={() => { setSelectedDate(day); if (!isSameMonth(day, currentDate)) setCurrentDate(day); }}
                className={`relative aspect-square rounded-xl flex flex-col items-center justify-center transition-all text-sm font-medium
                  ${isSelected ? "bg-primary text-primary-foreground shadow-md scale-105" :
                    todayDay ? "bg-primary/10 text-primary border-2 border-primary/30" :
                    "hover:bg-muted/60 text-foreground"}
                  ${!inMonth ? "opacity-30" : ""}
                `}
              >
                <span className="leading-none">{format(day, "d")}</span>
                {hasAppt && (
                  <div className="flex gap-0.5 mt-0.5">
                    {confirmedCount > 0 && <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-white" : "bg-emerald-500"}`} />}
                    {pendingCount > 0 && <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-white/70" : "bg-amber-400"}`} />}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Selected day appointments */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-foreground text-sm capitalize">
              {isToday(selectedDate) ? "Hoje · " : ""}{format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
            </h2>
            <span className="text-xs text-muted-foreground">{selectedAppts.length} agendamento{selectedAppts.length !== 1 ? "s" : ""}</span>
          </div>
          {selectedAppts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <CalendarDays className="w-8 h-8 mx-auto mb-2 opacity-40" />
              Nenhum agendamento neste dia.
            </div>
          ) : (
            <div className="space-y-2">
              {selectedAppts.map((a) => (
                <AppointmentCard key={a.id} a={a} onCancel={setCancelAppointmentId} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Week View ───────────────────────────────────────────────────────────────
  function WeekView() {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const hasAny = weekDays.some(d => (appointmentsByDate[format(d, "yyyy-MM-dd")] || []).length > 0);

    return (
      <div>
        {/* Nav */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setCurrentDate(subWeeks(currentDate, 1))} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="text-center">
            <p className="font-bold text-foreground text-sm">
              {format(weekStart, "d MMM", { locale: ptBR })} – {format(addDays(weekStart, 6), "d MMM", { locale: ptBR })}
            </p>
            <p className="text-xs text-muted-foreground">{format(currentDate, "yyyy")}</p>
          </div>
          <button onClick={() => setCurrentDate(addWeeks(currentDate, 1))} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Day headers + content */}
        <div className="space-y-3">
          {weekDays.map((day) => {
            const dStr = format(day, "yyyy-MM-dd");
            const appts = appointmentsByDate[dStr] || [];
            const todayDay = isToday(day);
            const isSelected = isSameDay(day, selectedDate);

            return (
              <div key={dStr} className={`rounded-2xl border transition-all ${todayDay ? "border-primary/30 bg-primary/3" : "border-border bg-card"}`}>
                {/* Day header */}
                <button
                  onClick={() => { setSelectedDate(day); setCurrentDate(day); setView("day"); }}
                  className="w-full flex items-center justify-between px-4 py-2.5"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm transition-all
                      ${todayDay ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                      {format(day, "d")}
                    </div>
                    <div className="text-left">
                      <p className={`text-sm font-semibold capitalize ${todayDay ? "text-primary" : "text-foreground"}`}>
                        {format(day, "EEEE", { locale: ptBR })}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{format(day, "dd/MM")}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {appts.length > 0 && (
                      <span className="text-xs font-medium text-muted-foreground">{appts.length} agend.</span>
                    )}
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </button>

                {/* Appointments */}
                {appts.length > 0 && (
                  <div className="px-3 pb-3 space-y-2">
                    {appts.map((a) => (
                      <AppointmentCard key={a.id} a={a} onCancel={setCancelAppointmentId} compact />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {!hasAny && !loading && (
          <div className="text-center py-8 text-muted-foreground text-sm mt-4">
            <CalendarDays className="w-8 h-8 mx-auto mb-2 opacity-40" />
            Nenhum agendamento nesta semana.
          </div>
        )}
      </div>
    );
  }

  // ── Day View ────────────────────────────────────────────────────────────────
  function DayView() {
    const dStr = format(selectedDate, "yyyy-MM-dd");
    const appts = (appointmentsByDate[dStr] || []).sort((a, b) => a.start_time.localeCompare(b.start_time));
    const todayDay = isToday(selectedDate);

    return (
      <div>
        {/* Nav */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => { const d = subDays(selectedDate, 1); setSelectedDate(d); setCurrentDate(d); }} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="text-center">
            <p className="font-bold text-foreground text-base capitalize">
              {todayDay ? "Hoje" : format(selectedDate, "EEEE", { locale: ptBR })}
            </p>
            <p className="text-xs text-muted-foreground capitalize">{format(selectedDate, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
          </div>
          <button onClick={() => { const d = addDays(selectedDate, 1); setSelectedDate(d); setCurrentDate(d); }} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Quick jump to today */}
        {!todayDay && (
          <div className="flex justify-center mb-4">
            <button
              onClick={() => { setSelectedDate(new Date()); setCurrentDate(new Date()); }}
              className="text-xs font-medium text-primary border border-primary/30 bg-primary/5 px-3 py-1.5 rounded-full hover:bg-primary/10 transition-colors"
            >
              Ir para hoje
            </button>
          </div>
        )}

        {appts.length === 0 && !loading ? (
          <div className="text-center py-12">
            <div className={`w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center ${todayDay ? "bg-primary/10" : "bg-muted"}`}>
              <CalendarDays className={`w-8 h-8 ${todayDay ? "text-primary" : "text-muted-foreground"}`} />
            </div>
            <p className="font-semibold text-foreground mb-1">Dia livre!</p>
            <p className="text-sm text-muted-foreground">Nenhum agendamento para este dia.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Summary bar */}
            <div className="flex items-center gap-3 px-1">
              <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${Math.min(100, appts.length * 20)}%` }}
                />
              </div>
              <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                {appts.length} compromisso{appts.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Timeline */}
            <div className="relative">
              {appts.map((a, idx) => {
                const meta = statusMeta(a.status);
                return (
                  <div key={a.id} className="flex gap-3 mb-3">
                    {/* Time column */}
                    <div className="w-12 flex-shrink-0 text-right pt-1">
                      <p className="text-xs font-bold text-foreground">{a.start_time}</p>
                      {a.end_time && <p className="text-[10px] text-muted-foreground">{a.end_time}</p>}
                    </div>

                    {/* Connector */}
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div className={`w-3 h-3 rounded-full flex-shrink-0 mt-1 ring-2 ring-background ${meta.color}`} />
                      {idx < appts.length - 1 && <div className="w-0.5 flex-1 bg-border mt-1 min-h-[24px]" />}
                    </div>

                    {/* Card */}
                    <div className="flex-1 min-w-0 pb-2">
                      <div className={`rounded-2xl border p-4 ${meta.light}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-sm text-foreground mb-1">{a.service_name || "Compromisso"}</p>
                            {a.client_name && (
                              <div className="flex items-center gap-1.5">
                                <div className="w-5 h-5 rounded-full bg-current opacity-20 flex-shrink-0" />
                                <p className="text-xs font-medium truncate">{a.client_name}</p>
                              </div>
                            )}
                            {a.atendente_name && (
                              <p className="text-xs mt-0.5 opacity-70">Atendente: {a.atendente_name}</p>
                            )}
                            <div className="flex items-center gap-1 mt-2">
                              <Clock className="w-3 h-3 opacity-60" />
                              <span className="text-xs opacity-70">{a.start_time}{a.end_time ? ` – ${a.end_time}` : ""}</span>
                            </div>
                          </div>
                          <div className="flex flex-col gap-1">
                            {a.chat_request_id && (
                              <Link to={`/messages/${a.chat_request_id}`}>
                                <button className="p-2 rounded-xl bg-white/60 hover:bg-white transition-colors">
                                  <MessageSquare className="w-3.5 h-3.5" />
                                </button>
                              </Link>
                            )}
                            {(a.status === "pending" || a.status === "confirmed") && (
                              <button
                                onClick={() => setCancelAppointmentId(a.id)}
                                className="p-2 rounded-xl bg-white/60 hover:bg-rose-50 text-rose-500 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5 pb-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Minha agenda
          </h1>
          <Link to="/pro/agenda">
            <Button variant="outline" size="sm" className="rounded-xl text-xs h-8 px-3">Configurar</Button>
          </Link>
        </div>

        {/* View Toggle */}
        <div className="flex bg-muted rounded-2xl p-1 mb-5 gap-1">
          {([
            { id: "month" as ViewMode, label: "Mês", icon: Calendar },
            { id: "week" as ViewMode, label: "Semana", icon: List },
            { id: "day" as ViewMode, label: "Dia", icon: CalendarDays },
          ]).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold transition-all
                ${view === id
                  ? "bg-card text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
                }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Quick "today" indicator */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-xs text-muted-foreground">Confirmado</span>
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 ml-2" />
            <span className="text-xs text-muted-foreground">Aguardando</span>
          </div>
          <button
            onClick={() => { setCurrentDate(new Date()); setSelectedDate(new Date()); }}
            className="text-xs font-medium text-primary"
          >
            Hoje
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {view === "month" && <MonthView />}
            {view === "week" && <WeekView />}
            {view === "day" && <DayView />}
          </>
        )}

        {/* Cancel Dialog */}
        <Dialog open={!!cancelAppointmentId} onOpenChange={(open) => !open && setCancelAppointmentId(null)}>
          <DialogContent className="max-w-xs rounded-2xl">
            <DialogHeader>
              <DialogTitle>Cancelar agendamento?</DialogTitle>
              <DialogDescription>
                O cliente será notificado pelo chat. Esta ação não pode ser desfeita.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setCancelAppointmentId(null)} disabled={canceling} className="rounded-xl">
                Manter
              </Button>
              <Button variant="destructive" className="rounded-xl" disabled={canceling} onClick={handleCancel}>
                {canceling ? <Loader2 className="w-4 h-4 animate-spin" /> : "Cancelar agendamento"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </AppLayout>
  );
}
