// Webhook de ENTRADA do WhatsApp (Cloud API). Faz 3 coisas:
//  1) STATUS das mensagens enviadas (sent/delivered/read/failed) -> atualiza public.wa_messages.
//  2) OPT-OUT/OPT-IN: PARAR/SAIR/STOP/CANCELAR -> desliga; VOLTAR/ATIVAR/SIM -> religa.
//  3) IA de atendimento: qualquer outra mensagem/dúvida/resposta de botão -> a IA responde
//     de forma humanizada (registra em public.wa_interactions, com dedup).
// GET: verificação (hub.challenge) com WA_VERIFY_TOKEN.
// Secrets: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, ANTHROPIC_API_KEY, WA_VERIFY_TOKEN (opcional).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GRAPH_VERSION = "v21.0";
const VERIFY_TOKEN = (Deno.env.get("WA_VERIFY_TOKEN") || "chamo-wa-2026").trim();
const AI_MODEL = "claude-haiku-4-5-20251001";

const STOP_WORDS = new Set(["parar", "sair", "stop", "cancelar", "descadastrar", "pare"]);
const START_WORDS = new Set(["voltar", "ativar", "sim", "start", "retornar"]);

const SYSTEM_PROMPT = `Você é o atendente virtual do Chamô no WhatsApp. O Chamô é um app que conecta clientes a profissionais de serviços locais em Patrocínio-MG (eletricista, diarista, pintor, manicure, borracheiro e muitos outros).
Responda em português do Brasil, de forma calorosa, humana e CURTA (estilo WhatsApp, 1 a 3 frases).
Ajude com dúvidas: como funciona, como contratar um profissional, como virar profissional, planos, cadastro.
Regras:
- Nunca prometa reembolso, prazo ou valores que você não sabe.
- Se for reclamação ou problema de pagamento, peça desculpas e oriente a pessoa a falar com o suporte dentro do app.
- Nunca invente políticas ou informações.
- Não use travessão. Pode usar no máximo 1 emoji.
- Se a pessoa respondeu à pesquisa "Recomendo muito", agradeça animado. Se respondeu "Poderia melhorar", agradeça e pergunte gentilmente o que a gente pode melhorar.
- Se for spam, propaganda de terceiros ou ofensa, responda educadamente e breve, sem se estender.`;

function norm(s: string): string {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}
function tsToIso(t: unknown): string {
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : new Date().toISOString();
}

async function sendText(to: string, bodyText: string): Promise<boolean> {
  const token = (Deno.env.get("WHATSAPP_TOKEN") || "").trim();
  const phoneId = (Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "").trim();
  if (!token || !phoneId) return false;
  try {
    const r = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: bodyText } }),
    });
    return r.ok;
  } catch (_e) { return false; }
}

async function aiReply(userText: string): Promise<string | null> {
  const key = (Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
  if (!key) return null;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userText.slice(0, 1500) }],
      }),
    });
    const j = await r.json();
    const txt = (j?.content?.[0]?.text || "").trim();
    return txt || null;
  } catch (_e) { return null; }
}

/** Extrai o texto útil de uma mensagem recebida (texto, botão de template, ou botão interativo). */
function extractText(m: any): { text: string; kind: string } {
  if (m?.type === "text") return { text: String(m?.text?.body || ""), kind: "text" };
  if (m?.type === "button") return { text: String(m?.button?.text || m?.button?.payload || ""), kind: "button" };
  if (m?.type === "interactive") {
    const i = m.interactive || {};
    return { text: String(i?.button_reply?.title || i?.list_reply?.title || ""), kind: "interactive" };
  }
  return { text: "", kind: String(m?.type || "outro") };
}

async function process(payload: any) {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const ch of changes) {
      const value = ch?.value || {};

      // 1) STATUS -> wa_messages
      for (const st of (Array.isArray(value.statuses) ? value.statuses : [])) {
        const waId = String(st?.id || "");
        const status = String(st?.status || "");
        if (!waId || !status) continue;
        const iso = tsToIso(st?.timestamp);
        const patch: Record<string, unknown> = { status };
        if (status === "sent") patch.sent_at = iso;
        else if (status === "delivered") patch.delivered_at = iso;
        else if (status === "read") patch.read_at = iso;
        else if (status === "failed") { patch.failed_at = iso; try { patch.error = JSON.stringify(st?.errors ?? null); } catch { patch.error = "failed"; } }
        try { await admin.from("wa_messages").update(patch).eq("wa_id", waId); } catch (_e) { /* ignore */ }
      }

      // 2) MENSAGENS recebidas
      for (const m of (Array.isArray(value.messages) ? value.messages : [])) {
        const from = String(m?.from || "").replace(/\D/g, "");
        const msgId = String(m?.id || "");
        const { text, kind } = extractText(m);
        if (!from || !msgId) continue;

        // Dedup: registra a mensagem; se já existe, ignora (evita resposta dupla).
        const { error: dupErr } = await admin.from("wa_interactions")
          .insert({ wa_message_id: msgId, from_phone: from, kind, incoming_text: text || null, status: "pending" });
        if (dupErr) continue; // provavelmente já processada

        const n = norm(text);
        const wantsStop = STOP_WORDS.has(n);
        const wantsStart = START_WORDS.has(n);

        // 2a) Opt-out / opt-in
        if (wantsStop || wantsStart) {
          const last8 = from.slice(-8);
          const { data: rows } = await admin.from("profiles").select("user_id").ilike("phone", `%${last8}%`).limit(10);
          const ids = (rows || []).map((r: any) => r.user_id).filter(Boolean);
          if (ids.length) await admin.from("profiles").update({ whatsapp_notifications_enabled: !wantsStop }).in("user_id", ids);
          const reply = wantsStop
            ? "Pronto! Você não vai mais receber mensagens do Chamô por aqui. 💚 Se mudar de ideia, responda VOLTAR ou reative nas Preferências do app."
            : "Feito! Você voltou a receber as mensagens do Chamô por aqui. 💚";
          const ok = await sendText(from, reply);
          await admin.from("wa_interactions").update({ reply_text: reply, status: ok ? "sent" : "error" }).eq("wa_message_id", msgId);
          continue;
        }

        // 2b) IA de atendimento (só pra mensagens com texto útil)
        if (!text.trim()) {
          await admin.from("wa_interactions").update({ status: "skipped", error: "sem texto" }).eq("wa_message_id", msgId);
          continue;
        }
        const contexto = kind === "button" || kind === "interactive"
          ? `A pessoa respondeu a uma pesquisa/botão com: "${text}".`
          : text;
        const reply = await aiReply(contexto);
        if (!reply) {
          await admin.from("wa_interactions").update({ status: "error", error: "sem_resposta_ia" }).eq("wa_message_id", msgId);
          continue;
        }
        const ok = await sendText(from, reply);
        await admin.from("wa_interactions").update({ reply_text: reply, status: ok ? "sent" : "error" }).eq("wa_message_id", msgId);
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
    if (mode === "subscribe" && token === VERIFY_TOKEN) return new Response(challenge ?? "", { status: 200 });
    return new Response("forbidden", { status: 403 });
  }
  if (req.method !== "POST") return new Response("ok", { status: 200 });

  let payload: any = {};
  try { payload = await req.json(); } catch { /* ignore */ }

  const work = process(payload).catch((e) => console.error("[whatsapp-webhook] erro:", (e as Error)?.message));
  // Responde 200 rápido pro Meta; processa em segundo plano.
  try { (globalThis as any).EdgeRuntime?.waitUntil?.(work); } catch { /* ignore */ }
  if (!(globalThis as any).EdgeRuntime?.waitUntil) { await work; }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
