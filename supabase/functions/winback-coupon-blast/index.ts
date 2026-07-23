// Campanha de reativação com CUPOM (10%) para clientes inativos +30d.
// Envia EMAIL (SMTP) + WHATSAPP (template cupom_cliente) em LOTES, idempotente via winback_coupon_blast_log.
// O cupom e o push já foram criados via SQL; esta função cuida de email + WhatsApp.
// Chamada com x-hook-secret. { dry_run?: bool, batch?: number }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
function esc(s: unknown) {
  return String(s ?? "").split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;");
}
function ddmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const DISCOUNT_TXT = "10%";
const DEFAULT_BATCH = 60;

function emailHtml(name: string, appUrl: string, validade: string) {
  return '<div style="background:#f5f5f5;padding:40px 20px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">'
    + '<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:40px 32px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.06)">'
    + '<p style="margin:0 0 24px;font-size:28px;font-weight:800;color:#ea580c">CHAMÔ</p>'
    + '<div style="font-size:40px;margin:0 0 8px">🎁</div>'
    + '<h1 style="margin:0 0 12px;font-size:22px;color:#1a1a1a">Um presente pra você voltar</h1>'
    + '<p style="margin:0 0 8px;font-size:14px;color:#525252">Olá, ' + esc(name) + '</p>'
    + '<p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#525252">Você ganhou <strong>10% de desconto</strong> no Chamô, válido até <strong>' + esc(validade) + '</strong>. Chama um profissional de confiança e o desconto entra sozinho na hora de pagar pelo app.</p>'
    + '<a href="' + appUrl + '" style="display:inline-block;padding:14px 28px;border-radius:10px;background:#ea580c;color:#fff;font-weight:600;text-decoration:none">Usar meu desconto</a>'
    + '<p style="margin:24px 0 0;font-size:12px;color:#999">Você recebeu este e-mail porque tem uma conta no Chamô.</p>'
    + '</div></div>';
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "metodo" }, 405);

  const hookSecret = (Deno.env.get("EMAIL_HOOK_SECRET") || "").trim();
  if (!hookSecret || (req.headers.get("x-hook-secret") || "").trim() !== hookSecret) {
    return json({ error: "unauthorized" }, 401);
  }
  const body = await req.json().catch(() => ({}));
  const dryRun = body.dry_run === true;
  const BATCH = Number.isFinite(body.batch) && body.batch > 0 ? Math.min(Number(body.batch), 120) : DEFAULT_BATCH;

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const APP = (Deno.env.get("PUBLIC_APP_URL") || "https://appchamo.com").replace(/[/]+$/, "");
  const SUPA = Deno.env.get("SUPABASE_URL")!;

  // 1) Público: quem tem cupom winback ativo.
  const { data: coupons } = await admin
    .from("coupons")
    .select("user_id, expires_at")
    .eq("source", "winback_coupon")
    .eq("used", false)
    .gt("expires_at", new Date().toISOString())
    .limit(5000);
  const couponByUser = new Map<string, string>();
  for (const c of (coupons ?? []) as any[]) if (!couponByUser.has(c.user_id)) couponByUser.set(c.user_id, c.expires_at);

  // 2) Já processados (log).
  const { data: done } = await admin.from("winback_coupon_blast_log").select("user_id").limit(5000);
  const doneSet = new Set((done ?? []).map((d: any) => d.user_id));

  const pending = [...couponByUser.keys()].filter((u) => !doneSet.has(u));
  if (dryRun) return json({ ok: true, dry_run: true, total_cupons: couponByUser.size, ja_enviados: doneSet.size, restantes: pending.length });
  if (pending.length === 0) return json({ ok: true, email: 0, whatsapp: 0, restantes: 0 });

  const loteIds = pending.slice(0, BATCH);
  const { data: profs } = await admin
    .from("profiles")
    .select("user_id, full_name, email, phone, email_notifications_enabled, whatsapp_notifications_enabled")
    .in("user_id", loteIds);
  const profByUser = new Map<string, any>();
  for (const p of (profs ?? []) as any[]) profByUser.set(p.user_id, p);

  // SMTP
  const host = Deno.env.get("SMTP_HOST") || "";
  const userS = Deno.env.get("SMTP_USER") || "";
  const pass = Deno.env.get("SMTP_PASS") || "";
  const from = Deno.env.get("SMTP_FROM") || "Chamo <nao-responda@appchamo.com>";
  const port = Number(Deno.env.get("SMTP_PORT") || "587");
  const smtpOk = !!(host && userS && pass);
  const newSmtp = () => new SMTPClient({ connection: { hostname: host, port, tls: port === 465, auth: { username: userS, password: pass } } });
  let smtp: any = null;
  if (smtpOk) { try { smtp = newSmtp(); } catch { smtp = null; } }

  let emailCount = 0, waCount = 0;

  for (const uid of loteIds) {
    const p = profByUser.get(uid);
    const validade = ddmm(couponByUser.get(uid) || new Date(Date.now() + 15 * 86400000).toISOString());
    const first = String(p?.full_name || "").split(" ")[0] || "tudo bem?";
    let emailOk = false, waOk = false;

    // Email (reaproveita a mesma conexão SMTP; reconecta 1x se cair)
    if (smtp && p) {
      const to = String(p.email || "").trim();
      if (to && p.email_notifications_enabled !== false) {
        const msg = { from, to, subject: "Seu presente no Chamô: 10% de desconto 🎁", html: emailHtml(first, APP, validade), content: "auto" as const };
        try {
          await smtp.send(msg);
          emailOk = true; emailCount++;
        } catch (_e) {
          try { smtp = newSmtp(); await smtp.send(msg); emailOk = true; emailCount++; } catch { /* email não bloqueia */ }
        }
      }
    }

    // WhatsApp (send-whatsapp respeita opt-out e resolve telefone)
    try {
      const r = await fetch(`${SUPA}/functions/v1/send-whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-hook-secret": hookSecret },
        body: JSON.stringify({ user_id: uid, template: "cupom_cliente", lang: "pt_BR", params: [first, DISCOUNT_TXT, validade] }),
      });
      const jr = await r.json().catch(() => ({}));
      if (jr?.ok === true && !jr?.skipped) { waOk = true; waCount++; }
    } catch (_e) { /* whatsapp não bloqueia */ }

    await admin.from("winback_coupon_blast_log").upsert({ user_id: uid, email_ok: emailOk, wa_ok: waOk }, { onConflict: "user_id" });
    await new Promise((r) => setTimeout(r, 200));
  }

  try { await smtp?.close(); } catch { /* ignore */ }

  return json({ ok: true, email: emailCount, whatsapp: waCount, lote: loteIds.length, restantes: Math.max(0, pending.length - loteIds.length) });
});
