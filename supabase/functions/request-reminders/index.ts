/**
 * Edge Function: Lembretes para profissional responder solicitação de serviço.
 * Invocada por cron a cada 15 min (x-hook-secret).
 *
 * Regras:
 * - Busca service_requests com status 'pending' (sem resposta do profissional).
 * - Lembrete 30min: solicitação criada há [25min, 35min].
 * - Lembrete 2h:   solicitação criada há [1h50, 2h10].
 * - Evita duplicata via tabela request_reminder_log (unique request_id + reminder_type).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  // Autenticação: mesmo padrão dos outros crons (x-hook-secret == EMAIL_HOOK_SECRET).
  const hookSecret = (Deno.env.get("EMAIL_HOOK_SECRET") || "").trim();
  const got = (req.headers.get("x-hook-secret") || "").trim();
  if (!hookSecret || got !== hookSecret) return json({ error: "unauthorized" }, 401);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = Date.now();
    const w30min_min = now - 35 * 60 * 1000;
    const w30min_max = now - 25 * 60 * 1000;
    const w2h_min = now - (2 * 60 + 10) * 60 * 1000;
    const w2h_max = now - (1 * 60 + 50) * 60 * 1000;

    const threeHoursAgo = new Date(now - 3 * 60 * 60 * 1000).toISOString();
    const { data: requests, error: fetchErr } = await supabase
      .from("service_requests")
      .select("id, client_id, professional_id, created_at, protocol")
      .eq("status", "pending")
      .gte("created_at", threeHoursAgo)
      .order("created_at", { ascending: false });

    if (fetchErr) return json({ error: fetchErr.message }, 500);

    const requestIds = (requests || []).map((r: any) => r.id);
    const { data: sentLog } = requestIds.length > 0
      ? await supabase.from("request_reminder_log").select("request_id, reminder_type").in("request_id", requestIds)
      : { data: [] };

    const sentSet = new Set<string>();
    for (const row of sentLog || []) {
      const r = row as { request_id: string; reminder_type: string };
      sentSet.add(`${r.request_id}:${r.reminder_type}`);
    }

    let sent30min = 0;
    let sent2h = 0;

    for (const req of requests || []) {
      const r = req as { id: string; client_id: string; professional_id: string; created_at: string; protocol: string | null };
      const createdMs = new Date(r.created_at).getTime();
      const link = `/messages/${r.id}`;
      const protocol = r.protocol ? ` (${r.protocol})` : "";

      const { data: proRow } = await supabase.from("professionals").select("user_id").eq("id", r.professional_id).maybeSingle();
      const proUserId = (proRow as { user_id?: string } | null)?.user_id;
      if (!proUserId) continue;

      if (createdMs >= w30min_min && createdMs <= w30min_max && !sentSet.has(`${r.id}:30min`)) {
        await supabase.from("notifications").insert({
          user_id: proUserId,
          title: "⏰ Você tem um cliente esperando!",
          message: `Um cliente está aguardando sua resposta${protocol}. Aceite ou recuse para não perder a oportunidade.`,
          type: "reminder",
          link,
        });
        await supabase.from("request_reminder_log").upsert({ request_id: r.id, reminder_type: "30min" }, { onConflict: "request_id,reminder_type" });
        sent30min++;
      }

      if (createdMs >= w2h_min && createdMs <= w2h_max && !sentSet.has(`${r.id}:2h`)) {
        await supabase.from("notifications").insert({
          user_id: proUserId,
          title: "🔔 Solicitação ainda sem resposta",
          message: `Há 2 horas um cliente aguarda sua resposta${protocol}. Responda agora para não perder a chamada.`,
          type: "reminder",
          link,
        });
        await supabase.from("request_reminder_log").upsert({ request_id: r.id, reminder_type: "2h" }, { onConflict: "request_id,reminder_type" });
        sent2h++;
      }
    }

    return json({ ok: true, reminders_30min: sent30min, reminders_2h: sent2h });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
