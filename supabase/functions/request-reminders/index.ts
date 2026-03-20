/**
 * Edge Function: Lembretes para profissional responder solicitação de serviço.
 * Deve ser invocada por cron a cada 15–30 min.
 *
 * Regras:
 * - Busca service_requests com status 'pending' (sem resposta do profissional).
 * - Lembrete 30min: solicitação criada há [25min, 35min].
 * - Lembrete 2h:   solicitação criada há [1h50, 2h10].
 * - Evita duplicata via tabela request_reminder_log (unique request_id + reminder_type).
 */

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const cronSecret = Deno.env.get("CRON_SECRET");
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");
    if (cronSecret && token !== cronSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = Date.now();

    // Janelas de tempo (em ms)
    const w30min_min = now - 35 * 60 * 1000;  // 35 min atrás
    const w30min_max = now - 25 * 60 * 1000;  // 25 min atrás
    const w2h_min   = now - (2 * 60 + 10) * 60 * 1000; // 2h10 atrás
    const w2h_max   = now - (1 * 60 + 50) * 60 * 1000; // 1h50 atrás

    // Busca solicitações pendentes criadas dentro da janela mais ampla (últimas 3h)
    const threeHoursAgo = new Date(now - 3 * 60 * 60 * 1000).toISOString();
    const { data: requests, error: fetchErr } = await supabase
      .from("service_requests")
      .select("id, client_id, professional_id, created_at, protocol")
      .eq("status", "pending")
      .gte("created_at", threeHoursAgo)
      .order("created_at", { ascending: false });

    if (fetchErr) {
      console.error("Erro ao buscar requests:", fetchErr);
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Busca logs de lembretes já enviados para as requests encontradas
    const requestIds = (requests || []).map((r: any) => r.id);
    const { data: sentLog } = requestIds.length > 0
      ? await supabase
          .from("request_reminder_log")
          .select("request_id, reminder_type")
          .in("request_id", requestIds)
      : { data: [] };

    const sentSet = new Set<string>();
    for (const row of sentLog || []) {
      const r = row as { request_id: string; reminder_type: string };
      sentSet.add(`${r.request_id}:${r.reminder_type}`);
    }

    let sent30min = 0;
    let sent2h = 0;

    for (const req of requests || []) {
      const r = req as {
        id: string;
        client_id: string;
        professional_id: string;
        created_at: string;
        protocol: string | null;
      };

      const createdMs = new Date(r.created_at).getTime();
      const link = `/messages/${r.id}`;
      const protocol = r.protocol ? ` (${r.protocol})` : "";

      // Busca o user_id do profissional
      const { data: proRow } = await supabase
        .from("professionals")
        .select("user_id")
        .eq("id", r.professional_id)
        .maybeSingle();
      const proUserId = (proRow as { user_id?: string } | null)?.user_id;
      if (!proUserId) continue;

      // ─── Lembrete 30 minutos ───────────────────────────────────────────────
      if (createdMs >= w30min_min && createdMs <= w30min_max) {
        if (!sentSet.has(`${r.id}:30min`)) {
          await supabase.from("notifications").insert({
            user_id: proUserId,
            title: "⏰ Você tem um cliente esperando!",
            message: `Um cliente está aguardando sua resposta${protocol}. Aceite ou recuse a solicitação para não perder a oportunidade.`,
            type: "reminder",
            link,
          });

          // Log para não repetir
          await supabase.from("request_reminder_log").upsert(
            { request_id: r.id, reminder_type: "30min" },
            { onConflict: "request_id,reminder_type" }
          );
          sent30min++;
        }
      }

      // ─── Lembrete 2 horas ─────────────────────────────────────────────────
      if (createdMs >= w2h_min && createdMs <= w2h_max) {
        if (!sentSet.has(`${r.id}:2h`)) {
          await supabase.from("notifications").insert({
            user_id: proUserId,
            title: "🔔 Solicitação ainda sem resposta",
            message: `Há 2 horas um cliente aguarda sua resposta${protocol}. Responda agora para não perder a chamada.`,
            type: "reminder",
            link,
          });

          await supabase.from("request_reminder_log").upsert(
            { request_id: r.id, reminder_type: "2h" },
            { onConflict: "request_id,reminder_type" }
          );
          sent2h++;
        }
      }
    }

    console.log(`✅ Lembretes enviados — 30min: ${sent30min}, 2h: ${sent2h}`);

    return new Response(
      JSON.stringify({ ok: true, reminders_30min: sent30min, reminders_2h: sent2h }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("request-reminders error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
