// Notificação diária automática escrita por IA (Claude) e enviada via push (FCM).
// Chamado 2x/dia pelo pg_cron (manhã e fim de tarde).
// MELHORIA: segmenta por público (CLIENTE vs PROFISSIONAL) e gera uma mensagem
// específica pra cada um — nada de mensagem genérica igual pra todo mundo.
// O envio usa o gatilho existente (insere em `notifications` -> dispara push).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// Sonnet primeiro (segue melhor a instrução de tom). Haiku/Opus de reserva.
const MODELS = ["claude-sonnet-4-6", "claude-haiku-4-5-20251001", "claude-opus-4-6"];

const CLIENT_LINKS = new Set(["/home", "/search", "/solicitar-servico", "/parceiros", "/coupons"]);
const PRO_LINKS = new Set(["/home", "/pro/pedidos-abertos", "/coupons"]);

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

// Textos-reserva variados (usados só quando a IA falha). Sem saudação fixa pra não errar o período.
const CLIENT_FALLBACKS: { title: string; message: string; link: string }[] = [
  { title: "Achou o profissional certo? 🔍", message: "Descreve o que precisa e acha um profissional de confiança pertinho.", link: "/search" },
  { title: "Publica seu pedido 📩", message: "Diz o que você precisa e vários profissionais da região chamam você.", link: "/solicitar-servico" },
  { title: "Aquele reparo parado?", message: "Resolve hoje: acha um profissional perto de você em minutos.", link: "/search" },
  { title: "Tem cupom te esperando 🎁", message: "Aproveita os descontos de parceiros e economiza no próximo serviço.", link: "/coupons" },
  { title: "Escolhe com segurança ✅", message: "Vê as avaliações e contrata profissional verificado direto pelo app.", link: "/search" },
];
const PRO_FALLBACKS: { title: string; message: string; link: string }[] = [
  { title: "Tem cliente te procurando 👀", message: "Vê os pedidos da sua região e demonstra interesse antes dos outros.", link: "/pro/pedidos-abertos" },
  { title: "Responde rápido, fecha mais", message: "Cliente que espera chama outro. Abre o app e vê quem te chamou.", link: "/home" },
  { title: "Perfil bom aparece na frente", message: "Foto real e serviços bem descritos trazem mais cliente. Dá uma revisada.", link: "/home" },
  { title: "Pede a avaliação 💬", message: "Depois do serviço, peça a nota. Quem tem avaliação recebe mais chamada.", link: "/home" },
  { title: "Cupom fecha serviço 🎁", message: "Oferece um cupom e convence o cliente a fechar com você hoje.", link: "/coupons" },
];

const REGRAS_TOM = `Tom (VALE PRA TUDO):
- Português do Brasil, humano e direto, como um amigo falando na rua.
- PROIBIDO travessão (— ou –). Use vírgula ou ponto.
- PROIBIDO frase motivacional vazia ("dia de conquistas", "juntos vamos mais longe", "sucesso é...").
- PROIBIDO palavra de escritório ou coach ("otimize", "potencialize", "engajamento", "jornada", "diferencial").
- Comece pela ideia. Uma ideia só, clara na primeira lida. Sem enrolação.
- Nada de promessa falsa.`;

function greetingRule(period: string): string {
  return period === "afternoon"
    ? "Momento: FIM DE TARDE (~17h30). Se cumprimentar, use só Boa tarde. Nunca Bom dia nem Boa noite."
    : "Momento: MANHÃ (~9h). Se cumprimentar, use só Bom dia. Nunca Boa tarde nem Boa noite.";
}

function buildClientPrompt(period: string, recent: string[]): string {
  const evitar = recent.length ? `\n\nNão repita nem pareça com estes títulos recentes:\n- ${recent.join("\n- ")}` : "";
  return `Você escreve UMA notificação push curta pro app "Chamô", para o CLIENTE (quem contrata serviço).

Sobre o Chamô: acha profissional de confiança da cidade (eletricista, encanador, diarista, técnico, pintor, montador, chaveiro, e muito mais) em Patrocínio-MG e região. No app dá pra: buscar e chamar um profissional; publicar um PEDIDO (você descreve o que precisa e vários profissionais chamam você); conversar e combinar tudo pelo chat; ver avaliações reais; escolher profissional com selo de verificado; e ainda tem cupons e descontos de parceiros.

O que escrever pro cliente: algo que dê vontade de abrir o app AGORA. Escolha UM ângulo e varie bastante a cada envio:
- facilidade de CONTRATAR: descreveu o problema, achou um profissional perto em minutos;
- mostrar uma FUNCIONALIDADE que talvez a pessoa não conheça (publicar um pedido e receber vários interessados; conversar e fechar tudo pelo chat; ver avaliações antes de escolher; selo de verificado);
- aproveitar uma OPORTUNIDADE: cupom, desconto de parceiro, promoção;
- uma dica prática de casa/manutenção que termina em "chama um profissional pra resolver".

${greetingRule(period)}

${REGRAS_TOM}

Formato:
- Título: máx 42 caracteres, no máximo 1 emoji.
- Mensagem: máx 120 caracteres, uma frase que dá vontade de abrir.
- link entre: "/home", "/search" (buscar profissional), "/solicitar-servico" (publicar um pedido), "/parceiros" (descontos), "/coupons" (cupons).${evitar}

Responda APENAS um JSON válido: {"title":"...","message":"...","link":"/search"}`;
}

function buildProPrompt(period: string, recent: string[]): string {
  const evitar = recent.length ? `\n\nNão repita nem pareça com estes títulos recentes:\n- ${recent.join("\n- ")}` : "";
  return `Você escreve UMA notificação push curta pro app "Chamô", para o PROFISSIONAL (quem presta serviço e quer mais clientes).

Sobre o Chamô: é onde o profissional (eletricista, encanador, diarista, pintor, montador, etc.) recebe clientes da cidade de Patrocínio-MG e região. Ele recebe chamadas diretas, vê PEDIDOS abertos da região (clientes procurando o serviço dele) e demonstra interesse, monta um perfil com foto e avaliações, pode ter selo de verificado e planos (Pro/VIP) pra receber sem limite e o pagamento pelo app.

O que escrever pro profissional: uma DICA PRÁTICA ou uma OPORTUNIDADE, de colega pra colega, que ajude ele a fechar mais serviço. Escolha UM ângulo e varie bastante a cada envio:
- PEDIDOS da região: tem cliente procurando seu serviço agora, demonstre interesse antes dos outros;
- responder rápido (cliente que espera chama outro);
- perfil com foto e serviços bem listados aparece na frente;
- pedir avaliação depois do serviço;
- completar o cadastro ou o selo de verificado pra passar mais confiança e aparecer mais;
- plano Pro pra receber chamadas sem limite e o pagamento pelo app;
- oferecer um cupom pra fechar o serviço.

${greetingRule(period)}

${REGRAS_TOM}
- Fale como quem trabalha com as mãos, sem tom corporativo.

Formato:
- Título: máx 42 caracteres, no máximo 1 emoji.
- Mensagem: máx 120 caracteres, uma frase que faz ele querer abrir o app.
- link entre: "/home" (o app), "/pro/pedidos-abertos" (pedidos da região), "/coupons" (cupons pra oferecer).${evitar}

Responda APENAS um JSON válido: {"title":"...","message":"...","link":"/home"}`;
}

function stripDashes(s: string): string {
  return s.replace(/\s*[—–]\s*/g, ", ").replace(/,\s*,/g, ",").trim();
}

async function generate(apiKey: string, prompt: string, allowed: Set<string>, fallbackLink: string, diag?: string[]):
  Promise<{ title: string; message: string; link: string } | null> {
  for (const model of MODELS) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 600, messages: [{ role: "user", content: prompt }] }),
      });
      const raw = await r.text();
      if (!r.ok) { diag?.push(`${model}: HTTP ${r.status} ${raw.slice(0, 160)}`); if (r.status === 404) continue; else continue; }
      let data: any = {};
      try { data = JSON.parse(raw); } catch { diag?.push(`${model}: json_parse_fail`); continue; }
      const text = (data?.content?.[0]?.text || "").trim();
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) { diag?.push(`${model}: sem_json (${text.slice(0, 80)})`); continue; }
      const v = JSON.parse(m[0]);
      const title = stripDashes(String(v.title || "")).slice(0, 60);
      const message = stripDashes(String(v.message || "")).slice(0, 160);
      const link = allowed.has(String(v.link || "")) ? String(v.link) : fallbackLink;
      if (title && message) return { title, message, link };
      diag?.push(`${model}: campos_vazios`);
    } catch (e) {
      diag?.push(`${model}: throw ${String((e as Error)?.message || e).slice(0, 120)}`);
    }
  }
  return null;
}

async function recentTitles(admin: any, audience: string): Promise<string[]> {
  try {
    const { data } = await admin
      .from("notifications")
      .select("title, created_at")
      .contains("metadata", { source: "daily_ai", audience })
      .order("created_at", { ascending: false })
      .limit(8);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of data ?? []) {
      const t = String((r as any).title || "").trim();
      if (t && !seen.has(t)) { seen.add(t); out.push(t); }
    }
    return out;
  } catch { return []; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "metodo" }, 405);

  const hookSecret = (req.headers.get("x-hook-secret") || "").trim();
  if (!hookSecret || hookSecret !== (Deno.env.get("EMAIL_HOOK_SECRET") || "").trim()) {
    return json({ error: "unauthorized" }, 401);
  }
  const apiKey = (Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
  if (!apiKey) return json({ error: "anthropic_not_configured" }, 500);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json().catch(() => ({}));
  const period = body?.period === "afternoon" ? "afternoon" : "morning";

  // Alvos: usuários com push token.
  const devsRes = await admin.from("user_devices").select("user_id").not("push_token", "is", null).limit(8000);
  const uidSet = new Set((devsRes.data ?? []).map((d: any) => d.user_id).filter(Boolean));

  // Perfis (poucos): tipo + bloqueio + staff. Segmenta cliente x profissional.
  const profsRes = await admin.from("profiles").select("user_id, user_type, is_blocked, email").limit(8000);
  const STAFF = new Set(["admin@appchamo.com", "suporte@appchamo.com"]);
  const clientUids: string[] = [];
  const proUids: string[] = [];
  for (const p of (profsRes.data ?? []) as any[]) {
    if (!uidSet.has(p.user_id)) continue;
    if (p.is_blocked) continue;
    if (STAFF.has(String(p.email || "").toLowerCase())) continue;
    if (p.user_type === "professional" || p.user_type === "company") proUids.push(p.user_id);
    else clientUids.push(p.user_id); // client, sponsor, etc.
  }

  // Gera uma mensagem por público (sequencial, evita rate-limit da API).
  const [recentC, recentP] = await Promise.all([recentTitles(admin, "client"), recentTitles(admin, "pro")]);
  const diag: string[] = [];
  const cliMsg = await generate(apiKey, buildClientPrompt(period, recentC), CLIENT_LINKS, "/search", diag);
  const proMsg = await generate(apiKey, buildProPrompt(period, recentP), PRO_LINKS, "/home", diag);

  // Fallbacks por público (sorteados de um pool variado; não deixa sem notificação).
  const cli = cliMsg ?? pick(CLIENT_FALLBACKS);
  const pro = proMsg ?? pick(PRO_FALLBACKS);

  if (body?.debug) {
    return json({ ok: true, debug: true, period, clientes: clientUids.length, profissionais: proUids.length,
      cli_ia: !!cliMsg, pro_ia: !!proMsg, diag, cli, pro });
  }

  const insertFor = async (uids: string[], msg: { title: string; message: string; link: string }, audience: string) => {
    if (uids.length === 0) return 0;
    const rows = uids.map((uid) => ({
      user_id: uid, title: msg.title, message: msg.message, type: "info", link: msg.link,
      metadata: { source: "daily_ai", period, audience }, read: false,
    }));
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await admin.from("notifications").insert(chunk);
      if (error) console.error("insert error", error.message);
      else inserted += chunk.length;
    }
    return inserted;
  };

  const sentCli = await insertFor(clientUids, cli, "client");
  const sentPro = await insertFor(proUids, pro, "pro");

  return json({ ok: true, period, sent_clientes: sentCli, sent_profissionais: sentPro, cli, pro });
});
