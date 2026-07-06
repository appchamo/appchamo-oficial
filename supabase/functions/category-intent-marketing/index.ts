// Marketing por intenção de categoria.
// Cliente demonstrou interesse numa categoria (visitou 2+ perfis / buscou) -> manda push + e-mail
// destacando profissionais da categoria + um cupom. Chamado por pg_cron (x-hook-secret).
//
// Cadência por (cliente, categoria): até 2 disparos na 1ª semana (mín. 48h entre eles),
// depois no máximo 1 a cada 7 dias.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const esc = (s: unknown) =>
  String(s ?? "").split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;");

const STAFF = ["admin@appchamo.com", "suporte@appchamo.com", "chamotecnologia@gmail.com"];
const DAY = 86400000;

type Cand = { user_id: string; category_id: string; category_name: string; signals: number };
type Send = { category_id: string; sent_at: string };

function firstName(n: unknown) {
  return (String(n ?? "").trim().split(" ")[0]) || "tudo bem?";
}

// Decide se pode disparar agora pra (cliente, categoria), dado o histórico.
function podeDisparar(sends: Send[], now: number): boolean {
  if (sends.length === 0) return true;
  const times = sends.map((s) => new Date(s.sent_at).getTime()).sort((a, b) => a - b);
  const first = times[0];
  const last = times[times.length - 1];
  const dentroPrimeiraSemana = now <= first + 7 * DAY;
  if (dentroPrimeiraSemana) {
    const naPrimeiraSemana = times.filter((t) => t <= first + 7 * DAY).length;
    return naPrimeiraSemana < 2 && (now - last) >= 2 * DAY; // 2x na 1a semana, min 48h entre
  }
  return (now - last) >= 7 * DAY; // depois: 1x a cada 7 dias
}

function emailHtml(name: string, cat: string, pros: string[], pct: number, validade: string, url: string) {
  const lista = pros.length
    ? '<div style="text-align:left;margin:0 0 20px">'
      + '<p style="margin:0 0 8px;font-size:13px;color:#737373;font-weight:600">Alguns profissionais pertinho de você:</p>'
      + pros.map((p) =>
          '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #f0f0f0;border-radius:10px;margin:0 0 8px">'
          + '<span style="display:inline-block;width:28px;height:28px;border-radius:50%;background:#ea580c;color:#fff;font-weight:700;text-align:center;line-height:28px;font-size:13px">'
          + esc((p[0] || "?").toUpperCase()) + '</span>'
          + '<span style="font-size:14px;color:#1a1a1a">' + esc(p) + '</span></div>'
        ).join("")
      + '</div>'
    : "";
  return '<div style="background:#f5f5f5;padding:40px 20px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">'
    + '<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:36px 32px;box-shadow:0 2px 8px rgba(0,0,0,.06)">'
    + '<p style="margin:0 0 20px;font-size:26px;font-weight:800;color:#ea580c;text-align:center">CHAMÔ</p>'
    + '<h1 style="margin:0 0 10px;font-size:21px;color:#1a1a1a">Achou seu ' + esc(cat) + '? 🔍</h1>'
    + '<p style="margin:0 0 8px;font-size:14px;color:#525252">Olá, ' + esc(name) + '</p>'
    + '<p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#525252">Vi que você andou procurando <b>' + esc(cat)
    + '</b> aqui no Chamô. Tem bons profissionais prontos pra te atender pertinho de você.</p>'
    + lista
    + '<div style="background:#fff7ed;border:1px dashed #ea580c;border-radius:12px;padding:18px;text-align:center;margin:0 0 22px">'
    + '<p style="margin:0 0 4px;font-size:13px;color:#9a3412">Seu cupom pra fechar</p>'
    + '<p style="margin:0;font-size:30px;font-weight:800;color:#ea580c">' + pct + '% OFF</p>'
    + '<p style="margin:6px 0 0;font-size:12px;color:#9a3412">válido até ' + esc(validade) + '</p></div>'
    + '<div style="text-align:center">'
    + '<a href="' + url + '" style="display:inline-block;padding:14px 28px;border-radius:10px;background:#ea580c;color:#fff;font-weight:600;text-decoration:none">Ver ' + esc(cat) + '</a></div>'
    + '<p style="margin:24px 0 0;font-size:12px;color:#999;text-align:center">Você recebeu este e-mail porque tem uma conta no Chamô. Para não receber, ajuste as notificações no app.</p>'
    + '</div></div>';
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const hookSecret = (Deno.env.get("EMAIL_HOOK_SECRET") || "").trim();
  if (!hookSecret || (req.headers.get("x-hook-secret") || "").trim() !== hookSecret)
    return json({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({} as any));
  const dryRun = body.dry_run === true;
  const windowDays = Number(body.window_days ?? 7);
  const minSignals = Number(body.min_signals ?? 2);
  const pct = Number(body.discount_percent ?? Deno.env.get("CATEGORY_INTENT_DISCOUNT_PCT") ?? 10);
  const expiryDays = Number(body.expiry_days ?? Deno.env.get("CATEGORY_INTENT_EXPIRY_DAYS") ?? 14);
  const BATCH = Number(body.batch ?? 150);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const APP = (Deno.env.get("PUBLIC_APP_URL") || "https://appchamo.com").replace(/[/]+$/, "");
  const now = Date.now();

  // 1) Candidatos (cliente, categoria)
  const { data: cands, error: cErr } = await admin.rpc("category_intent_candidates", {
    p_window_days: windowDays, p_min_signals: minSignals,
  });
  if (cErr) return json({ ok: false, step: "candidates", error: cErr.message }, 500);
  const candidates = (cands ?? []) as Cand[];
  if (candidates.length === 0) return json({ ok: true, candidatos: 0, enviados: 0 });

  const userIds = [...new Set(candidates.map((c) => c.user_id))];
  const catIds = [...new Set(candidates.map((c) => c.category_id))];

  // 2) Perfis dos candidatos
  const { data: profs } = await admin
    .from("profiles")
    .select("user_id, email, full_name, email_notifications_enabled, is_blocked")
    .in("user_id", userIds);
  const profByUser = new Map<string, any>((profs ?? []).map((p: any) => [p.user_id, p]));

  // 3) Histórico de disparos (cadência) — últimos 30 dias
  const since30 = new Date(now - 30 * DAY).toISOString();
  const { data: hist } = await admin
    .from("category_intent_sends")
    .select("user_id, category_id, sent_at")
    .in("user_id", userIds)
    .gte("sent_at", since30);
  const sendsByKey = new Map<string, Send[]>();
  for (const h of (hist ?? []) as any[]) {
    const k = h.user_id + "|" + h.category_id;
    (sendsByKey.get(k) ?? sendsByKey.set(k, []).get(k)!).push({ category_id: h.category_id, sent_at: h.sent_at });
  }

  // 4) Profissionais em destaque por categoria (até 3, mais ativos)
  const prosByCat = new Map<string, string[]>();
  const { data: prosData } = await admin
    .from("professionals")
    .select("user_id, category_id, total_services")
    .in("category_id", catIds)
    .order("total_services", { ascending: false })
    .limit(600);
  const proUserIds = [...new Set((prosData ?? []).map((p: any) => p.user_id).filter(Boolean))];
  const nameByUser = new Map<string, string>();
  if (proUserIds.length) {
    const { data: proProfiles } = await admin
      .from("profiles")
      .select("user_id, display_name, full_name")
      .in("user_id", proUserIds);
    for (const pp of (proProfiles ?? []) as any[]) {
      const nm = String(pp.display_name || pp.full_name || "").trim();
      if (nm) nameByUser.set(pp.user_id, nm);
    }
  }
  for (const pr of (prosData ?? []) as any[]) {
    const nm = nameByUser.get(pr.user_id);
    if (!nm) continue;
    const arr = prosByCat.get(pr.category_id) ?? [];
    if (arr.length < 3) { arr.push(nm); prosByCat.set(pr.category_id, arr); }
  }

  // 5) Filtra por cadência + elegibilidade
  const elegiveis = candidates.filter((c) => {
    const p = profByUser.get(c.user_id);
    if (!p || p.is_blocked) return false;
    if (STAFF.includes(String(p.email || "").toLowerCase())) return false;
    return podeDisparar(sendsByKey.get(c.user_id + "|" + c.category_id) ?? [], now);
  });
  const lote = elegiveis.slice(0, BATCH);

  if (dryRun) {
    return json({
      ok: true, dry_run: true,
      candidatos: candidates.length, elegiveis: elegiveis.length, lote: lote.length,
      amostra: lote.slice(0, 10).map((c) => ({ categoria: c.category_name, sinais: c.signals })),
    });
  }

  // SMTP
  const host = Deno.env.get("SMTP_HOST") || "";
  const userS = Deno.env.get("SMTP_USER") || "";
  const pass = Deno.env.get("SMTP_PASS") || "";
  const from = Deno.env.get("SMTP_FROM") || "Chamo <nao-responda@appchamo.com>";
  const port = Number(Deno.env.get("SMTP_PORT") || "587");
  const smtpOn = !!(host && userS && pass);

  let pushCount = 0, emailCount = 0, couponCount = 0;

  for (const c of lote) {
    const p = profByUser.get(c.user_id);
    const catUrl = APP + "/category/" + c.category_id;

    // (a) Cupom travado NA categoria. Reusa um da mesma categoria ainda válido e não usado, senão cria.
    let couponId: string | null = null;
    const { data: existing } = await admin
      .from("coupons")
      .select("id")
      .eq("user_id", c.user_id)
      .eq("source", "category_intent")
      .eq("category_id", c.category_id)
      .eq("used", false)
      .gt("expires_at", new Date(now).toISOString())
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      couponId = existing.id;
    } else {
      const { data: newC } = await admin
        .from("coupons")
        .insert({
          user_id: c.user_id, source: "category_intent", coupon_type: "discount",
          category_id: c.category_id,
          discount_kind: "percent", discount_percent: pct, used: false,
          expires_at: new Date(now + expiryDays * DAY).toISOString(),
        })
        .select("id").single();
      if (newC?.id) { couponId = newC.id; couponCount++; }
    }

    // (b) Push (notifications insert -> dispara FCM via trigger)
    const { error: pErr } = await admin.from("notifications").insert({
      user_id: c.user_id,
      title: "Achou seu " + c.category_name + "? 🔍",
      message: "Vi que você tá procurando " + c.category_name + " no Chamô. Separei bons profissionais pertinho e um cupom de "
        + pct + "% pra você fechar. Bora resolver?",
      type: "info", link: "/category/" + c.category_id,
      metadata: { source: "category_intent", category_id: c.category_id, coupon_id: couponId }, read: false,
    });
    if (!pErr) pushCount++;

    // (c) E-mail (se tiver e não desativou)
    if (smtpOn) {
      const to = String(p.email || "").trim();
      if (to && p.email_notifications_enabled !== false) {
        const validade = new Date(now + expiryDays * DAY).toLocaleDateString("pt-BR");
        try {
          const client = new SMTPClient({ connection: { hostname: host, port, tls: port === 465, auth: { username: userS, password: pass } } });
          await client.send({
            from, to, subject: "Achou seu " + c.category_name + " no Chamô? 🔍",
            html: emailHtml(firstName(p.full_name), c.category_name, prosByCat.get(c.category_id) ?? [], pct, validade, catUrl),
            content: "auto",
          });
          await client.close();
          emailCount++;
        } catch (_e) { /* e-mail não bloqueia */ }
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    // (d) Log (cadência)
    await admin.from("category_intent_sends").insert({
      user_id: c.user_id, category_id: c.category_id,
      channels: smtpOn ? ["push", "email"] : ["push"], coupon_id: couponId, signals: c.signals,
    });
  }

  return json({
    ok: true, candidatos: candidates.length, elegiveis: elegiveis.length,
    enviados: lote.length, push: pushCount, email: emailCount, cupons_novos: couponCount,
    restantes: Math.max(0, elegiveis.length - lote.length),
  });
});
