// Notificação diária automática escrita por IA (Claude) e enviada via push (FCM).
// Chamado 2x/dia pelo pg_cron (manhã e fim de tarde). A mensagem é gerada na hora,
// evitando repetir as últimas, e o envio usa o gatilho de push já existente
// (insere linhas em `notifications` -> trigger dispara send-push-notification).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const ALLOWED_LINKS = new Set(["/home", "/search", "/parceiros", "/coupons"]);

const MODELS = ["claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-6"];

function buildPrompt(period: string, recentTitles: string[]): string {
  const momento = period === "afternoon"
    ? "FIM DE TARDE, por volta das 17h30 (tom de quem encerra o dia / resolve pendencias). Se cumprimentar, use APENAS Boa tarde; NUNCA use Bom dia nem Boa noite."
    : "MANHA, por volta das 9h (tom de comeco de dia, disposicao). Se cumprimentar, use APENAS Bom dia; NUNCA use Boa tarde nem Boa noite.";
  const evitar = recentTitles.length
    ? `\n\nNÃO repita nem pareça com estes títulos já enviados recentemente:\n- ${recentTitles.join("\n- ")}`
    : "";
  return `Você escreve UMA notificação push curta para o app "Chamô".

Sobre o Chamô: app que conecta pessoas a profissionais de serviços locais (eletricista, encanador, diarista, técnico, pintor, montador, designer, etc.) na cidade de Patrocínio-MG e região. Também tem descontos e benefícios de parceiros. Objetivo: manter o usuário engajado e trazê-lo de volta ao app.

Momento do envio: ${momento}.

Foco das mensagens: NOVIDADES/ENGAJAMENTO e DICAS ÚTEIS do dia a dia (casa, serviços, economia) que levem a pessoa a abrir o app. Nada de prometer coisas falsas.

Regras:
- Português do Brasil, tom amigável e humano.
- Título: no máximo 42 caracteres. Pode ter no máximo 1 emoji.
- Mensagem: no máximo 120 caracteres, uma frase que dá vontade de abrir.
- Escolha um "link" adequado entre: "/home", "/search" (buscar profissional), "/parceiros" (descontos), "/coupons" (cupons).
- Varie o tema a cada envio.${evitar}

Responda APENAS um JSON válido, sem texto extra:
{"title":"...","message":"...","link":"/home"}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "metodo" }, 405);

  const hookSecret = (req.headers.get("x-hook-secret") || "").trim();
  if (!hookSecret) return json({ error: "sem_secret" }, 401);

  const apiKey = (Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
  if (!apiKey) return json({ error: "anthropic_not_configured" }, 500);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const body = await req.json().catch(() => ({}));
  const period = body?.period === "afternoon" ? "afternoon" : "morning";

  // Últimos títulos enviados (para não repetir).
  let recentTitles: string[] = [];
  try {
    const { data } = await admin
      .from("notifications")
      .select("title, created_at")
      .contains("metadata", { source: "daily_ai" })
      .order("created_at", { ascending: false })
      .limit(8);
    const seen = new Set<string>();
    for (const r of data ?? []) {
      const t = String((r as { title?: string }).title || "").trim();
      if (t && !seen.has(t)) { seen.add(t); recentTitles.push(t); }
    }
  } catch { /* best-effort */ }

  // Gera a mensagem com a IA.
  let title = "", message = "", link = "/home";
  const prompt = buildPrompt(period, recentTitles);
  let ok = false;
  for (const model of MODELS) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 300, messages: [{ role: "user", content: prompt }] }),
      });
      if (r.status === 404) continue;
      const data = await r.json().catch(() => ({}));
      const text = (data?.content?.[0]?.text || "").trim();
      const m = text.match(/\{[\s\S]*\}/);
      if (m) {
        const v = JSON.parse(m[0]);
        title = String(v.title || "").trim();
        message = String(v.message || "").trim();
        link = ALLOWED_LINKS.has(String(v.link || "")) ? String(v.link) : "/home";
        if (title && message) { ok = true; break; }
      }
    } catch (e) {
      console.error("anthropic error", String((e as Error)?.message || e));
    }
  }

  if (!ok) {
    // Fallback simples se a IA falhar — não deixa o dia sem notificação.
    if (period === "afternoon") {
      title = "Resolveu tudo hoje? 👀";
      message = "Ainda dá tempo: encontre um profissional de confiança no Chamô.";
      link = "/search";
    } else {
      title = "Bom dia! ☀️";
      message = "Precisa de um serviço hoje? Veja os profissionais perto de você.";
      link = "/search";
    }
  }

  // Limites de tamanho (segurança).
  title = title.slice(0, 60);
  message = message.slice(0, 160);

  // Valida o segredo (mesmo do hook, igual às outras funções server-side).
  if (hookSecret !== (Deno.env.get("EMAIL_HOOK_SECRET") || "").trim()) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  // Alvos: usuários com push token, menos os bloqueados/staff (conjunto pequeno de exclusão).
  const devsRes = await admin.from("user_devices").select("user_id").not("push_token", "is", null).limit(5000);
  const uidSet = new Set((devsRes.data ?? []).map((d: any) => d.user_id).filter(Boolean));
  const exclRes = await admin.from("profiles")
    .select("user_id")
    .or("is_blocked.eq.true,email.eq.admin@appchamo.com,email.eq.suporte@appchamo.com");
  const exclSet = new Set((exclRes.data ?? []).map((p: any) => p.user_id));
  const eligible = Array.from(uidSet).filter((u) => !exclSet.has(u)) as string[];

  if (body?.debug) {
    return json({
      ok: true, debug: true,
      devs_count: uidSet.size, devs_error: devsRes.error?.message ?? null,
      excl_count: exclSet.size, excl_error: exclRes.error?.message ?? null,
      eligible: eligible.length,
    });
  }
  if (eligible.length === 0) return json({ ok: true, period, sent_to: 0, title, message, link });

  // Insere as notificações (cada linha dispara o push via trigger existente).
  // Sem batch_id: ele tem FK para admin_notification_batches (só p/ broadcasts do admin).
  const rows = eligible.map((uid) => ({
    user_id: uid, title, message, type: "info", link,
    metadata: { source: "daily_ai", period }, read: false,
  }));
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await admin.from("notifications").insert(chunk);
    if (error) console.error("insert error", error.message);
    else inserted += chunk.length;
  }

  return json({ ok: true, period, sent_to: inserted, title, message, link });
});
