/**
 * Empurrão de upgrade: profissional no plano free que está recebendo chamadas
 * ganha um convite (push + email) pra virar Pro/VIP e aparecer em destaque.
 * Invocada por cron (x-hook-secret). Dedupe via profiles.upgrade_nudge_sent_at (cooldown 30 dias).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const PAID = ["vip", "pro", "business"];
const DEMAND_MIN = 3;      // mínimo de chamadas em 14 dias pra receber o convite
const COOLDOWN_DAYS = 30;  // não repete o convite antes disso
const BATCH = 80;          // limite de envios por rodada

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const hookSecret = (Deno.env.get("EMAIL_HOOK_SECRET") || "").trim();
  if (!hookSecret || (req.headers.get("x-hook-secret") || "").trim() !== hookSecret) return json({ error: "unauthorized" }, 401);

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const now = Date.now();
    const since14 = new Date(now - 14 * 86400000).toISOString();
    const cooldown = new Date(now - COOLDOWN_DAYS * 86400000).toISOString();

    // Pros ativos e aprovados.
    const { data: pros } = await admin.from("professionals").select("id, user_id").eq("active", true).eq("profile_status", "approved").limit(5000);
    if (!pros || !pros.length) return json({ ok: true, sent: 0, reason: "sem pros" });
    const proByUser = new Map(pros.map((p: any) => [p.user_id, p.id]));

    // Quem já tem plano pago ativo (inclui cortesia = já tem destaque) fica de fora.
    const { data: subs } = await admin.from("subscriptions").select("user_id, plan_id, status").in("plan_id", PAID);
    const paidSet = new Set<string>();
    for (const s of (subs || []) as any[]) if (String(s.status || "").toLowerCase() === "active") paidSet.add(s.user_id);

    // Demanda: chamadas nos últimos 14 dias por professional_id.
    const { data: reqs } = await admin.from("service_requests").select("professional_id, created_at").gte("created_at", since14).limit(50000);
    const reqCount: Record<string, number> = {};
    for (const r of (reqs || []) as any[]) if (r.professional_id) reqCount[r.professional_id] = (reqCount[r.professional_id] || 0) + 1;

    // Candidatos: pro free (não pago) com demanda >= mínimo.
    const candidates: { user_id: string; calls: number }[] = [];
    for (const p of pros as any[]) {
      if (paidSet.has(p.user_id)) continue;
      const calls = reqCount[p.id] || 0;
      if (calls >= DEMAND_MIN) candidates.push({ user_id: p.user_id, calls });
    }
    if (!candidates.length) return json({ ok: true, sent: 0, reason: "ninguem com demanda suficiente" });

    // Dados + cooldown.
    const ids = candidates.map((c) => c.user_id);
    const { data: profs } = await admin.from("profiles").select("user_id, full_name, email, is_blocked, upgrade_nudge_sent_at").in("user_id", ids);
    const profMap = new Map((profs || []).map((p: any) => [p.user_id, p]));

    // SMTP
    const host = Deno.env.get("SMTP_HOST") || "", userS = Deno.env.get("SMTP_USER") || "", pass = Deno.env.get("SMTP_PASS") || "";
    const from = Deno.env.get("SMTP_FROM") || "Chamo <nao-responda@appchamo.com>", port = Number(Deno.env.get("SMTP_PORT") || "587");

    let sent = 0;
    const stamped: string[] = [];
    for (const c of candidates.sort((a, b) => b.calls - a.calls)) {
      if (sent >= BATCH) break;
      const pr = profMap.get(c.user_id);
      if (!pr || pr.is_blocked) continue;
      if (pr.upgrade_nudge_sent_at && pr.upgrade_nudge_sent_at > cooldown) continue;

      const nome = (pr.full_name || "").split(" ")[0] || "profissional";
      // Push (via trigger ao inserir notificação)
      await admin.from("notifications").insert({
        user_id: c.user_id,
        title: "🚀 Você está bombando no Chamô!",
        message: `${c.calls} clientes te chamaram nos últimos 14 dias. Vire destaque e apareça no topo pra receber ainda mais.`,
        type: "info",
        link: "/subscriptions",
        metadata: { source: "upgrade_nudge", calls: c.calls },
      });

      // Email
      if (host && userS && pass && pr.email) {
        const html = '<div style="background:#f5f5f5;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">'
          + '<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:28px 24px">'
          + '<p style="margin:0;font-size:22px;font-weight:800;color:#ea580c">CHAMÔ</p>'
          + `<h1 style="font-size:20px;color:#111;margin:14px 0 6px">${nome}, você está recebendo bastante procura! 🎉</h1>`
          + `<p style="font-size:15px;color:#444;line-height:1.5">Nos últimos 14 dias, <b>${c.calls} clientes</b> te chamaram. Imagina quantos mais você atende aparecendo <b>em destaque no topo das buscas</b>.</p>`
          + '<p style="font-size:15px;color:#444;line-height:1.5">Assinando o plano <b>Pro</b> ou <b>VIP</b> você ganha destaque, selo e prioridade — mais visibilidade = mais serviço fechado.</p>'
          + '<a href="https://appchamo.com/subscriptions" style="display:inline-block;margin-top:16px;background:#ea580c;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:700;font-size:15px">Quero aparecer em destaque</a>'
          + '<p style="font-size:11px;color:#aaa;margin-top:20px">Você recebe este email por ser profissional no Chamô.</p>'
          + '</div></div>';
        try {
          const client = new SMTPClient({ connection: { hostname: host, port, tls: port === 465, auth: { username: userS, password: pass } } });
          await client.send({ from, to: pr.email, subject: `${nome}, ${c.calls} clientes te chamaram — vire destaque no Chamô`, html, content: "auto" });
          await client.close();
        } catch (_e) { /* segue */ }
      }

      stamped.push(c.user_id);
      sent++;
    }

    if (stamped.length) {
      await admin.from("profiles").update({ upgrade_nudge_sent_at: new Date().toISOString() }).in("user_id", stamped);
    }
    return json({ ok: true, sent, candidates: candidates.length });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
