import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { CalendarCheck, Clock, ChevronRight, User } from "lucide-react";
import { format, isToday, isTomorrow, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface NextAppointment {
  id: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: string;
  client_name: string | null;
  service_name: string | null;
  chat_request_id: string | null;
}

interface Props {
  professionalId: string;
}

function getDateLabel(dateStr: string): string {
  const d = parseISO(dateStr);
  if (isToday(d)) return "Hoje";
  if (isTomorrow(d)) return "Amanhã";
  return format(d, "dd/MM", { locale: ptBR });
}

function statusColor(status: string) {
  if (status === "confirmed") return "bg-emerald-500";
  if (status === "pending") return "bg-amber-400";
  return "bg-muted-foreground";
}

function statusLabel(status: string) {
  if (status === "confirmed") return "Confirmado";
  if (status === "pending") return "Aguardando";
  return status;
}

const ProAgendaTodayCard = ({ professionalId }: Props) => {
  const navigate = useNavigate();
  const [next, setNext] = useState<NextAppointment | null>(null);
  const [totalToday, setTotalToday] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const now = new Date();
    const today = format(now, "yyyy-MM-dd");
    const currentTime = format(now, "HH:mm");

    const { data: rows } = await supabase
      .from("agenda_appointments")
      .select(`
        id, appointment_date, start_time, end_time, status,
        client_id, chat_request_id,
        agenda_services(name)
      `)
      .eq("professional_id", professionalId)
      .in("status", ["pending", "confirmed"])
      .gte("appointment_date", today)
      .order("appointment_date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(20);

    if (!rows || rows.length === 0) { setLoaded(true); return; }

    // Busca nomes dos clientes
    const clientIds = [...new Set(rows.map((r: any) => r.client_id).filter(Boolean))];
    let clientMap: Record<string, string> = {};
    if (clientIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", clientIds);
      clientMap = Object.fromEntries((profiles || []).map((p: any) => [p.user_id, p.full_name || "Cliente"]));
    }

    const mapped: NextAppointment[] = rows.map((r: any) => ({
      id: r.id,
      appointment_date: r.appointment_date,
      start_time: r.start_time?.slice(0, 5) || "",
      end_time: r.end_time?.slice(0, 5) || "",
      status: r.status,
      client_name: r.client_id ? (clientMap[r.client_id] || "Cliente") : null,
      service_name: r.agenda_services?.name || null,
      chat_request_id: r.chat_request_id,
    }));

    // Encontra o próximo: hoje → ainda não passou; senão o primeiro do próximo dia
    const todayAppts = mapped.filter(a => a.appointment_date === today);
    const futureAppts = mapped.filter(a => a.appointment_date > today);

    // Dentro dos de hoje: mostra o que ainda não começou (start_time >= agora)
    const upcoming = todayAppts.filter(a => a.start_time >= currentTime);
    setTotalToday(todayAppts.length);

    const chosen = upcoming[0] || futureAppts[0] || null;
    setNext(chosen);
    setLoaded(true);
  }, [professionalId]);

  useEffect(() => { load(); }, [load]);

  if (!loaded || !next) return null;

  const dateLabel = getDateLabel(next.appointment_date);
  const isNextDay = next.appointment_date !== format(new Date(), "yyyy-MM-dd");

  return (
    <button
      onClick={() => navigate("/pro/agenda/calendario")}
      className="w-full text-left"
    >
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-white shadow-lg active:scale-[0.98] transition-transform">
        {/* Decoração de fundo */}
        <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 -translate-y-8 translate-x-8" />
        <div className="absolute bottom-0 left-8 w-20 h-20 rounded-full bg-white/5 translate-y-6" />

        <div className="relative p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                <CalendarCheck className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white/70 uppercase tracking-wide">Agenda de Hoje</p>
                {totalToday > 1 && !isNextDay && (
                  <p className="text-[10px] text-white/60">{totalToday} compromissos hoje</p>
                )}
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-white/60" />
          </div>

          {/* Compromisso */}
          <div className="flex items-start gap-3">
            {/* Horário */}
            <div className="flex flex-col items-center min-w-[52px]">
              <div className="bg-white/20 rounded-xl px-2 py-1.5 text-center">
                <p className="text-lg font-bold text-white leading-none">{next.start_time}</p>
                <p className="text-[9px] text-white/70 mt-0.5">{dateLabel}</p>
              </div>
              {next.end_time && (
                <div className="w-px h-4 bg-white/30 my-1" />
              )}
              {next.end_time && (
                <p className="text-[10px] text-white/60">{next.end_time}</p>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 pt-0.5">
              <p className="font-bold text-white text-sm leading-tight truncate">
                {next.service_name || "Compromisso"}
              </p>
              {next.client_name && (
                <div className="flex items-center gap-1 mt-1">
                  <User className="w-3 h-3 text-white/60 flex-shrink-0" />
                  <p className="text-xs text-white/80 truncate">{next.client_name}</p>
                </div>
              )}
              <div className="flex items-center gap-1.5 mt-2">
                <div className={`w-1.5 h-1.5 rounded-full ${statusColor(next.status)}`} />
                <p className="text-[11px] text-white/70">{statusLabel(next.status)}</p>
                {next.end_time && (
                  <>
                    <span className="text-white/30">·</span>
                    <Clock className="w-3 h-3 text-white/50" />
                    <p className="text-[11px] text-white/70">até {next.end_time}</p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
};

export default ProAgendaTodayCard;
