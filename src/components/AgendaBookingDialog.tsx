import { useState, useEffect } from "react";
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
import { Loader2, User } from "lucide-react";
import { addDays, startOfToday, format, isBefore } from "date-fns";
import { ptBR } from "date-fns/locale";

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
  /** Avatar do perfil do profissional (exibido em "Atendimento geral") */
  professionalAvatarUrl?: string | null;
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

export default function AgendaBookingDialog({
  open,
  onOpenChange,
  professionalId,
  professionalName,
  professionalUserId,
  professionalAvatarUrl,
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
  const [loadingSlots, setLoadingSlots] = useState(false);

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
    const svcQ = supabase.from("agenda_services").select("id, name, duration_minutes, active").eq("professional_id", professionalId).eq("active", true).order("name");
    const rlsQ = supabase.from("agenda_availability_rules").select("id, weekday, start_time, end_time, slot_interval_minutes, capacity").eq("professional_id", professionalId);
    const blkQ = supabase.from("agenda_availability_blocks").select("id, block_date, start_time, end_time").eq("professional_id", professionalId).gte("block_date", format(startOfToday(), "yyyy-MM-dd"));
    if (atendenteId === null) {
      svcQ.is("atendente_id", null);
      rlsQ.is("atendente_id", null);
      blkQ.is("atendente_id", null);
    } else {
      svcQ.eq("atendente_id", atendenteId);
      rlsQ.eq("atendente_id", atendenteId);
      blkQ.eq("atendente_id", atendenteId);
    }
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
    return () => { cancelled = true; };
  }, [open, professionalId, step, selectedAtendenteId]);

  const today = startOfToday();

  const isDateDisabled = (date: Date) => {
    if (isBefore(date, today)) return true;
    const weekday = date.getDay();
    const hasRule = rules.some((r) => r.weekday === weekday);
    if (!hasRule) return true;
    const dateStr = format(date, "yyyy-MM-dd");
    const fullyBlocked = blocks.some(
      (b) => b.block_date === dateStr && b.start_time === "00:00" && b.end_time === "23:59"
    );
    return fullyBlocked;
  };

  const totalDurationMinutes = selectedServices.reduce((s, svc) => s + svc.duration_minutes, 0);

  useEffect(() => {
    if (step !== "time" || !selectedDate || selectedServices.length === 0 || !professionalId) {
      setSlots([]);
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
        const interval = rule.slot_interval_minutes || 30;
        for (let m = startMin; m + totalDurationMinutes <= endMin; m += interval) {
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

      let existingQ = supabase
        .from("agenda_appointments")
        .select("start_time, end_time")
        .eq("professional_id", professionalId)
        .eq("appointment_date", dateStr)
        .in("status", ["pending", "confirmed", "done"]);
      if (selectedAtendenteId === null) {
        existingQ = existingQ.is("atendente_id", null);
      } else {
        existingQ = existingQ.eq("atendente_id", selectedAtendenteId);
      }
      const { data: existing } = await existingQ;

      const existingRanges = (existing || []).map((r: { start_time: string; end_time: string }) => ({
        start: timeToMinutes(r.start_time),
        end: timeToMinutes(r.end_time?.slice(0, 5) || r.end_time),
      }));

      const available: string[] = [];
      for (const [slotTime, capacity] of slotSet.entries()) {
        const slotMin = timeToMinutes(slotTime);
        const slotEndMin = slotMin + totalDurationMinutes;
        const overlappingCount = existingRanges.filter((range) => range.start < slotEndMin && range.end > slotMin).length;
        if (overlappingCount < capacity) available.push(slotTime);
      }
      available.sort();
      setSlots(available);
      setLoadingSlots(false);
    };
    loadSlots();
  }, [step, selectedDate, selectedServices, selectedAtendenteId, totalDurationMinutes, rules, blocks, professionalId]);

  const handleConfirmBooking = async () => {
    if (selectedServices.length === 0 || !selectedDate || !selectedSlot) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ title: "Faça login para agendar", variant: "destructive" });
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

      const msg = `Agendamento solicitado: **${servicesLabel}** em ${format(selectedDate, "dd/MM/yyyy", { locale: ptBR })} às ${selectedSlot}. Aguardando confirmação do profissional.`;
      await supabase.from("chat_messages").insert({
        request_id: requestId,
        sender_id: user.id,
        content: msg,
      });

      await supabase.from("notifications").insert({
        user_id: professionalUserId,
        title: "Novo agendamento 📅",
        message: `${servicesLabel} - ${format(selectedDate, "dd/MM/yyyy", { locale: ptBR })} às ${selectedSlot}`,
        type: "appointment",
        link: `/messages/${requestId}`,
      });

      onOpenChange(false);
      toast({ title: "Agendamento enviado! Aguarde a confirmação." });
      navigate(`/messages/${requestId}`);
    } catch (err: unknown) {
      toast({
        title: "Erro ao agendar",
        description: err instanceof Error ? err.message : "Tente novamente.",
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

  const selectedAtendenteName = selectedAtendenteId === null
    ? "Atendimento geral"
    : atendentes.find((a) => a.id === selectedAtendenteId)?.name ?? null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-bold">Agendar Serviço</DialogTitle>
          <DialogDescription>
            {step === "atendente" && "Escolha com quem deseja ser atendido."}
            {step === "service" && "Escolha o serviço desejado."}
            {step === "date" && "Escolha a data."}
            {step === "time" && "Escolha o horário disponível."}
            {step === "confirm" && "Confirme o agendamento."}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && step === "atendente" && atendentes.length > 0 && (
          <div className="flex flex-col gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setSelectedAtendenteId(null);
                setStep("service");
              }}
              className="flex items-center gap-3 w-full p-3 rounded-xl border-2 border-primary/30 bg-primary/5 hover:bg-primary/10 text-left transition-colors"
            >
              {professionalAvatarUrl ? (
                <img src={professionalAvatarUrl} alt="" className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                  <User className="w-6 h-6 text-primary" />
                </div>
              )}
              <div>
                <p className="font-medium text-foreground">Atendimento geral</p>
                <p className="text-xs text-muted-foreground">Qualquer profissional disponível</p>
              </div>
            </button>
            {atendentes.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  setSelectedAtendenteId(a.id);
                  setStep("service");
                }}
                className="flex items-center gap-3 w-full p-3 rounded-xl border bg-card hover:bg-accent/50 text-left transition-colors"
              >
                {a.photo_url ? (
                  <img src={a.photo_url} alt="" className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <User className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground truncate">{a.name}</p>
                  {a.description && <p className="text-xs text-muted-foreground line-clamp-2">{a.description}</p>}
                </div>
              </button>
            ))}
          </div>
        )}

        {!loading && step === "service" && (
          <div className="flex flex-col gap-2 pt-2">
            {atendentes.length > 0 && selectedAtendenteName && (
              <p className="text-xs text-muted-foreground mb-1">Atendente: <strong>{selectedAtendenteName}</strong></p>
            )}
            <p className="text-xs text-muted-foreground">Selecione um ou mais serviços. A duração será a soma.</p>
            {services.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhum serviço disponível para esta escolha.</p>
            ) : (
              <>
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
                      className={`flex justify-between items-center w-full p-3 rounded-xl border text-left transition-colors ${
                        isSelected ? "border-primary bg-primary/10" : "bg-card hover:bg-accent/50"
                      }`}
                    >
                      <span className="font-medium">{s.name}</span>
                      <span className="text-xs text-muted-foreground">{s.duration_minutes} min</span>
                    </button>
                  );
                })}
                {selectedServices.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Total: {selectedServices.reduce((a, b) => a + b.duration_minutes, 0)} min
                  </p>
                )}
                <Button
                  size="sm"
                  className="mt-2 rounded-xl"
                  disabled={selectedServices.length === 0}
                  onClick={() => setStep("date")}
                >
                  Próximo
                </Button>
              </>
            )}
            {atendentes.length > 0 && (
              <Button variant="ghost" size="sm" className="mt-2 rounded-lg" onClick={() => { setSelectedServices([]); setSelectedDate(undefined); setSelectedSlot(null); setStep("atendente"); }}>
                Trocar atendente
              </Button>
            )}
          </div>
        )}

        {!loading && step === "date" && selectedServices.length > 0 && (
          <div className="pt-2">
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
            />
            <div className="flex gap-2 mt-3">
              <Button variant="outline" size="sm" onClick={() => setStep("service")}>
                Voltar
              </Button>
            </div>
          </div>
        )}

        {!loading && step === "time" && selectedServices.length > 0 && selectedDate && (
          <div className="pt-2">
            <p className="text-sm text-muted-foreground mb-2">
              {format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
            </p>
            {loadingSlots ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : slots.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhum horário disponível neste dia.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {slots.map((slot) => (
                  <Button
                    key={slot}
                    variant={selectedSlot === slot ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedSlot(slot)}
                  >
                    {slot}
                  </Button>
                ))}
              </div>
            )}
            <div className="flex gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={() => setStep("date")}>
                Voltar
              </Button>
              {selectedSlot && (
                <Button size="sm" onClick={() => setStep("confirm")}>
                  Próximo
                </Button>
              )}
            </div>
          </div>
        )}

        {!loading && step === "confirm" && selectedServices.length > 0 && selectedDate && selectedSlot && (
          <div className="pt-2 space-y-3">
            <div className="p-3 rounded-xl bg-muted/50 text-sm">
              {selectedAtendenteName && <p><strong>Atendente:</strong> {selectedAtendenteName}</p>}
              <p><strong>Serviço(s):</strong> {selectedServices.map((s) => s.name).join(" + ")}</p>
              <p><strong>Duração total:</strong> {totalDurationMinutes} min</p>
              <p><strong>Data:</strong> {format(selectedDate, "dd/MM/yyyy", { locale: ptBR })}</p>
              <p><strong>Horário:</strong> {selectedSlot}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setStep("time")}>
                Voltar
              </Button>
              <Button onClick={handleConfirmBooking} disabled={sending}>
                {sending ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Enviando...</> : "Confirmar agendamento"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
