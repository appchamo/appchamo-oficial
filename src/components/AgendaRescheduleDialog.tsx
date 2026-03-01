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
import { Loader2 } from "lucide-react";
import { addDays, startOfToday, format, isBefore } from "date-fns";
import { ptBR } from "date-fns/locale";

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

interface AgendaRescheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentId: string;
  professionalId: string;
  serviceId: string;
  durationMinutes: number;
  clientId: string;
  onRescheduled: (newDate: string, newStart: string, newEnd: string) => void;
}

export default function AgendaRescheduleDialog({
  open,
  onOpenChange,
  appointmentId,
  professionalId,
  serviceId,
  durationMinutes,
  clientId,
  onRescheduled,
}: AgendaRescheduleDialogProps) {
  const [rules, setRules] = useState<{ weekday: number; start_time: string; end_time: string; slot_interval_minutes: number; capacity: number }[]>([]);
  const [blocks, setBlocks] = useState<{ block_date: string; start_time: string; end_time: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const today = startOfToday();

  useEffect(() => {
    if (!open || !professionalId) return;
    setSelectedDate(undefined);
    setSelectedSlot(null);
    setSlots([]);
    const load = async () => {
      setLoading(true);
      const [
        { data: rls },
        { data: blk },
      ] = await Promise.all([
        supabase.from("agenda_availability_rules").select("weekday, start_time, end_time, slot_interval_minutes, capacity").eq("professional_id", professionalId),
        supabase.from("agenda_availability_blocks").select("block_date, start_time, end_time").eq("professional_id", professionalId).gte("block_date", format(today, "yyyy-MM-dd")),
      ]);
      setRules((rls as any[]) || []);
      setBlocks((blk as any[]) || []);
      setLoading(false);
    };
    load();
  }, [open, professionalId]);

  const isDateDisabled = (date: Date) => {
    if (isBefore(date, today)) return true;
    const weekday = date.getDay();
    return !rules.some((r) => r.weekday === weekday);
  };

  useEffect(() => {
    if (!open || !selectedDate) {
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
        for (let m = startMin; m + durationMinutes <= endMin; m += interval) {
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
          const slotEndMin = slotMin + durationMinutes;
          if (slotMin < blkEnd && slotEndMin > blkStart) slotSet.delete(slotTime);
        }
      }
      const { data: existing } = await supabase
        .from("agenda_appointments")
        .select("start_time")
        .eq("professional_id", professionalId)
        .eq("appointment_date", dateStr)
        .in("status", ["pending", "confirmed", "done"])
        .neq("id", appointmentId);
      const countBySlot = new Map<string, number>();
      for (const row of existing || []) {
        const t = (row as { start_time: string }).start_time;
        countBySlot.set(t, (countBySlot.get(t) ?? 0) + 1);
      }
      const available: string[] = [];
      for (const [slotTime, capacity] of slotSet.entries()) {
        const count = countBySlot.get(slotTime) ?? 0;
        if (count < capacity) available.push(slotTime);
      }
      available.sort();
      setSlots(available);
      setLoadingSlots(false);
    };
    loadSlots();
  }, [open, selectedDate, rules, blocks, professionalId, durationMinutes, appointmentId]);

  const handleConfirm = async () => {
    if (!selectedDate || !selectedSlot) return;
    setSaving(true);
    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const startMin = timeToMinutes(selectedSlot);
      const endTime = minutesToTime(startMin + durationMinutes);
      const { error } = await supabase
        .from("agenda_appointments")
        .update({ appointment_date: dateStr, start_time: selectedSlot, end_time: endTime })
        .eq("id", appointmentId);
      if (error) throw error;
      onRescheduled(dateStr, selectedSlot, endTime);
      onOpenChange(false);
      toast({ title: "Agendamento remarcado!" });
    } catch (e: any) {
      toast({ title: "Erro ao remarcar", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Remarcar agendamento</DialogTitle>
          <DialogDescription>Escolha a nova data e horário.</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              disabled={isDateDisabled}
              locale={ptBR}
              fromDate={today}
              toDate={addDays(today, 60)}
            />
            {selectedDate && (
              <>
                <p className="text-sm text-muted-foreground">
                  {format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
                </p>
                {loadingSlots ? (
                  <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
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
              </>
            )}
            <div className="flex gap-2 mt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={handleConfirm} disabled={!selectedSlot || saving}>
                {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Salvando...</> : "Confirmar remarcação"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
