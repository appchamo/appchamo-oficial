/**
 * Broadcast de upgrade para TODOS os profissionais no plano FREE.
 * Regras: cadastrados há mais de 3 dias, plano free (sem plano pago/cortesia ativo), não bloqueados.
 * Cadência: 1 a cada 2 dias (cron). DEDUPE à prova de bala via notifications (source=upgrade_nudge),
 * pula quem já recebeu nas últimas 44h. Só push (sem email, pra não virar spam a cada 2 dias).
 * Copy adapta: quem teve chamadas nos últimos 14 dias vê o número; quem não teve, versão genérica.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const PAID = ["vip", "pro", "business"];
const MIN_ACCOUNT_DAYS = 3;
const DEDUPE_HOURS = 44;   // não repete dentro de ~2 dias
const BATCH = 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const hookSecret = (Deno.env.get("EMAIL_HOOK_SECRET") || "").trim();
  if (!hookSecret || (req.headers.get("x-hook-secret") || "").trim() !== hookSecret) return json({ error: "unauthorized" }, 401);

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const now = Date.now();
    const accountCutoff = new Date(now - MIN_ACCOUNT_DAYS * 86400000).toISOString();
    const since14 = new Date(now - 14 * 86400000).toISOString();
    const dedupeSince = new Date(now - DEDUPE_HOURS * 3600000).toISOString();

    // Pros ativos, aprovados, cadastrados há +3 dias.
    const { data: pros } = await admin.from("professionals")
      .select("id, user_id, created_at")
      .eq("active", true).eq("profile_status", "approved")
      .lt("created_at", accountCutoff)
      .limit(20000);
    if (!pros || !pros.length) return json({ ok: true, sent: 0, reason: "sem pros" });

    // Quem tem plano pago ativo (inclui cortesia) sai.
    const { data: subs } = await admin.from("subscriptions").select("user_id, plan_id, status").in("plan_id", PAID);
    const paidSet = new Set<string>();
    for (const s of (subs || []) as any[]) if (String(s.status || "").toLowerCase() === "active") paidSet.add(s.user_id);

    // Já recebeu upgrade_nudge nas últimas 44h? (dedupe robusto via notifications)
    const { data: recent } = await admin.from("notifications")
      .select("user_id").contains("metadata", { source: "upgrade_nudge" }).gte("created_at", dedupeSince).limit(20000);
    const recentSet = new Set<string>((recent || []).map((r: any) => r.user_id));

    const freePros = (pros as any[]).filter((p) => !paidSet.has(p.user_id) && !recentSet.has(p.user_id));
    if (!freePros.length) return json({ ok: true, sent: 0, reason: "ninguem elegivel agora" });

    // Chamadas nos últimos 14 dias por pro.
    const proIds = freePros.map((p) => p.id);
    const { data: reqs } = await admin.from("service_requests")
      .select("professional_id, request_kind, created_at").gte("created_at", since14).limit(50000);
    const calls: Record<string, number> = {};
    for (const r of (reqs || []) as any[]) {
      if (r.request_kind === "following") continue;
      if (calls[r.professional_id] === undefined) calls[r.professional_id] = 0;
      calls[r.professional_id]++;
    }

    // Perfis (nome, bloqueio).
    const userIds = freePros.map((p) => p.user_id);
    const { data: profs } = await admin.from("profiles").select("user_id, full_name, is_blocked").in("user_id", userIds);
    const profMap = new Map((profs || []).map((p: any) => [p.user_id, p]));

    let sent = 0;
    for (const p of freePros) {
      if (sent >= BATCH) break;
      const pr = profMap.get(p.user_id);
      if (!pr || pr.is_blocked) continue;
      const nome = (pr.full_name || "").split(" ")[0] || "";
      const c = calls[p.id] || 0;

      const title = c > 0
        ? `${c} ${c === 1 ? "cliente te chamou" : "clientes te chamaram"} 👀`
        : "Apareça no topo da busca";
      const message = c > 0
        ? `Isso já sem ser Pro. No plano Pro você aparece no topo da busca e recebe ainda mais. Vale a pena?`
        : `${nome ? nome + ", o" : "O"} cliente clica primeiro em quem está no topo da busca. O plano Pro coloca você lá.`;

      await admin.from("notifications").insert({
        user_id: p.user_id,
        title,
        message,
        type: "info",
        link: "/subscriptions",
        metadata: { source: "upgrade_nudge", calls: c },
      });
      sent++;
    }

    return json({ ok: true, sent, elegiveis: freePros.length, total_free: freePros.length });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
