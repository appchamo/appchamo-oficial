// Webhook do Instagram — "social media" de IA do Chamô.
// Trata: DIRECT (messages) + veio-de-anúncio (messaging_referral), COMENTÁRIOS (comments),
// MENÇÕES (mentions), REAÇÕES recebidas (message_reactions, só registra) e ignora SEEN.
// A IA responde no tom do Chamô e pode reagir (coração/joia) no direct quando faz sentido.
// GET = verificação do webhook. POST = eventos (responde 200 na hora, processa em background).
//
// Secrets: IG_VERIFY_TOKEN, IG_APP_SECRET, IG_PAGE_TOKEN, ANTHROPIC_API_KEY, IG_GRAPH_VERSION (opcional).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GRAPH = () => `https://graph.facebook.com/${(Deno.env.get("IG_GRAPH_VERSION") || "v21.0").trim()}`;
const TOKEN = () => (Deno.env.get("IG_PAGE_TOKEN") || "").trim();
const MODELS = ["claude-sonnet-4-6", "claude-haiku-4-5-20251001", "claude-opus-4-6"];

const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function validSignature(raw: string, header: string | null): Promise<boolean> {
  const secret = (Deno.env.get("IG_APP_SECRET") || "").trim();
  if (!secret) return true;
  if (!header || !header.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `sha256=${hex}` === header;
}

function buildPrompt(kind: "dm" | "comment", text: string, username: string, fromAd: boolean): string {
  const canal = kind === "dm"
    ? "Isto é um DIRECT (mensagem privada). Pode ser um pouco mais completo, mas curto."
    : "Isto é um COMENTÁRIO PÚBLICO num post/vídeo/anúncio. Responda MUITO curto (1 frase), simpático.";
  const ctxAnuncio = fromAd
    ? "\n\nContexto: esta conversa começou a partir de um ANÚNCIO do Chamô. A pessoa clicou num anúncio e chegou aqui. Acolhe e mostra de forma leve como o app resolve o que ela precisa."
    : "";
  const reacao = kind === "dm"
    ? `\n- Você pode REAGIR à mensagem com um emoji quando fizer sentido (elogio, agradecimento, mensagem positiva): use "love" (coração) ou "like" (joia). Se não fizer sentido, ou se for reclamação/problema, use null.`
    : "";
  const jsonFmt = kind === "dm"
    ? `{"action":"reply","reply":"texto","reaction":"love"}  (reaction pode ser "love", "like" ou null)`
    : `{"action":"reply","reply":"texto"}`;
  return `Você é o social media do "Chamô", respondendo no Instagram.

Sobre o Chamô: app que liga a pessoa a profissionais de serviço da cidade (eletricista, encanador, diarista, técnico, pintor, montador, etc.) em Patrocínio-MG e região. Cliente baixa o app, busca o serviço e chama o profissional. Profissional se cadastra pra receber clientes. Tem também descontos de parceiros e cupons.

${canal}${ctxAnuncio}

Mensagem de @${username}:
"${text}"

Como responder:
- Português do Brasil, humano e simpático, como um social media gente boa. No máx 1 emoji.
- PROIBIDO travessão (— ou –). Sem tom corporativo, sem promessa falsa.
- Se perguntarem como funciona, contratar ou se cadastrar como profissional: explique em 1-2 frases e convide a baixar/abrir o app Chamô.
- Reclamação, pagamento ou suporte: peça desculpas rápido e oriente a mandar detalhes pro suporte no app. Não prometa reembolso nem prazo.
- Spam, ofensa, propaganda de terceiros ou nada a ver: NÃO responda (action "skip").${reacao}

Responda APENAS um JSON válido:
${jsonFmt}
ou {"action":"skip","reply":""}`;
}

async function aiReply(kind: "dm" | "comment", text: string, username: string, fromAd = false):
  Promise<{ action: string; reply: string; reaction: string | null }> {
  const apiKey = (Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
  if (!apiKey || !text.trim()) return { action: "skip", reply: "", reaction: null };
  const prompt = buildPrompt(kind, text, username, fromAd);
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
      const reaction = kind === "dm" && (v.reaction === "love" || v.reaction === "like") ? v.reaction : null;
      const action = v.action === "reply" && reply ? "reply" : "skip";
      return { action, reply: action === "reply" ? reply : "", reaction: action === "reply" ? reaction : null };
    } catch (_e) { /* proximo modelo */ }
  }
  return { action: "skip", reply: "", reaction: null };
}

async function graphPost(path: string, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const r = await fetch(`${GRAPH()}/${path}?access_token=${encodeURIComponent(TOKEN())}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (r.ok) return { ok: true };
  return { ok: false, error: (await r.text()).slice(0, 300) };
}

const sendDM = (recipientId: string, text: string) =>
  graphPost("me/messages", { recipient: { id: recipientId }, message: { text } });

const sendReaction = (recipientId: string, mid: string, reaction: string) =>
  graphPost("me/messages", { recipient: { id: recipientId }, sender_action: "react", payload: { message_id: mid, reaction } });

async function replyComment(commentId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const r = await fetch(`${GRAPH()}/${commentId}/replies`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ message: text, access_token: TOKEN() }),
  });
  if (r.ok) return { ok: true };
  return { ok: false, error: (await r.text()).slice(0, 300) };
}

async function getCommentText(commentId: string): Promise<{ text: string; username: string }> {
  try {
    const r = await fetch(`${GRAPH()}/${commentId}?fields=text,username,from&access_token=${encodeURIComponent(TOKEN())}`);
    const d = await r.json().catch(() => ({}));
    return { text: String(d?.text || ""), username: String(d?.username || d?.from?.username || "cliente") };
  } catch { return { text: "", username: "cliente" }; }
}

// Insere já como pending (dedup via unique). Retorna o id, ou null se duplicado.
async function startLog(db: any, kind: string, ext: string, fields: Record<string, unknown>): Promise<number | null> {
  const { data } = await db.from("ig_interactions").insert({ kind, external_id: ext, status: "pending", ...fields })
    .select("id").maybeSingle();
  return data?.id ?? null;
}

async function processEvent(body: any) {
  const db = admin();
  for (const entry of (Array.isArray(body?.entry) ? body.entry : [])) {
    const igAccount = String(entry?.id || "");

    // ---- Mensagens / reações / seen / referral (entry.messaging) ----
    for (const m of (Array.isArray(entry?.messaging) ? entry.messaging : []) as any[]) {
      if (m?.message?.is_echo) continue;
      if (m?.read) continue; // messaging_seen: ignora
      const senderId = String(m?.sender?.id || "");
      if (!senderId || senderId === igAccount) continue;

      // Reação recebida: registra, não responde.
      if (m?.reaction) {
        const ext = `${m.reaction.mid || senderId}:${m.reaction.action || "react"}`;
        await startLog(db, "reaction", ext, {
          ig_account_id: igAccount, from_id: senderId,
          incoming_text: `${m.reaction.action || "react"} ${m.reaction.emoji || m.reaction.reaction || ""}`.trim(),
          action: "skip", status: "logged",
        });
        continue;
      }

      const referral = m?.referral || m?.message?.referral || m?.postback?.referral;
      const text = String(m?.message?.text || "");

      // Direct de texto (com ou sem contexto de anúncio).
      if (text) {
        const mid = String(m?.message?.mid || `${senderId}:${m?.timestamp || Date.now()}`);
        const id = await startLog(db, "dm", mid, { ig_account_id: igAccount, from_id: senderId, incoming_text: text });
        if (!id) continue;
        const { action, reply, reaction } = await aiReply("dm", text, "cliente", !!referral);
        if (reaction) await sendReaction(senderId, mid, reaction); // best-effort
        if (action !== "reply") { await db.from("ig_interactions").update({ action: "skip", status: "skipped" }).eq("id", id); continue; }
        const sent = await sendDM(senderId, reply);
        await db.from("ig_interactions").update({
          action: "reply", reply_text: reaction ? `[reagiu:${reaction}] ${reply}` : reply,
          status: sent.ok ? "sent" : "error", error: sent.ok ? null : sent.error,
        }).eq("id", id);
        continue;
      }

      // Só referral (clicou no anúncio, ainda não escreveu): registra pra histórico.
      if (referral) {
        const ext = `${senderId}:ref:${m?.timestamp || Date.now()}`;
        await startLog(db, "referral", ext, {
          ig_account_id: igAccount, from_id: senderId,
          incoming_text: `veio de anúncio (${referral.source || referral.type || "ad"})`,
          action: "skip", status: "logged",
        });
      }
    }

    // ---- Comentários e menções (entry.changes) ----
    for (const ch of (Array.isArray(entry?.changes) ? entry.changes : [])) {
      const val = ch?.value || {};

      if (ch?.field === "comments") {
        const fromId = String(val?.from?.id || "");
        if (fromId && fromId === igAccount) continue;
        const commentId = String(val?.id || "");
        const text = String(val?.text || "");
        if (!commentId || !text) continue;
        const username = String(val?.from?.username || "cliente");
        const id = await startLog(db, "comment", commentId, { ig_account_id: igAccount, from_id: fromId, from_username: username, incoming_text: text });
        if (!id) continue;
        const { action, reply } = await aiReply("comment", text, username);
        if (action !== "reply") { await db.from("ig_interactions").update({ action: "skip", status: "skipped" }).eq("id", id); continue; }
        const sent = await replyComment(commentId, reply);
        await db.from("ig_interactions").update({ action: "reply", reply_text: reply, status: sent.ok ? "sent" : "error", error: sent.ok ? null : sent.error }).eq("id", id);
        continue;
      }

      // Menção: @appchamo marcado num comentário. Busca o texto e responde no comentário.
      if (ch?.field === "mentions") {
        const commentId = String(val?.comment_id || "");
        if (!commentId) continue; // menção só em mídia/story: registra e sai
        const id = await startLog(db, "mention", commentId, { ig_account_id: igAccount, incoming_text: "(menção)" });
        if (!id) continue;
        const { text, username } = await getCommentText(commentId);
        if (!text) { await db.from("ig_interactions").update({ action: "skip", status: "skipped" }).eq("id", id); continue; }
        await db.from("ig_interactions").update({ from_username: username, incoming_text: text }).eq("id", id);
        const { action, reply } = await aiReply("comment", text, username);
        if (action !== "reply") { await db.from("ig_interactions").update({ action: "skip", status: "skipped" }).eq("id", id); continue; }
        const sent = await replyComment(commentId, reply);
        await db.from("ig_interactions").update({ action: "reply", reply_text: reply, status: sent.ok ? "sent" : "error", error: sent.ok ? null : sent.error }).eq("id", id);
      }
    }
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected = (Deno.env.get("IG_VERIFY_TOKEN") || "").trim();
    if (mode === "subscribe" && expected && token === expected) return new Response(challenge || "", { status: 200 });
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("method", { status: 405 });

  const raw = await req.text();
  if (!(await validSignature(raw, req.headers.get("x-hub-signature-256")))) {
    return new Response("bad signature", { status: 401 });
  }
  let body: any = {};
  try { body = JSON.parse(raw); } catch { return new Response("ok", { status: 200 }); }

  try { (globalThis as any).EdgeRuntime?.waitUntil(processEvent(body)); }
  catch { await processEvent(body); }
  return new Response("ok", { status: 200 });
});
