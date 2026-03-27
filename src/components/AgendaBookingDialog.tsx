import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import {
  Loader2,
  User,
  CalendarDays,
  Clock,
  CheckCircle2,
  ChevronRight,
  Sparkles,
  Building2,
  Ban,
} from "lucide-react";
import { addDays, startOfToday, format, isBefore } from "date-fns";
import { ptBR } from "date-fns/locale";
import { buildChatAppointmentRequestMessage } from "@/lib/chatAppointmentRequest";
import { getCurrentPathForAuthReturn, setPostAuthRedirect } from "@/lib/chamoAuthReturn";
import { cn } from "@/lib/utils";
import { incrementProfessionalAnalytics } from "@/lib/proAnalytics";

type Step = "atendente" | "service" | "date" | "time" | "confirm";

interface AtendenteOption {
  id: string;
  name: string;
  photo_url: string | null;
  description: string | null;
}

interface AgendaService {
  id: string;
  name: string;
  duration_minutes: number;
  active: boolean;
}

interface AvailabilityRule {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  slot_interval_minutes: number;
  capacity: number;
  break_start_time?: string | null;
  break_end_time?: string | null;
}

interface AvailabilityBlock {
  id: string;
  block_date: string;
  start_time: string;
  end_time: string;
}

interface AgendaBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  professionalId: string;
  professionalName: string;
  professionalUserId: string;
  professionalAvatarUrl?: string | null;
  loginRedirectPath?: string;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function resolveUploadsUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  const base = import.meta.env.VITE_SUPABASE_URL || "";
  return `${base}/storage/v1/object/public/uploads/${String(url).replace(/^\//, "")}`;
}

export default function AgendaBookingDialog({
  open,
  onOpenChange,
  professionalId,
  professionalName,
  professionalUserId,
  professionalAvatarUrl,
  loginRedirectPath,
}: AgendaBookingDialogProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("atendente");
  const [atendentes, setAtendentes] = useState<AtendenteOption[]>([]);
  const [selectedAtendenteId, setSelectedAtendenteId] = useState<string | null>(null);
  const [services, setServices] = useState<AgendaService[]>([]);
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const [selectedServices, setSelectedServices] = useState<AgendaService[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [occupiedSlots, setOccupiedSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const hasAtendentes = atendentes.length > 0;
  const stepFlow = useMemo(
    () => (hasAtendentes ? (["atendente", "service", "date", "time", "confirm"] as const) : (["service", "date", "time", "confirm"] as const)),
    [hasAtendentes],
  );
  const stepIndex = stepFlow.indexOf(step as (typeof stepFlow)[number]) + 1;
  const stepTotal = stepFlow.length;

  useEffect(() => {
    if (!open || !professionalId) return;
    setStep("atendente");
    setSelectedAtendenteId(null);
    setSelectedServices([]);
    setSelectedDate(undefined);
    setSelectedSlot(null);
    setSlots([]);
    const loadAtendentes = async () => {
      setLoading(true);
      const { data: atList } = await supabase
        .from("agenda_atendentes")
        .select("id, name, photo_url, description")
        .eq("professional_id", professionalId)
        .eq("active", true)
        .order("sort_order", { ascending: true });
      const list = (atList as AtendenteOption[]) || [];
      setAtendentes(list);
      if (list.length === 0) {
        setStep("service");
        setSelectedAtendenteId(null);
      }
      setLoading(false);
    };
    loadAtendentes();
  }, [open, professionalId]);

  const loadConfigForAtendente = async (atendenteId: string | null): Promise<void> => {
    if (!professionalId) return;
    const baseSvc = supabase
      .from("agenda_services")
      .select("id, name, duration_minutes, active")
      .eq("professional_id", professionalId)
      .eq("active", true)
      .order("name");
    const baseRls = supabase
      .from("agenda_availability_rules")
      .select("id, weekday, start_time, end_time, slot_interval_minutes, capacity, break_start_time, break_end_time")
      .eq("professional_id", professionalId);
    const baseBlk = supabase
      .from("agenda_availability_blocks")
      .select("id, block_date, start_time, end_time")
      .eq("professional_id", professionalId)
      .gte("block_date", format(startOfToday(), "yyyy-MM-dd"));

    const svcQ = atendenteId === null ? baseSvc.is("atendente_id", null) : baseSvc.eq("atendente_id", atendenteId);
    const rlsQ = atendenteId === null ? baseRls.is("atendente_id", null) : baseRls.eq("atendente_id", atendenteId);
    const blkQ = atendenteId === null ? baseBlk.is("atendente_id", null) : baseBlk.eq("atendente_id", atendenteId);

    const [{ data: svc }, { data: rls }, { data: blk }] = await Promise.all([svcQ, rlsQ, blkQ]);
    setServices((svc as AgendaService[]) || []);
    setRules((rls as AvailabilityRule[]) || []);
    setBlocks((blk as AvailabilityBlock[]) || []);
  };

  useEffect(() => {
    if (!open || !professionalId || step !== "service") return;
    let cancelled = false;
    setLoading(true);
    loadConfigForAtendente(selectedAtendenteId).then(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, professionalId, step, selectedAtendenteId]);

  const today = startOfToday();

  const isDateDisabled = (date: Date) => {
    if (isBefore(date, today)) return true;
    const weekday = date.getDay();
    const hasRule = rules.some((r) => r.weekday === weekday);
    if (!hasRule) return true;
    const dateStr = format(date, "yyyy-MM-dd");
    const fullyBlocked = blocks.some(
      (b) => b.block_date === dateStr && b.start_time === "00:00" && b.end_time === "23:59",
    );
    return fullyBlocked;
  };

  const totalDurationMinutes = selectedServices.reduce((s, svc) => s + svc.duration_minutes, 0);

  useEffect(() => {
    if (step !== "time" || !selectedDate || selectedServices.length === 0 || !professionalId) {
      setSlots([]);
      setOccupiedSlots([]);
      return;
    }
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const weekday = selectedDate.getDay();

    const loadSlots = async () => {
      setLoadingSlots(true);
      const dayRules = rules.filter((r) => r.weekday === weekday);
      const dayBlocks = blocks.filter((b) => b.block_date === dateStr);

      const slotSet = new Map<string, number>();
      for (const rule of dayRules) {
        const startMin = timeToMinutes(rule.start_time);
        const endMin = timeToMinutes(rule.end_time);
        const breakStart = rule.break_start_time ? timeToMinutes(rule.break_start_time.slice(0, 5)) : null;
        const breakEnd = rule.break_end_time ? timeToMinutes(rule.break_end_time.slice(0, 5)) : null;
        const interval = rule.slot_interval_minutes || 30;
        for (let m = startMin; m + totalDurationMinutes <= endMin; m += interval) {
          const slotEndMin = m + totalDurationMinutes;
          if (breakStart != null && breakEnd != null && m < breakEnd && slotEndMin > breakStart) continue;
          const slotTime = minutesToTime(m);
          const current = slotSet.get(slotTime) ?? 0;
          slotSet.set(slotTime, Math.max(current, rule.capacity));
        }
      }

      for (const blk of dayBlocks) {
        const blkStart = timeToMinutes(blk.start_time);
        const blkEnd = timeToMinutes(blk.end_time);
        for (const [slotTime] of Array.from(slotSet.entries())) {
          const slotMin = timeToMinutes(slotTime);
          const slotEndMin = slotMin + totalDurationMinutes;
          if (slotMin < blkEnd && slotEndMin > blkStart) slotSet.delete(slotTime);
        }
      }

      const { data: rpcRows, error: rpcErr } = await supabase.rpc("public_agenda_existing_ranges", {
        p_professional_id: professionalId,
        p_date: dateStr,
        p_atendente_id: selectedAtendenteId,
      });
      if (rpcErr) {
        console.warn("[AgendaBookingDialog] public_agenda_existing_ranges:", rpcErr);
      }
      const existing = (rpcRows || []) as { start_time: string; end_time: string }[];

      const existingRanges = existing.map((r: { start_time: string; end_time: string }) => ({
        start: timeToMinutes(String(r.start_time).slice(0, 5)),
        end: timeToMinutes(String(r.end_time).slice(0, 5) || String(r.end_time)),
      }));

      const available: string[] = [];
      const occupied: string[] = [];
      for (const [slotTime, capacity] of slotSet.entries()) {
        const slotMin = timeToMinutes(slotTime);
        const slotEndMin = slotMin + totalDurationMinutes;
        const overlappingCount = existingRanges.filter((range) => range.start < slotEndMin && range.end > slotMin).length;
        if (overlappingCount < capacity) available.push(slotTime);
        else occupied.push(slotTime);
      }
      available.sort();
      occupied.sort();
      setSlots(available);
      setOccupiedSlots(occupied);
      setLoadingSlots(false);
    };
    loadSlots();
  }, [step, selectedDate, selectedServices, selectedAtendenteId, totalDurationMinutes, rules, blocks, professionalId]);

  const handleConfirmBooking = async () => {
    if (selectedServices.length === 0 || !selectedDate || !selectedSlot) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      const ret = loginRedirectPath || getCurrentPathForAuthReturn();
      setPostAuthRedirect(ret);
      navigate("/login", { state: { from: ret } });
      toast({
        title: "Faça login para concluir",
        description: "Entre ou cadastre-se — você volta para esta agenda.",
      });
      return;
    }

    setSending(true);
    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const servicesLabel = selectedServices.map((s) => s.name).join(" + ");

      const desc = `Agendamento: ${servicesLabel} - ${format(selectedDate, "dd/MM/yyyy", { locale: ptBR })} às ${selectedSlot}`;
      const { data: req, error: reqError } = await supabase
        .from("service_requests")
        .insert({
          client_id: user.id,
          professional_id: professionalId,
          description: desc,
        })
        .select()
        .single();

      if (reqError) throw reqError;
      const requestId = req.id;
      const protocol = (req as { protocol?: string }).protocol;

      let currentStart = selectedSlot;
      for (const svc of selectedServices) {
        const startMin = timeToMinutes(currentStart);
        const endTime = minutesToTime(startMin + svc.duration_minutes);
        const { error: appError } = await supabase.from("agenda_appointments").insert({
          professional_id: professionalId,
          atendente_id: selectedAtendenteId,
          client_id: user.id,
          service_id: svc.id,
          appointment_date: dateStr,
          start_time: currentStart,
          end_time: endTime,
          status: "pending",
          chat_request_id: requestId,
        });
        if (appError) throw appError;
        currentStart = endTime;
      }

      if (protocol) {
        await supabase.from("chat_messages").insert({
          request_id: requestId,
          sender_id: user.id,
          content: `📋 PROTOCOLO: ${protocol}`,
        });
      }

      const dateDdMmYyyy = format(selectedDate, "dd/MM/yyyy", { locale: ptBR });
      const msg = buildChatAppointmentRequestMessage({
        servicesLabel,
        dateDdMmYyyy,
        slot: selectedSlot,
      });
      await supabase.from("chat_messages").insert({
        request_id: requestId,
        sender_id: user.id,
        content: msg,
      });

      const { data: clientPub } = await supabase
        .from("profiles_public" as any)
        .select("avatar_url")
        .eq("user_id", user.id)
        .maybeSingle() as { data: { avatar_url: string | null } | null };

      await supabase.from("notifications").insert({
        user_id: professionalUserId,
        title: "Novo agendamento 📅",
        message: `${servicesLabel} - ${format(selectedDate, "dd/MM/yyyy", { locale: ptBR })} às ${selectedSlot}`,
        type: "appointment",
        link: `/messages/${requestId}`,
        image_url: clientPub?.avatar_url ?? null,
      } as any);

      incrementProfessionalAnalytics(professionalUserId, "appointment_booking");
      onOpenChange(false);
      toast({ title: "Agendamento enviado! Aguarde a confirmação." });
      navigate(`/messages/${requestId}`);
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err ? String((err as { message: string }).message) : "";
      const isSlotTaken =
        msg.includes("duplicate") ||
        msg.includes("unique") ||
        (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "23505");
      toast({
        title: isSlotTaken ? "Horário indisponível" : "Erro ao agendar",
        description: isSlotTaken ? "Este horário já foi reservado. Escolha outro." : err instanceof Error ? err.message : "Tente novamente.",
        variant: "destructive",
      });
    }
    setSending(false);
  };

  const handleClose = (val: boolean) => {
    if (!val) {
      setStep(atendentes.length > 0 ? "atendente" : "service");
      setSelectedAtendenteId(null);
      setSelectedServices([]);
      setSelectedDate(undefined);
      setSelectedSlot(null);
    }
    onOpenChange(val);
  };

  const selectedAtendenteName =
    selectedAtendenteId === null ? "Atendimento geral" : atendentes.find((a) => a.id === selectedAtendenteId)?.name ?? null;

  const proAvatar = resolveUploadsUrl(professionalAvatarUrl ?? null);
  const sortedTimeSlots = [...slots, ...occupiedSlots].sort();

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-lg rounded-3xl max-h-[92vh] overflow-y-auto border-border/80 shadow-elevated p-0 gap-0 overflow-hidden">
        <div className="bg-gradient-to-br from-primary via-primary to-amber-600 text-primary-foreground px-5 pt-6 pb-5">
          <DialogHeader className="text-left space-y-3">
            <div className="flex items-center gap-2 text-primary-foreground/90">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span className="text-[11px] font-bold uppercase tracking-widest">Reserva online</span>
            </div>
            <DialogTitle className="text-xl sm:text-2xl font-extrabold text-primary-foreground leading-tight pr-8">
              Agendar com {professionalName}
            </DialogTitle>
            <DialogDescription className="text-primary-foreground/85 text-sm leading-relaxed">
              {step === "atendente" && "Escolha o profissional que vai te atender."}
              {step === "service" && "Selecione o serviço e a duração total do atendimento."}
              {step === "date" && "Escolha o melhor dia na agenda."}
              {step === "time" && "Horários em azul estão livres; em vermelho, já ocupados."}
              {step === "confirm" && "Revise e confirme — o profissional receberá o pedido no Chamô."}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-primary-foreground/25 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary-foreground transition-all duration-300"
                style={{ width: `${(stepIndex / stepTotal) * 100}%` }}
              />
            </div>
            <span className="text-xs font-bold tabular-nums shrink-0">
              {stepIndex}/{stepTotal}
            </span>
          </div>
        </div>

        <div className="px-4 sm:px-5 py-5 bg-background">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Carregando opções…</p>
            </div>
          )}

          {!loading && step === "atendente" && atendentes.length > 0 && (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedAtendenteId(null);
                  setStep("service");
                }}
                className="group flex items-center gap-4 w-full p-4 rounded-2xl border-2 border-primary/35 bg-gradient-to-br from-primary/8 to-amber-500/5 hover:border-primary/60 hover:shadow-md text-left transition-all"
              >
                <div className="relative shrink-0">
                  {proAvatar ? (
                    <img src={proAvatar} alt="" className="w-14 h-14 rounded-2xl object-cover ring-2 ring-primary/30 shadow-md" />
                  ) : (
                    <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center ring-2 ring-primary/25">
                      <Building2 className="w-7 h-7 text-primary" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-foreground text-base">Atendimento geral</p>
                  <p className="text-sm text-muted-foreground mt-0.5">Primeiro horário disponível da equipe</p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
              </button>

              {atendentes.map((a) => {
                const img = resolveUploadsUrl(a.photo_url);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      setSelectedAtendenteId(a.id);
                      setStep("service");
                    }}
                    className="group flex items-center gap-4 w-full p-4 rounded-2xl border border-border/80 bg-card hover:border-primary/40 hover:shadow-md text-left transition-all"
                  >
                    <div className="relative shrink-0">
                      {img ? (
                        <img src={img} alt="" className="w-14 h-14 rounded-2xl object-cover ring-2 ring-border shadow-sm" />
                      ) : (
                        <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center ring-2 ring-border/60">
                          <User className="w-7 h-7 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-foreground text-base truncate">{a.name}</p>
                      {a.description ? (
                        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{a.description}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground/80 mt-0.5">Toque para ver serviços e horários</p>
                      )}
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                  </button>
                );
              })}
            </div>
          )}

          {!loading && step === "service" && (
            <div className="flex flex-col gap-3">
              {atendentes.length > 0 && selectedAtendenteName && (
                <div className="flex items-center gap-2 px-1">
                  <User className="w-4 h-4 text-primary shrink-0" />
                  <p className="text-sm text-muted-foreground">
                    Atendente: <span className="font-semibold text-foreground">{selectedAtendenteName}</span>
                  </p>
                </div>
              )}
              <p className="text-xs text-muted-foreground px-1">Um ou mais serviços — a duração total define os horários oferecidos.</p>
              {services.length === 0 ? (
                <div className="rounded-2xl border border-dashed py-10 text-center text-sm text-muted-foreground">
                  Nenhum serviço disponível para esta escolha.
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {services.map((s) => {
                      const isSelected = selectedServices.some((x) => x.id === s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            if (isSelected) setSelectedServices((prev) => prev.filter((x) => x.id !== s.id));
                            else setSelectedServices((prev) => [...prev, s]);
                          }}
                          className={cn(
                            "flex justify-between items-center w-full p-4 rounded-2xl border-2 text-left transition-all",
                            isSelected
                              ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/20"
                              : "border-border/70 bg-card hover:border-primary/30 hover:bg-muted/40",
                          )}
                        >
                          <span className="font-semibold text-foreground pr-2">{s.name}</span>
                          <span
                            className={cn(
                              "text-xs font-bold px-2.5 py-1 rounded-lg shrink-0",
                              isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                            )}
                          >
                            {s.duration_minutes} min
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {selectedServices.length > 0 && (
                    <p className="text-sm font-medium text-foreground px-1">
                      Duração total:{" "}
                      <span className="text-primary">{selectedServices.reduce((a, b) => a + b.duration_minutes, 0)} min</span>
                    </p>
                  )}
                  <Button
                    size="lg"
                    className="w-full rounded-2xl font-bold mt-2"
                    disabled={selectedServices.length === 0}
                    onClick={() => setStep("date")}
                  >
                    Continuar
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </>
              )}
              {atendentes.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-xl text-muted-foreground"
                  onClick={() => {
                    setSelectedServices([]);
                    setSelectedDate(undefined);
                    setSelectedSlot(null);
                    setStep("atendente");
                  }}
                >
                  Voltar à escolha do profissional
                </Button>
              )}
            </div>
          )}

          {!loading && step === "date" && selectedServices.length > 0 && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border/80 bg-card p-3 shadow-sm">
                <div className="flex items-center gap-2 mb-2 px-1">
                  <CalendarDays className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">Selecione a data</span>
                </div>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => {
                    setSelectedDate(d);
                    if (d) setStep("time");
                  }}
                  disabled={isDateDisabled}
                  locale={ptBR}
                  fromDate={today}
                  toDate={addDays(today, 60)}
                  className="mx-auto"
                />
              </div>
              <Button variant="outline" className="w-full rounded-2xl" onClick={() => setStep("service")}>
                Voltar
              </Button>
            </div>
          )}

          {!loading && step === "time" && selectedServices.length > 0 && selectedDate && (
            <div className="space-y-4">
              <div className="rounded-xl bg-muted/50 border border-border/60 px-3 py-2.5">
                <p className="text-sm font-semibold text-foreground capitalize">
                  {format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                  <Clock className="w-3.5 h-3.5" />
                  Toque em um horário disponível
                </p>
              </div>

              <div className="flex flex-wrap gap-2 text-[11px] font-medium">
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-sky-500 text-white">
                  <span className="w-2 h-2 rounded-full bg-white/90" />
                  Disponível
                </span>
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300 border border-red-200/80 dark:border-red-900">
                  <Ban className="w-3 h-3" />
                  Indisponível
                </span>
              </div>

              {loadingSlots ? (
                <div className="flex flex-col items-center py-10 gap-2">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-xs text-muted-foreground">Consultando agenda…</p>
                </div>
              ) : sortedTimeSlots.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Nenhum horário neste dia.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {sortedTimeSlots.map((slot) => {
                    const isOccupied = occupiedSlots.includes(slot);
                    const isSelected = selectedSlot === slot && !isOccupied;
                    return (
                      <button
                        key={slot}
                        type="button"
                        disabled={isOccupied}
                        onClick={() => !isOccupied && setSelectedSlot(slot)}
                        className={cn(
                          "min-w-[4.75rem] py-2.5 px-3 rounded-xl text-sm font-bold transition-all",
                          isOccupied &&
                            "bg-red-50 text-red-600 border-2 border-red-200 cursor-not-allowed opacity-95 dark:bg-red-950/35 dark:text-red-400 dark:border-red-900/60",
                          !isOccupied &&
                            !isSelected &&
                            "bg-sky-500 text-white border-2 border-sky-600 hover:bg-sky-600 active:scale-[0.98] shadow-sm",
                          !isOccupied &&
                            isSelected &&
                            "bg-sky-700 text-white border-2 border-sky-800 ring-2 ring-sky-300 ring-offset-2 ring-offset-background scale-[1.02]",
                        )}
                      >
                        {slot}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1 rounded-2xl" onClick={() => setStep("date")}>
                  Voltar
                </Button>
                {selectedSlot && (
                  <Button className="flex-1 rounded-2xl font-bold" onClick={() => setStep("confirm")}>
                    Continuar
                  </Button>
                )}
              </div>
            </div>
          )}

          {!loading && step === "confirm" && selectedServices.length > 0 && selectedDate && selectedSlot && (
            <div className="space-y-4">
              <div className="rounded-2xl border-l-4 border-l-primary border border-border/80 bg-gradient-to-br from-muted/40 to-background p-4 space-y-3 shadow-sm">
                <div className="flex items-center gap-2 text-primary">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-bold text-foreground">Resumo do agendamento</span>
                </div>
                <ul className="text-sm space-y-2 text-foreground/90">
                  {selectedAtendenteName && (
                    <li>
                      <span className="text-muted-foreground">Profissional:</span>{" "}
                      <span className="font-semibold">{selectedAtendenteName}</span>
                    </li>
                  )}
                  <li>
                    <span className="text-muted-foreground">Serviço(s):</span>{" "}
                    <span className="font-semibold">{selectedServices.map((s) => s.name).join(" + ")}</span>
                  </li>
                  <li>
                    <span className="text-muted-foreground">Duração:</span>{" "}
                    <span className="font-semibold">{totalDurationMinutes} min</span>
                  </li>
                  <li>
                    <span className="text-muted-foreground">Data:</span>{" "}
                    <span className="font-semibold">{format(selectedDate, "dd/MM/yyyy", { locale: ptBR })}</span>
                  </li>
                  <li>
                    <span className="text-muted-foreground">Horário:</span>{" "}
                    <span className="font-semibold text-primary">{selectedSlot}</span>
                  </li>
                </ul>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button variant="outline" className="rounded-2xl sm:flex-1" onClick={() => setStep("time")}>
                  Ajustar horário
                </Button>
                <Button className="rounded-2xl font-bold sm:flex-1 h-12" onClick={handleConfirmBooking} disabled={sending}>
                  {sending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" /> Enviando…
                    </>
                  ) : (
                    "Confirmar agendamento"
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
