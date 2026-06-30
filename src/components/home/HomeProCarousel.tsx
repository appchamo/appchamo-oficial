/**
 * HomeProCarousel — Carrossel de dois cards para profissionais:
 *  Slide 0: Carteira (saldo + boas-vindas)
 *  Slide 1: Agenda de hoje (próximo compromisso)
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  ChevronRight, ChevronLeft, MapPin,
  CalendarCheck, Clock, User,
} from "lucide-react";
import { format, isToday, isTomorrow, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

/* ── tipos ──────────────────────────────────────────────── */
interface NextAppointment {
  id: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: string;
  client_name: string | null;
  service_name: string | null;
}

interface Props {
  profile: { avatar_url?: string | null } | null | undefined;
  userName: string;
  welcomeWord: string;
  locationLabel: string;
  onLocationClick: () => void;
  walletBalance: number;
  walletLoaded: boolean;
  professionalId: string;
}

/* ── helpers ─────────────────────────────────────────────── */
function getDateLabel(dateStr: string) {
  const d = parseISO(dateStr);
  if (isToday(d)) return "Hoje";
  if (isTomorrow(d)) return "Amanhã";
  return format(d, "dd/MM", { locale: ptBR });
}
function statusColor(s: string) {
  if (s === "confirmed") return "bg-emerald-400";
  if (s === "pending") return "bg-amber-300";
  return "bg-white/40";
}
function statusLabel(s: string) {
  if (s === "confirmed") return "Confirmado";
  if (s === "pending") return "Aguardando";
  return s;
}

/* ══════════════════════════════════════════════════════════ */
export default function HomeProCarousel({
  profile, userName, welcomeWord, locationLabel,
  onLocationClick, walletBalance, walletLoaded, professionalId,
}: Props) {
  const navigate = useNavigate();
  const [slide, setSlide] = useState(0);
  const [next, setNext] = useState<NextAppointment | null>(null);
  const [totalToday, setTotalToday] = useState(0);
  const [agendaLoaded, setAgendaLoaded] = useState(false);

  /* swipe tracking */
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isDragging = useRef(false);

  /* ── carrega próximo compromisso ─────────────────────── */
  const loadAgenda = useCallback(async () => {
    if (!professionalId) return;

    const now = new Date();
    const today = format(now, "yyyy-MM-dd");
    const currentTime = format(now, "HH:mm");

    const { data: rows } = await supabase
      .from("agenda_appointments")
      .select("id, appointment_date, start_time, end_time, status, client_id, agenda_services(name)")
      .eq("professional_id", professionalId)
      .in("status", ["pending", "confirmed"])
      .gte("appointment_date", today)
      .order("appointment_date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(20);

    if (!rows || rows.length === 0) { setAgendaLoaded(true); return; }

    type AgendaRow = {
      id: string;
      appointment_date: string;
      start_time: string | null;
      end_time: string | null;
      status: string;
      client_id: string | null;
      agenda_services: { name: string | null } | null;
    };
    const agendaRows = rows as AgendaRow[];

    const clientIds = [...new Set(agendaRows.map((r) => r.client_id).filter(Boolean))] as string[];
    let clientMap: Record<string, string> = {};
    if (clientIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles").select("user_id, full_name").in("user_id", clientIds);
      type ProfileRow = { user_id: string; full_name: string | null };
      clientMap = Object.fromEntries(
        ((profiles || []) as ProfileRow[]).map((p) => [p.user_id, p.full_name || "Cliente"]),
      );
    }

    const mapped: NextAppointment[] = agendaRows.map((r) => ({
      id: r.id,
      appointment_date: r.appointment_date,
      start_time: r.start_time?.slice(0, 5) || "",
      end_time: r.end_time?.slice(0, 5) || "",
      status: r.status,
      client_name: r.client_id ? (clientMap[r.client_id] || "Cliente") : null,
      service_name: r.agenda_services?.name || null,
    }));

    const todayAppts = mapped.filter(a => a.appointment_date === today);
    const futureAppts = mapped.filter(a => a.appointment_date > today);
    const upcoming = todayAppts.filter(a => a.start_time >= currentTime);
    setTotalToday(todayAppts.length);
    setNext(upcoming[0] || futureAppts[0] || null);
    setAgendaLoaded(true);
  }, [professionalId]);

  useEffect(() => { loadAgenda(); }, [loadAgenda]);

  /* mantém a premiação de selos rodando ao abrir a Home (sem UI de missão) */
  useEffect(() => {
    if (!professionalId) return;
    void supabase.rpc("try_award_my_call_seals");
  }, [professionalId]);

  /* volta para slide 0 se a agenda desaparecer */
  const hasAgenda = agendaLoaded && next !== null;
  useEffect(() => {
    if (!hasAgenda && slide > 0) setSlide(0);
  }, [hasAgenda, slide]);

  /* ── swipe ───────────────────────────────────────────── */
  const goTo = (idx: number) => setSlide(Math.max(0, Math.min(idx, hasAgenda ? 1 : 0)));

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isDragging.current = false;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const dx = Math.abs(e.touches[0].clientX - touchStartX.current);
    const dy = Math.abs(e.touches[0].clientY - touchStartY.current);
    if (dx > dy && dx > 8) isDragging.current = true;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) < 40) return;
    if (dx < 0) goTo(slide + 1);
    if (dx > 0) goTo(slide - 1);
  };

  return (
    <div
      className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-lg lg:shadow-xl select-none"
      style={{ background: "linear-gradient(135deg, #f97316 0%, #ea580c 60%, #c2410c 100%)" }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* círculos decorativos — fixos, não se movem com os slides */}
      <div className="absolute -top-8 -right-8 w-36 h-36 bg-white/10 rounded-full pointer-events-none z-0" />
      <div className="absolute -bottom-6 -left-6 w-28 h-28 bg-white/5 rounded-full pointer-events-none z-0" />
      <div className="absolute top-4 right-16 w-10 h-10 bg-white/10 rounded-full pointer-events-none z-0" />

      {/* Localização compacta no topo do card */}
      <div className="relative z-[2] px-4 lg:px-7 pt-3 lg:pt-4 pb-0.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onLocationClick();
          }}
          className="inline-flex items-center gap-1.5 rounded-full bg-white/20 backdrop-blur-sm border border-white/40 pl-2.5 pr-2 py-1 text-left active:scale-[0.98] transition-transform max-w-full"
        >
          <MapPin className="w-3.5 h-3.5 text-white shrink-0" />
          <span className="text-xs lg:text-sm font-semibold text-white truncate">{locationLabel}</span>
          <span className="text-[10px] lg:text-xs font-bold text-white/80 shrink-0 border-l border-white/30 pl-1.5">Alterar</span>
        </button>
      </div>

      {/* ── track: cada slide ocupa 100% do container ── */}
      <div
        className="flex transition-transform duration-300 ease-out relative z-[1]"
        style={{ transform: `translateX(-${slide * 100}%)` }}
      >

        {/* ════ SLIDE 0 — Carteira ════ */}
        <div className="min-w-full">
          <div
            className="px-5 lg:px-7 pt-1.5 lg:pt-2 pb-3 lg:pb-4 cursor-pointer active:opacity-90"
            onClick={() => navigate("/pro/financeiro")}
          >
            {/* avatar + saudação */}
            <div className="flex items-center gap-2 lg:gap-4">
              <div className="flex items-center gap-2.5 lg:gap-4 flex-1 min-w-0">
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={userName}
                    className="w-10 h-10 lg:w-12 lg:h-12 rounded-full object-cover border-2 border-white/40 shrink-0"
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-white/20 border-2 border-white/30 flex items-center justify-center shrink-0">
                    <span className="text-white font-bold text-lg lg:text-xl">{userName.charAt(0).toUpperCase()}</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-white/75 text-[11px] lg:text-sm leading-none mb-0.5">{welcomeWord} de volta,</p>
                  <p className="text-white font-bold text-base lg:text-xl leading-tight truncate">{userName} 👋</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ════ SLIDE 1 — Agenda ════ */}
        {hasAgenda && (
          <div className="min-w-full">
            <div
              className="p-4 lg:px-7 lg:py-6 cursor-pointer active:opacity-90"
              onClick={() => navigate("/pro/agenda/calendario")}
            >
              {/* header */}
              <div className="flex items-center justify-between mb-3 lg:mb-4">
                <div className="flex items-center gap-2 lg:gap-3">
                  <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg lg:rounded-xl bg-white/20 flex items-center justify-center">
                    <CalendarCheck className="w-4 h-4 lg:w-5 lg:h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs lg:text-sm font-semibold text-white/70 uppercase tracking-wide">Agenda de Hoje</p>
                    {totalToday > 1 && next && next.appointment_date === format(new Date(), "yyyy-MM-dd") && (
                      <p className="text-[10px] lg:text-xs text-white/60">{totalToday} compromissos hoje</p>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 lg:w-5 lg:h-5 text-white/50" />
              </div>

              {/* compromisso */}
              <div className="flex items-start gap-3 lg:gap-4">
                <div className="flex flex-col items-center min-w-[52px] lg:min-w-[60px]">
                  <div className="bg-white/20 rounded-xl lg:rounded-2xl px-2 py-1.5 lg:px-2.5 lg:py-2 text-center">
                    <p className="text-lg lg:text-xl font-bold text-white leading-none">{next.start_time}</p>
                    <p className="text-[9px] lg:text-[10px] text-white/70 mt-0.5">{getDateLabel(next.appointment_date)}</p>
                  </div>
                  {next.end_time && <div className="w-px h-4 bg-white/30 my-1" />}
                  {next.end_time && <p className="text-[10px] lg:text-xs text-white/60">{next.end_time}</p>}
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <p className="font-bold text-white text-sm lg:text-base leading-tight truncate">
                    {next.service_name || "Compromisso"}
                  </p>
                  {next.client_name && (
                    <div className="flex items-center gap-1 mt-1">
                      <User className="w-3 h-3 lg:w-3.5 lg:h-3.5 text-white/60 shrink-0" />
                      <p className="text-xs lg:text-sm text-white/80 truncate">{next.client_name}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 mt-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${statusColor(next.status)}`} />
                    <p className="text-[11px] lg:text-sm text-white/70">{statusLabel(next.status)}</p>
                    {next.end_time && (
                      <>
                        <span className="text-white/30">·</span>
                        <Clock className="w-3 h-3 text-white/50" />
                        <p className="text-[11px] lg:text-sm text-white/70">até {next.end_time}</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── seta circular ── */}
      {hasAgenda && (
        <button
          type="button"
          onClick={() => goTo(slide === 0 ? 1 : 0)}
          className={`
            absolute z-10
            w-9 h-9 lg:w-10 lg:h-10 rounded-full bg-black/20 backdrop-blur-sm border border-white/25
            flex items-center justify-center
            hover:bg-black/30 active:scale-90 transition-all duration-300
            ${slide === 0
              ? "right-3 lg:right-5 top-1/2 -translate-y-1/2"
              : "left-3 lg:left-5 top-3 lg:top-5"}
          `}
          aria-label={slide === 0 ? "Ver agenda" : "Ver carteira"}
        >
          {slide === 0
            ? <ChevronRight className="w-5 h-5 text-white" />
            : <ChevronLeft className="w-5 h-5 text-white" />
          }
        </button>
      )}

      {/* ── pontinhos indicadores ── */}
      {hasAgenda && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 pointer-events-none z-10">
          {[0, 1].map(i => (
            <div
              key={i}
              className={`rounded-full transition-all duration-300 ${
                slide === i ? "w-4 h-1.5 bg-white" : "w-1.5 h-1.5 bg-white/40"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
