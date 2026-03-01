/**
 * Edge Function: Lembretes de agendamento (24h e 1h antes).
 * Deve ser invocada por cron a cada 15–30 min (ex.: Supabase Dashboard > Edge Functions > Cron).
 *
 * Regras:
 * - Considera appointments com status 'confirmed' (e opcionalmente 'pending').
 * - Horário do agendamento é interpretado no fuso Brasil (UTC-3).
 * - 24h: janela [now + 23h30, now + 24h30].
 * - 1h: janela [now + 50min, now + 70min].
 * - Evita duplicata via tabela agenda_reminder_log.
 */

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BRAZIL_UTC_OFFSET_HOURS = 3;

function appointmentToUtcMs(
  appointmentDate: string,
  startTime: string
): number {
  const [y, m, d] = appointmentDate.split("-").map(Number);
  const timePart = startTime.slice(0, 5);
  const [h, min] = timePart.split(":").map(Number);
  return Date.UTC(y, m - 1, d, h + BRAZIL_UTC_OFFSET_HOURS, min, 0, 0);
}

serve(async (req) => {
  try {
    const cronSecret = Deno.env.get("CRON_SECRET");
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    if (cronSecret && token !== cronSecret) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = Date.now();
    const window24Min = now + (23.5 * 60 * 60 * 1000);
    const window24Max = now + (24.5 * 60 * 60 * 1000);
    const window1hMin = now + (50 * 60 * 1000);
    const window1hMax = now + (70 * 60 * 1000);

    const { data: appointments, error: fetchError } = await supabase
      .from("agenda_appointments")
      .select(
        "id, client_id, professional_id, appointment_date, start_time, chat_request_id, agenda_services(name)"
      )
      .in("status", ["confirmed", "pending"]);

    if (fetchError) {
      console.error("Erro ao buscar appointments:", fetchError);
      return new Response(
        JSON.stringify({ error: fetchError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const { data: sentLog } = await supabase
      .from("agenda_reminder_log")
      .select("appointment_id, reminder_type");

    const sentSet = new Set<string>();
    for (const row of sentLog || []) {
      const r = row as { appointment_id: string; reminder_type: string };
      sentSet.add(`${r.appointment_id}:${r.reminder_type}`);
    }

    const linkBase = Deno.env.get("APP_URL") || "";
    const formatTime = (t: string) => t.slice(0, 5);
    let sent24 = 0;
    let sent1h = 0;

    for (const app of appointments || []) {
      const a = app as {
        id: string;
        client_id: string;
        professional_id: string;
        appointment_date: string;
        start_time: string;
        chat_request_id: string | null;
        agenda_services: { name: string } | null;
      };
      const utcMs = appointmentToUtcMs(a.appointment_date, a.start_time);
      const serviceName = a.agenda_services?.name || "Serviço";
      const timeStr = formatTime(a.start_time);
      const dateStr = a.appointment_date;
      const link = a.chat_request_id
        ? `${linkBase}/messages/${a.chat_request_id}`.replace(/\/\/messages/, "/messages")
        : null;

      if (utcMs >= window24Min && utcMs <= window24Max) {
        if (sentSet.has(`${a.id}:24h`)) continue;
        const { data: pro } = await supabase
          .from("professionals")
          .select("user_id")
          .eq("id", a.professional_id)
          .single();

        const title24 = "Lembrete: agendamento em 24h";
        const msg24 = `${serviceName} em ${dateStr} às ${timeStr}.`;

        const rows24: { user_id: string; title: string; message: string; type: string; link: string | null }[] = [
          { user_id: a.client_id, title: title24, message: msg24, type: "appointment", link },
        ];
        const proUserId = (pro as { user_id?: string } | null)?.user_id;
        if (proUserId) rows24.push({ user_id: proUserId, title: title24, message: msg24, type: "appointment", link });
        await supabase.from("notifications").insert(rows24);

        await supabase.from("agenda_reminder_log").insert({
          appointment_id: a.id,
          reminder_type: "24h",
        });
        sent24++;
      }

      if (utcMs >= window1hMin && utcMs <= window1hMax) {
        if (sentSet.has(`${a.id}:1h`)) continue;
        const { data: pro } = await supabase
          .from("professionals")
          .select("user_id")
          .eq("id", a.professional_id)
          .single();

        const title1h = "Lembrete: agendamento em 1 hora";
        const msg1h = `${serviceName} hoje às ${timeStr}.`;

        const rows1h: { user_id: string; title: string; message: string; type: string; link: string | null }[] = [
          { user_id: a.client_id, title: title1h, message: msg1h, type: "appointment", link },
        ];
        const proUserId1h = (pro as { user_id?: string } | null)?.user_id;
        if (proUserId1h) rows1h.push({ user_id: proUserId1h, title: title1h, message: msg1h, type: "appointment", link });
        await supabase.from("notifications").insert(rows1h);

        await supabase.from("agenda_reminder_log").insert({
          appointment_id: a.id,
          reminder_type: "1h",
        });
        sent1h++;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        reminders_24h: sent24,
        reminders_1h: sent1h,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("agenda-reminders error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
