/**
 * Lembrete de assinatura não concluída.
 * Acha subscription_payments com status 'pending' (começou a assinar e não pagou),
 * sem plano pago ativo daquele plano, e manda push + email pra terminar.
 * Invocada por cron (x-hook-secret). Dedupe via subscription_payments.reminder_sent_at.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const planLabel = (p: string) => ({ vip: "VIP", pro: "Pro", business: "Business" } as Record<string, string>)[p] || p;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const hookSecret = (Deno.env.get("EMAIL_HOOK_SECRET") || "").trim();
  if (!hookSecret || (req.headers.get("x-hook-secret") || "").trim() !== hookSecret) return json({ error: "unauthorized" }, 401);

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const now = Date.now();
    const min = new Date(now - 7 * 86400000).toISOString();   // no máximo 7 dias atrás
    const max = new Date(now - 3 * 3600000).toISOString();    // pelo menos 3h atrás (dá tempo de pagar)

    const { data: pend } = await admin
      .from("subscription_payments")
      .select("id, user_id, plan_id, amount, created_at")
      .eq("status", "pending")
      .is("reminder_sent_at", null)
      .gte("created_at", min)
      .lte("created_at", max)
      .limit(500);
    if (!pend || !pend.length) return json({ ok: true, sent: 0, reason: "nada pendente" });

    // Já pagaram? (plano ativo do mesmo tipo) — não incomoda.
    const userIds = [...new Set(pend.map((p: any) => p.user_id))];
    const { data: subs } = await admin.from("subscriptions").select("user_id, plan_id, status").in("user_id", userIds);
    const activePaid = new Set<string>();
    for (const s of (subs || []) as any[]) if (String(s.status || "").toLowerCase() === "active") activePaid.add(`${s.user_id}:${s.plan_id}`);

    const { data: profs } = await admin.from("profiles").select("user_id, full_name, email, is_blocked").in("user_id", userIds);
    const profMap = new Map((profs || []).map((p: any) => [p.user_id, p]));

    const host = Deno.env.get("SMTP_HOST") || "", userS = Deno.env.get("SMTP_USER") || "", pass = Deno.env.get("SMTP_PASS") || "";
    const from = Deno.env.get("SMTP_FROM") || "Chamo <nao-responda@appchamo.com>", port = Number(Deno.env.get("SMTP_PORT") || "587");

    let sent = 0;
    const stamped: string[] = [];
    for (const p of pend as any[]) {
      if (activePaid.has(`${p.user_id}:${p.plan_id}`)) { stamped.push(p.id); continue; } // já concluiu
      const pr = profMap.get(p.user_id);
      if (!pr || pr.is_blocked) { stamped.push(p.id); continue; }
      const plano = planLabel(p.plan_id);
      const nome = (pr.full_name || "").split(" ")[0] || "";

      await admin.from("notifications").insert({
        user_id: p.user_id,
        title: "Faltou só terminar! ⏳",
        message: `Sua assinatura do plano ${plano} ficou pela metade. Conclua e ative seus benefícios agora.`,
        type: "info",
        link: "/subscriptions",
        metadata: { source: "incomplete_subscription", plan: p.plan_id },
      });

      if (host && userS && pass && pr.email) {
        const html = '<div style="background:#f5f5f5;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">'
          + '<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:28px 24px">'
          + '<p style="margin:0;font-size:22px;font-weight:800;color:#ea580c">CHAMÔ</p>'
          + `<h1 style="font-size:20px;color:#111;margin:14px 0 6px">${nome ? nome + ", f" : "F"}altou só terminar sua assinatura ⏳</h1>`
          + `<p style="font-size:15px;color:#444;line-height:1.5">Você começou a assinar o plano <b>${plano}</b> mas não finalizou. Conclua agora e ative destaque, selo e prioridade no Chamô.</p>`
          + '<a href="https://appchamo.com/subscriptions" style="display:inline-block;margin-top:16px;background:#ea580c;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:700;font-size:15px">Terminar minha assinatura</a>'
          + '<p style="font-size:11px;color:#aaa;margin-top:20px">Se já assinou, pode ignorar este email.</p>'
          + '</div></div>';
        try {
          const client = new SMTPClient({ connection: { hostname: host, port, tls: port === 465, auth: { username: userS, password: pass } } });
          await client.send({ from, to: pr.email, subject: `Faltou terminar sua assinatura ${plano} no Chamô`, html, content: "auto" });
          await client.close();
        } catch (_e) { /* segue */ }
      }
      stamped.push(p.id);
      sent++;
    }

    if (stamped.length) {
      await admin.from("subscription_payments").update({ reminder_sent_at: new Date().toISOString() }).in("id", stamped);
    }
    return json({ ok: true, sent, pending: pend.length });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
