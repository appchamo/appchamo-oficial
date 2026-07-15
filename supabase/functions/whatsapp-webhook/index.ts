// Webhook de ENTRADA do WhatsApp (Cloud API):
//  1) STATUS das mensagens (sent/delivered/read/failed) -> atualiza public.wa_messages.
//  2) OPT-OUT/OPT-IN: PARAR/SAIR/STOP -> desliga; VOLTAR/ATIVAR/SIM -> religa.
//  3) IA de atendimento (Sonnet): responde dúvidas/botões com histórico da conversa,
//     sabendo se a pessoa é cliente ou profissional. Log + dedup em public.wa_interactions.
// GET: verificação (hub.challenge) com WA_VERIFY_TOKEN.
// Secrets: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, ANTHROPIC_API_KEY, WA_VERIFY_TOKEN (opcional).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GRAPH_VERSION = "v21.0";
const VERIFY_TOKEN = (Deno.env.get("WA_VERIFY_TOKEN") || "chamo-wa-2026").trim();
const AI_MODEL = "claude-sonnet-4-6";

const STOP_WORDS = new Set(["parar", "sair", "stop", "cancelar", "descadastrar", "pare"]);
const START_WORDS = new Set(["voltar", "ativar", "sim", "start", "retornar"]);

const SYSTEM_PROMPT = `Você é o Assistente Chamô no WhatsApp. O Chamô é um app que conecta CLIENTES a PROFISSIONAIS e EMPRESAS de serviços locais (foco em Patrocínio-MG): eletricista, diarista, pintor, manicure, borracheiro, e muitos outros.

## Estilo (WhatsApp)
- Português do Brasil, caloroso, humano e CURTO (1 a 3 frases). Vá direto ao ponto.
- NÃO cumprimente com "Oi/Olá/Bom dia" em toda mensagem. Só se for o primeiro contato. Se já estão conversando, responda direto, sem saudação repetida.
- Não use travessão. No máximo 1 emoji no texto, e nem sempre.
- Use o nome da pessoa com naturalidade, sem repetir a cada mensagem.
- Você pode, opcionalmente, COMEÇAR a resposta com uma reação em emoji no formato [react:EMOJI] (ex.: [react:❤️], [react:👍], [react:😂]) quando fizer sentido (elogio, agradecimento, boa notícia). Use com moderação: a maioria das mensagens NÃO precisa de reação.

## Conhecimento do Chamô
- COMO CONTRATAR (cliente): busca ou categorias -> abre o perfil do profissional -> faz a chamada/pedido -> conversa fica no chat de Mensagens do app.
- VIRAR PROFISSIONAL: no app tem "Quero ser profissional" (cadastro), passa por aprovação da equipe.
- PLANOS (profissional): Free (até 3 chamadas, cobrança presencial), Pro (chamadas ilimitadas, recebe pagamento pelo app), VIP (Pro + selo verificado + destaque na Home + fotos no perfil), Business (VIP + catálogo, publicar vagas, consultoria, suporte 24h).
- No iOS os planos pagos usam compra dentro do app (Apple); no Android/web pode ter checkout. NUNCA invente preços, taxas, prazos ou datas.

## Regras
- Nunca prometa reembolso, prazo, valor ou política que você não tem certeza. Diga que os valores/regras aparecem nas telas do app (Assinaturas, pagamento) e que o suporte confirma casos específicos.
- Reclamação ou problema de pagamento: seja empático, peça desculpas e oriente a falar com o suporte dentro do app.
- Se for spam, propaganda de terceiros ou ofensa: responda educado e breve, sem se estender.
- Se a pessoa respondeu a uma pesquisa: "Recomendo muito" -> agradeça animado; "Poderia melhorar" -> agradeça e pergunte gentilmente o que dá pra melhorar.`;

function norm(s: string): string {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}
function tsToIso(t: unknown): string {
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : new Date().toISOString();
}

function waCfg() {
  return {
    token: (Deno.env.get("WHATSAPP_TOKEN") || "").trim(),
    phoneId: (Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "").trim(),
  };
}
async function waPost(body: Record<string, unknown>): Promise<boolean> {
  const { token, phoneId } = waCfg();
  if (!token || !phoneId) return false;
  try {
    const r = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
    });
    return r.ok;
  } catch (_e) { return false; }
}
async function sendText(to: string, bodyText: string): Promise<boolean> {
  return waPost({ to, type: "text", text: { body: bodyText } });
}
/** Marca a mensagem recebida como lida (tique azul). */
async function markRead(msgId: string): Promise<void> {
  await waPost({ status: "read", message_id: msgId });
}
/** Reage com emoji na mensagem recebida (ou remove a reação com emoji vazio). */
async function sendReaction(to: string, msgId: string, emoji: string): Promise<void> {
  await waPost({ to, type: "reaction", reaction: { message_id: msgId, emoji } });
}
/** Separa uma reação opcional no formato [react:EMOJI] do início do texto da IA. */
function splitReaction(reply: string): { emoji: string | null; text: string } {
  const m = reply.match(/^\s*\[react:\s*(\S+?)\s*\]\s*/u);
  if (m) return { emoji: m[1], text: reply.slice(m[0].length).trim() };
  return { emoji: null, text: reply };
}

function roleLabel(userType: string | null | undefined): string {
  const t = (userType || "").toLowerCase();
  if (t === "professional") return "profissional";
  if (t === "company" || t === "enterprise") return "empresa";
  if (t === "sponsor") return "patrocinador";
  if (t === "client") return "cliente";
  return "";
}

async function aiReply(system: string, history: { role: string; content: string }[], userMsg: string): Promise<string | null> {
  const key = (Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
  if (!key) return null;
  const messages = [...history, { role: "user", content: userMsg.slice(0, 2000) }];
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: AI_MODEL, max_tokens: 400, system, messages }),
    });
    const j = await r.json();
    const txt = (j?.content?.[0]?.text || "").trim();
    return txt || null;
  } catch (_e) { return null; }
}

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

        // Dedup
        const { error: dupErr } = await admin.from("wa_interactions")
          .insert({ wa_message_id: msgId, from_phone: from, kind, incoming_text: text || null, status: "pending" });
        if (dupErr) continue;

        // Marca como lida (tique azul) assim que chega.
        try { await markRead(msgId); } catch (_e) { /* ignore */ }

        const n = norm(text);
        const wantsStop = STOP_WORDS.has(n);
        const wantsStart = START_WORDS.has(n);
        const last8 = from.slice(-8);

        // 2a) Opt-out / opt-in
        if (wantsStop || wantsStart) {
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

        // 2b) IA (só com texto útil)
        if (!text.trim()) {
          // Áudio/voz (ainda sem transcrição): responde de forma amigável por texto.
          if (kind === "audio" || kind === "voice") {
            const reply = "Recebi seu áudio 🎧 Por enquanto consigo te ajudar melhor por texto. Me conta rapidinho por escrito o que você precisa? 💚";
            const ok = await sendText(from, reply);
            await admin.from("wa_interactions").update({ reply_text: reply, status: ok ? "sent" : "error" }).eq("wa_message_id", msgId);
          } else {
            await admin.from("wa_interactions").update({ status: "skipped", error: "sem texto" }).eq("wa_message_id", msgId);
          }
          continue;
        }

        // Identidade: cliente ou profissional? (pelo telefone)
        let contextLine = "A pessoa ainda não foi identificada no cadastro do Chamô (número não encontrado).";
        try {
          const { data: profs } = await admin.from("profiles")
            .select("full_name, user_type").ilike("phone", `%${last8}%`).limit(10);
          if (profs && profs.length) {
            const pro = profs.find((p: any) => (p.user_type || "").toLowerCase() === "professional" || (p.user_type || "").toLowerCase() === "company") || profs[0];
            const nome = String((pro as any).full_name || "").split(" ")[0];
            const papel = roleLabel((pro as any).user_type);
            contextLine = `Você está falando com ${nome || "um usuário"}${papel ? `, que é ${papel} no Chamô` : ""}.`;
          }
        } catch (_e) { /* ignore */ }

        // Histórico da conversa (turnos completos anteriores)
        const history: { role: string; content: string }[] = [];
        try {
          const { data: hist } = await admin.from("wa_interactions")
            .select("incoming_text, reply_text, created_at, wa_message_id")
            .eq("from_phone", from)
            .neq("wa_message_id", msgId)
            .order("created_at", { ascending: true })
            .limit(12);
          for (const h of (hist || []) as any[]) {
            if (h.incoming_text && h.reply_text) {
              history.push({ role: "user", content: String(h.incoming_text) });
              history.push({ role: "assistant", content: String(h.reply_text) });
            }
          }
        } catch (_e) { /* ignore */ }

        const primeiraVez = history.length === 0 ? " É o primeiro contato dela por aqui." : " Vocês já conversaram antes (veja o histórico).";
        const system = `${SYSTEM_PROMPT}\n\n## Contexto desta conversa\n${contextLine}${primeiraVez}`;
        const userMsg = kind === "button" || kind === "interactive"
          ? `(A pessoa respondeu a uma pesquisa/botão com: "${text}")`
          : text;

        const raw = await aiReply(system, history, userMsg);
        if (!raw) {
          await admin.from("wa_interactions").update({ status: "error", error: "sem_resposta_ia" }).eq("wa_message_id", msgId);
          continue;
        }
        const { emoji, text: replyText } = splitReaction(raw);
        if (emoji) { try { await sendReaction(from, msgId, emoji); } catch (_e) { /* ignore */ } }
        const finalText = replyText || raw;
        const ok = await sendText(from, finalText);
        await admin.from("wa_interactions").update({ reply_text: raw, status: ok ? "sent" : "error" }).eq("wa_message_id", msgId);
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
  try { (globalThis as any).EdgeRuntime?.waitUntil?.(work); } catch { /* ignore */ }
  if (!(globalThis as any).EdgeRuntime?.waitUntil) { await work; }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
