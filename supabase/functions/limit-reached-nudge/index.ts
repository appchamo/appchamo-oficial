/**
 * Aviso + sequência de lembretes quando o pro free bate o limite de chamadas.
 * Estágios: 1 = na hora, 2 = 24h, 3 = 3 dias, 4 = 7 dias.
 * Invocada por cron de hora em hora (x-hook-secret).
 * Reseta a sequência automaticamente se o pro deixar de estar no limite (assinou / ganhou bônus).
 * Calcula o limite direto das tabelas (sem RPC, pra não depender do cache do PostgREST).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const H = 3600000, D = 86400000;

function copy(stage: number, nome: string, visitas: number) {
  const v = visitas > 0 ? `${visitas} ${visitas === 1 ? "pessoa visitou" : "pessoas visitaram"} seu perfil` : "Clientes estão te procurando";
  switch (stage) {
    case 1: return {
      title: "🔒 Você atingiu o limite do plano grátis",
      msg: "Você recebeu suas 3 chamadas grátis. Novos clientes já não conseguem te chamar. Ative o Pro e volte a receber agora.",
      subject: `${nome ? nome + ", v" : "V"}ocê atingiu o limite de chamadas — reative com o Pro`,
      h1: `${nome ? nome + ", v" : "V"}ocê bateu o limite do plano grátis 🔒`,
      body: "Você já recebeu suas 3 chamadas gratuitas. A partir de agora, <b>novos clientes não conseguem mais te chamar</b> — seu perfil fica fora da busca. Ative o plano <b>Pro</b> e volte a receber chamadas ilimitadas hoje mesmo.",
    };
    case 2: return {
      title: "👀 Clientes querendo te chamar",
      msg: `${v}, mas não conseguem te chamar porque você está no limite do plano grátis. Ative o Pro e volte pro jogo.`,
      subject: `${nome ? nome + ", c" : "C"}lientes estão te procurando no Chamô`,
      h1: "Tem cliente querendo te chamar 👀",
      body: `${v} nas últimas horas, mas <b>não conseguem te chamar</b> porque você atingiu o limite do plano grátis. Entre no <b>Pro</b> e teste agora — volta a aparecer no topo e recebe chamadas sem limite.`,
    };
    case 3: return {
      title: "⏳ 3 dias invisível pra novos clientes",
      msg: "Faz 3 dias que você não aparece pra novos clientes. Cada dia parado é serviço indo pro concorrente. Assine o Pro e reative agora.",
      subject: `${nome ? nome + ", " : ""}3 dias sem receber chamadas no Chamô`,
      h1: "Faz 3 dias que você está invisível ⏳",
      body: "Já são <b>3 dias</b> que novos clientes não te encontram na busca por causa do limite do plano grátis. Cada dia parado é serviço que vai pro concorrente. Ative o <b>Pro</b> e volte a receber chamadas ainda hoje.",
    };
    default: return {
      title: "💸 Uma semana sem receber chamadas",
      msg: "Faz 1 semana que você está fora da busca. Seus clientes continuam te procurando. Teste o Pro e volte a aparecer no topo hoje.",
      subject: `${nome ? nome + ", " : ""}reative seu perfil no Chamô e volte a receber`,
      h1: "Uma semana sem novas chamadas 💸",
      body: "Já faz <b>uma semana</b> que seu perfil está fora da busca por causa do limite grátis, e os clientes continuam procurando profissional como você. Teste o plano <b>Pro</b> e volte a aparecer no topo — sem limite de chamadas.",
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const hookSecret = (Deno.env.get("EMAIL_HOOK_SECRET") || "").trim();
  if (!hookSecret || (req.headers.get("x-hook-secret") || "").trim() !== hookSecret) return json({ error: "unauthorized" }, 401);

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const now = Date.now();

    const { data: cands } = await admin
      .from("professionals")
      .select("id, user_id, bonus_calls, call_limit_reached_at, call_limit_nudge_stage")
      .not("call_limit_reached_at", "is", null)
      .limit(2000);
    if (!cands || !cands.length) return json({ ok: true, sent: 0, reason: "ninguem no limite" });

    const userIds = cands.map((c: any) => c.user_id);
    const proIds = cands.map((c: any) => c.id);
    const [{ data: profs }, { data: counters }, { data: subs }, { data: plans }, { data: reqs }] = await Promise.all([
      admin.from("profiles").select("user_id, full_name, email, is_blocked").in("user_id", userIds),
      admin.from("professional_analytics_counters").select("user_id, profile_clicks, profile_views").in("user_id", userIds),
      admin.from("subscriptions").select("user_id, plan_id").in("user_id", userIds),
      admin.from("plans").select("id, max_calls"),
      admin.from("service_requests").select("professional_id, request_kind").in("professional_id", proIds),
    ]);
    const profMap = new Map((profs || []).map((p: any) => [p.user_id, p]));
    const cntMap = new Map((counters || []).map((c: any) => [c.user_id, c]));
    const planMax = new Map((plans || []).map((p: any) => [p.id, p.max_calls]));

    // Melhor teto por usuário (Infinity quando ilimitado).
    const INF = Number.POSITIVE_INFINITY;
    const bestMax = new Map<string, number>();
    for (const s of (subs || []) as any[]) {
      const mc = planMax.get(s.plan_id);
      const val = mc == null ? -1 : (mc === -1 ? INF : Number(mc));
      const cur = bestMax.get(s.user_id);
      if (cur == null || val > cur) bestMax.set(s.user_id, val);
    }
    // Chamadas por pro (exclui 'following').
    const callCount: Record<string, number> = {};
    for (const r of (reqs || []) as any[]) {
      if (r.request_kind === "following") continue;
      callCount[r.professional_id] = (callCount[r.professional_id] || 0) + 1;
    }
    const freeMax = Number(planMax.get("free") ?? 3);
    const overLimit = (c: any): boolean => {
      let max = bestMax.get(c.user_id);
      if (max == null) max = freeMax;         // sem assinatura → free
      if (max === INF) return false;          // plano ilimitado
      const limit = max + Number(c.bonus_calls || 0);
      return (callCount[c.id] || 0) >= limit;
    };

    const host = Deno.env.get("SMTP_HOST") || "", userS = Deno.env.get("SMTP_USER") || "", pass = Deno.env.get("SMTP_PASS") || "";
    const from = Deno.env.get("SMTP_FROM") || "Chamo <nao-responda@appchamo.com>", port = Number(Deno.env.get("SMTP_PORT") || "587");

    let sent = 0, reset = 0;
    for (const c of cands as any[]) {
      if (!overLimit(c)) {
        await admin.from("professionals").update({ call_limit_reached_at: null, call_limit_nudge_stage: 0 }).eq("id", c.id);
        reset++;
        continue;
      }

      const elapsed = now - new Date(c.call_limit_reached_at).getTime();
      const desired = elapsed >= 7 * D ? 4 : elapsed >= 3 * D ? 3 : elapsed >= 24 * H ? 2 : 1;
      if (desired <= (c.call_limit_nudge_stage || 0)) continue;

      const pr = profMap.get(c.user_id);
      if (!pr || pr.is_blocked) { await admin.from("professionals").update({ call_limit_nudge_stage: desired }).eq("id", c.id); continue; }
      const nome = (pr.full_name || "").split(" ")[0] || "";
      const cnt = cntMap.get(c.user_id);
      const visitas = Number(cnt?.profile_clicks ?? cnt?.profile_views ?? 0);
      const t = copy(desired, nome, visitas);

      await admin.from("notifications").insert({
        user_id: c.user_id,
        title: t.title,
        message: t.msg,
        type: "info",
        link: "/subscriptions",
        metadata: { source: "limit_reached_nudge", stage: desired },
      });

      // Marca o estágio JÁ (antes do email, que é lento) pra garantir que não repete.
      await admin.from("professionals").update({ call_limit_nudge_stage: desired }).eq("id", c.id);
      sent++;

      if (host && userS && pass && pr.email) {
        const html = '<div style="background:#f5f5f5;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">'
          + '<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:28px 24px">'
          + '<p style="margin:0;font-size:22px;font-weight:800;color:#ea580c">CHAMÔ</p>'
          + `<h1 style="font-size:20px;color:#111;margin:14px 0 10px">${t.h1}</h1>`
          + `<p style="font-size:15px;color:#444;line-height:1.55">${t.body}</p>`
          + '<a href="https://appchamo.com/subscriptions" style="display:inline-block;margin-top:18px;background:#ea580c;color:#fff;text-decoration:none;padding:13px 24px;border-radius:10px;font-weight:700;font-size:15px">Ativar o Pro e voltar a receber</a>'
          + '<p style="font-size:12px;color:#888;margin-top:14px">No plano Pro você tem chamadas ilimitadas, destaque na busca e selo de profissional.</p>'
          + '<p style="font-size:11px;color:#aaa;margin-top:18px">Você recebe este email por ser profissional no Chamô.</p>'
          + '</div></div>';
        try {
          const client = new SMTPClient({ connection: { hostname: host, port, tls: port === 465, auth: { username: userS, password: pass } } });
          await client.send({ from, to: pr.email, subject: t.subject, html, content: "auto" });
          await client.close();
        } catch (_e) { /* segue */ }
      }
    }

    return json({ ok: true, sent, reset, candidates: cands.length });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
