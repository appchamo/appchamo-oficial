// Webhook do Instagram — "social media" de IA do Chamô.
// Recebe DIRECT (DM) e COMENTÁRIOS, gera a resposta com Claude e responde pelo Graph API.
// GET  = verificação do webhook do Meta (hub.challenge).
// POST = eventos. Responde 200 na hora e processa em background (EdgeRuntime.waitUntil).
//
// Secrets (você define no Supabase):
//   IG_VERIFY_TOKEN   - string que você inventa e repete no painel do Meta ao assinar o webhook.
//   IG_APP_SECRET     - "App Secret" do seu app no Meta (valida a assinatura dos eventos).
//   IG_PAGE_TOKEN     - token de longa duração da Página ligada ao Instagram.
//   ANTHROPIC_API_KEY - já existe (precisa de crédito na Anthropic).
//   IG_GRAPH_VERSION  - opcional, padrão v21.0.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GRAPH = () => `https://graph.facebook.com/${(Deno.env.get("IG_GRAPH_VERSION") || "v21.0").trim()}`;
const MODELS = ["claude-sonnet-4-6", "claude-haiku-4-5-20251001", "claude-opus-4-6"];

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

// Valida a assinatura X-Hub-Signature-256 (HMAC-SHA256 do corpo cru com o App Secret).
async function validSignature(raw: string, header: string | null): Promise<boolean> {
  const secret = (Deno.env.get("IG_APP_SECRET") || "").trim();
  if (!secret) return true; // se não configurou o segredo, não bloqueia (mas configure!)
  if (!header || !header.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `sha256=${hex}` === header;
}

function buildPrompt(kind: "dm" | "comment", text: string, username: string): string {
  const canal = kind === "dm"
    ? "Isto é um DIRECT (mensagem privada). Pode ser um pouco mais completo, mas curto."
    : "Isto é um COMENTÁRIO PÚBLICO num post/vídeo/anúncio. Responda MUITO curto (1 frase), simpático.";
  return `Você é o social media do "Chamô", respondendo no Instagram.

Sobre o Chamô: app que liga a pessoa a profissionais de serviço da cidade (eletricista, encanador, diarista, técnico, pintor, montador, etc.) em Patrocínio-MG e região. Cliente baixa o app, busca o serviço e chama o profissional. Profissional se cadastra pra receber clientes. Tem também descontos de parceiros e cupons.

${canal}

Mensagem de @${username}:
"${text}"

Como responder:
- Português do Brasil, humano e simpático, como um social media gente boa. No máx 1 emoji.
- PROIBIDO travessão (— ou –). Sem tom corporativo, sem promessa falsa.
- Se perguntarem como funciona, como contratar ou como se cadastrar como profissional: explique em 1-2 frases e convide a baixar/abrir o app Chamô.
- Se for reclamação, problema de pagamento ou suporte: peça desculpas rápido e oriente a mandar os detalhes pro suporte dentro do app. Não prometa reembolso nem prazo.
- Se for spam, ofensa, propaganda de terceiros ou nada a ver: NÃO responda (action "skip").
- Se for só um elogio/emoji, responda curtinho e agradeça.

Responda APENAS um JSON válido:
{"action":"reply","reply":"texto da resposta"}
ou
{"action":"skip","reply":""}`;
}

async function aiReply(kind: "dm" | "comment", text: string, username: string): Promise<{ action: string; reply: string }> {
  const apiKey = (Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
  if (!apiKey || !text.trim()) return { action: "skip", reply: "" };
  const prompt = buildPrompt(kind, text, username);
  for (const model of MODELS) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 400, messages: [{ role: "user", content: prompt }] }),
      });
      if (!r.ok) continue;
      const data = await r.json().catch(() => ({}));
      const t = (data?.content?.[0]?.text || "").trim();
      const m = t.match(/\{[\s\S]*\}/);
      if (!m) continue;
      const v = JSON.parse(m[0]);
      const reply = String(v.reply || "").replace(/\s*[—–]\s*/g, ", ").trim().slice(0, 900);
      const action = v.action === "reply" && reply ? "reply" : "skip";
      return { action, reply: action === "reply" ? reply : "" };
    } catch (_e) { /* tenta o próximo modelo */ }
  }
  return { action: "skip", reply: "" };
}

async function sendDM(recipientId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const token = (Deno.env.get("IG_PAGE_TOKEN") || "").trim();
  const r = await fetch(`${GRAPH()}/me/messages?access_token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
  });
  if (r.ok) return { ok: true };
  return { ok: false, error: (await r.text()).slice(0, 300) };
}

async function replyComment(commentId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const token = (Deno.env.get("IG_PAGE_TOKEN") || "").trim();
  const r = await fetch(`${GRAPH()}/${commentId}/replies`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ message: text, access_token: token }),
  });
  if (r.ok) return { ok: true };
  return { ok: false, error: (await r.text()).slice(0, 300) };
}

async function processEvent(body: any) {
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  for (const entry of entries) {
    const igAccount = String(entry?.id || "");

    // DIRECT (DM)
    for (const m of (Array.isArray(entry?.messaging) ? entry.messaging : []) as any[]) {
      if (m?.message?.is_echo) continue;                 // ignora eco das nossas próprias mensagens
      const senderId = String(m?.sender?.id || "");
      if (!senderId || senderId === igAccount) continue; // não responde a si mesmo
      const mid = String(m?.message?.mid || `${senderId}:${m?.timestamp || Date.now()}`);
      const text = String(m?.message?.text || "");
      if (!text) continue;                               // ignora sticker/áudio/imagem sem texto
      const db = admin();
      const { data: ins } = await db.from("ig_interactions").insert({
        kind: "dm", external_id: mid, ig_account_id: igAccount, from_id: senderId, incoming_text: text, status: "pending",
      }).select("id").maybeSingle();
      if (!ins) continue;
      const { action, reply } = await aiReply("dm", text, "cliente");
      if (action !== "reply") { await db.from("ig_interactions").update({ action: "skip", status: "skipped" }).eq("id", ins.id); continue; }
      const sent = await sendDM(senderId, reply);
      await db.from("ig_interactions").update({ action: "reply", reply_text: reply, status: sent.ok ? "sent" : "error", error: sent.ok ? null : sent.error }).eq("id", ins.id);
    }

    // COMENTÁRIOS
    for (const ch of (Array.isArray(entry?.changes) ? entry.changes : [])) {
      if (ch?.field !== "comments") continue;
      const val = ch.value || {};
      const fromId = String(val?.from?.id || "");
      if (fromId && fromId === igAccount) continue;      // ignora nossos próprios comentários
      const commentId = String(val?.id || "");
      const text = String(val?.text || "");
      if (!commentId || !text) continue;
      const username = String(val?.from?.username || "cliente");
      const db = admin();
      const { data: ins } = await db.from("ig_interactions").insert({
        kind: "comment", external_id: commentId, ig_account_id: igAccount, from_id: fromId, from_username: username, incoming_text: text, status: "pending",
      }).select("id").maybeSingle();
      if (!ins) continue;
      const { action, reply } = await aiReply("comment", text, username);
      if (action !== "reply") { await db.from("ig_interactions").update({ action: "skip", status: "skipped" }).eq("id", ins.id); continue; }
      const sent = await replyComment(commentId, reply);
      await db.from("ig_interactions").update({ action: "reply", reply_text: reply, status: sent.ok ? "sent" : "error", error: sent.ok ? null : sent.error }).eq("id", ins.id);
    }
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Verificação do webhook (Meta chama via GET ao assinar).
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected = (Deno.env.get("IG_VERIFY_TOKEN") || "").trim();
    if (mode === "subscribe" && expected && token === expected) {
      return new Response(challenge || "", { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("method", { status: 405 });

  const raw = await req.text();
  if (!(await validSignature(raw, req.headers.get("x-hub-signature-256")))) {
    return new Response("bad signature", { status: 401 });
  }
  let body: any = {};
  try { body = JSON.parse(raw); } catch { return new Response("ok", { status: 200 }); }

  // Responde 200 na hora; processa em background (Meta exige resposta rápida).
  try { (globalThis as any).EdgeRuntime?.waitUntil(processEvent(body)); }
  catch { await processEvent(body); }
  return new Response("ok", { status: 200 });
});
