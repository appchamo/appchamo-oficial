// Webhook de ENTRADA do WhatsApp (Cloud API):
//  1) STATUS das mensagens (sent/delivered/read/failed) -> atualiza public.wa_messages.
//  2) OPT-OUT/OPT-IN: PARAR/SAIR/STOP -> desliga; VOLTAR/ATIVAR/SIM -> religa.
//  3) IA de atendimento (Sonnet): responde dúvidas/botões com histórico da conversa,
//     sabendo se a pessoa é cliente ou profissional. Marca como lida e reage com emoji.
//  4) ÁUDIO: se a pessoa manda áudio, transcreve (ElevenLabs Scribe), responde e devolve
//     em ÁUDIO (ElevenLabs TTS). Texto -> texto; áudio -> áudio.
// Log + dedup em public.wa_interactions. GET: verificação (hub.challenge).
// Secrets: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, ANTHROPIC_API_KEY, ELEVENLABS_API_KEY,
//          ELEVENLABS_VOICE_ID (opcional), WA_VERIFY_TOKEN (opcional).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GRAPH_VERSION = "v21.0";
const VERIFY_TOKEN = (Deno.env.get("WA_VERIFY_TOKEN") || "chamo-wa-2026").trim();
const AI_MODEL = "claude-sonnet-4-6";
const EL_VOICE = (Deno.env.get("ELEVENLABS_VOICE_ID") || "21m00Tcm4TlvDq8ikWAM").trim();

const STOP_WORDS = new Set(["parar", "sair", "stop", "cancelar", "descadastrar", "pare"]);
const START_WORDS = new Set(["voltar", "ativar", "sim", "start", "retornar"]);

const SYSTEM_PROMPT = `Você é o Assistente Chamô no WhatsApp. O Chamô é um app que conecta CLIENTES a PROFISSIONAIS e EMPRESAS de serviços locais (foco em Patrocínio-MG): eletricista, diarista, pintor, manicure, borracheiro, e muitos outros.

## Estilo (WhatsApp)
- Português do Brasil, caloroso, humano e CURTO (1 a 3 frases). Vá direto ao ponto.
- NÃO cumprimente com "Oi/Olá/Bom dia" em toda mensagem. Só se for o primeiro contato. Se já estão conversando, responda direto, sem saudação repetida.
- Não use travessão. No máximo 1 emoji no texto, e nem sempre.
- Use o nome da pessoa com naturalidade, sem repetir a cada mensagem.
- Você pode, opcionalmente, COMEÇAR a resposta com uma reação em emoji no formato [react:EMOJI] (ex.: [react:❤️], [react:👍], [react:😂]) quando fizer sentido. Use com moderação: a maioria das mensagens NÃO precisa de reação.

## Conhecimento do Chamô
- COMO CONTRATAR (cliente): busca ou categorias -> abre o perfil do profissional -> faz a chamada/pedido -> conversa fica no chat de Mensagens do app.
- VIRAR PROFISSIONAL: no app tem "Quero ser profissional" (cadastro), passa por aprovação da equipe.
- PLANOS (profissional): Free (até 3 chamadas, cobrança presencial), Pro (chamadas ilimitadas, recebe pagamento pelo app), VIP (Pro + selo verificado + destaque na Home + fotos no perfil), Business (VIP + catálogo, publicar vagas, consultoria, suporte 24h).
- No iOS os planos pagos usam compra dentro do app (Apple); no Android/web pode ter checkout. NUNCA invente preços, taxas, prazos ou datas.

## Regras
- Nunca prometa reembolso, prazo, valor ou política que você não tem certeza. Diga que os valores/regras aparecem nas telas do app e que o suporte confirma casos específicos.
- Reclamação ou problema de pagamento: seja empático, peça desculpas e oriente a falar com o suporte dentro do app.
- Se for spam, propaganda de terceiros ou ofensa: responda educado e breve.
- Se a pessoa respondeu a uma pesquisa: "Recomendo muito" -> agradeça animado; "Poderia melhorar" -> agradeça e pergunte o que dá pra melhorar.
- Se a mensagem veio por ÁUDIO, sua resposta também vira áudio: então escreva um texto que soa bem falado (natural, sem markdown, sem emojis dentro do texto).`;

function norm(s: string): string {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}
function tsToIso(t: unknown): string {
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : new Date().toISOString();
}
function waToken() { return (Deno.env.get("WHATSAPP_TOKEN") || "").trim(); }
function waPhoneId() { return (Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "").trim(); }

async function waPost(body: Record<string, unknown>): Promise<boolean> {
  const token = waToken(), phoneId = waPhoneId();
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
async function markRead(msgId: string): Promise<void> { await waPost({ status: "read", message_id: msgId }); }
async function sendReaction(to: string, msgId: string, emoji: string): Promise<void> {
  await waPost({ to, type: "reaction", reaction: { message_id: msgId, emoji } });
}
function splitReaction(reply: string): { emoji: string | null; text: string } {
  const m = reply.match(/^\s*\[react:\s*(\S+?)\s*\]\s*/u);
  if (m) return { emoji: m[1], text: reply.slice(m[0].length).trim() };
  return { emoji: null, text: reply };
}

// ── ÁUDIO ──
async function downloadWaMedia(mediaId: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const token = waToken();
  if (!token) return null;
  try {
    const meta = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, { headers: { Authorization: `Bearer ${token}` } });
    const mj = await meta.json();
    if (!mj?.url) return null;
    const bin = await fetch(mj.url, { headers: { Authorization: `Bearer ${token}` } });
    if (!bin.ok) return null;
    return { bytes: new Uint8Array(await bin.arrayBuffer()), mime: String(mj.mime_type || "audio/ogg") };
  } catch (_e) { return null; }
}
async function transcribe(bytes: Uint8Array, mime: string): Promise<string | null> {
  const key = (Deno.env.get("ELEVENLABS_API_KEY") || "").trim();
  if (!key) return null;
  try {
    const fd = new FormData();
    fd.append("model_id", "scribe_v1");
    fd.append("file", new Blob([bytes], { type: mime || "audio/ogg" }), "audio.ogg");
    const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": key }, body: fd });
    const j = await r.json();
    const txt = String(j?.text || "").trim();
    return txt || null;
  } catch (_e) { return null; }
}
async function firstAvailableVoice(key: string): Promise<string | null> {
  try {
    const r = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": key } });
    const j = await r.json();
    const v = j?.voices?.[0]?.voice_id;
    return v ? String(v) : null;
  } catch { return null; }
}
async function ttsBytes(key: string, voice: string, text: string): Promise<{ bytes?: Uint8Array; error?: string }> {
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, 900), model_id: "eleven_multilingual_v2" }),
    });
    if (!r.ok) return { error: `tts_${r.status}:${(await r.text()).slice(0, 200)}` };
    return { bytes: new Uint8Array(await r.arrayBuffer()) };
  } catch (e) { return { error: `tts_exc:${(e as Error)?.message}` }; }
}
async function synthesize(text: string): Promise<{ bytes?: Uint8Array; error?: string }> {
  const key = (Deno.env.get("ELEVENLABS_API_KEY") || "").trim();
  if (!key) return { error: "sem_ELEVENLABS_API_KEY" };
  let res = await ttsBytes(key, EL_VOICE, text);
  if (res.bytes) return res;
  // Voz padrão pode não existir na conta -> tenta a primeira voz disponível.
  const v2 = await firstAvailableVoice(key);
  if (v2 && v2 !== EL_VOICE) {
    const res2 = await ttsBytes(key, v2, text);
    if (res2.bytes) return res2;
    return { error: `${res.error} | fallbackVoice ${v2}: ${res2.error}` };
  }
  return res;
}
async function uploadWaAudio(bytes: Uint8Array): Promise<{ id?: string; error?: string }> {
  const token = waToken(), phoneId = waPhoneId();
  if (!token || !phoneId) return { error: "wa_nao_configurado" };
  try {
    const fd = new FormData();
    fd.append("messaging_product", "whatsapp");
    fd.append("type", "audio/mpeg");
    fd.append("file", new Blob([bytes], { type: "audio/mpeg" }), "resposta.mp3");
    const r = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/media`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd,
    });
    const j = await r.json();
    if (!j?.id) return { error: `upload_${r.status}:${JSON.stringify(j).slice(0, 200)}` };
    return { id: String(j.id) };
  } catch (e) { return { error: `upload_exc:${(e as Error)?.message}` }; }
}
async function sendAudioReply(to: string, text: string): Promise<{ ok: boolean; reason: string }> {
  const s = await synthesize(text);
  if (!s.bytes) return { ok: false, reason: s.error || "tts_nulo" };
  const u = await uploadWaAudio(s.bytes);
  if (!u.id) return { ok: false, reason: u.error || "upload_nulo" };
  const ok = await waPost({ to, type: "audio", audio: { id: u.id } });
  return { ok, reason: ok ? "" : "envio_audio_falhou" };
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

async function process(payload: any) {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  for (const entry of entries) {
    for (const ch of (Array.isArray(entry?.changes) ? entry.changes : [])) {
      const value = ch?.value || {};

      // 1) STATUS -> wa_messages
      for (const st of (Array.isArray(value.statuses) ? value.statuses : [])) {
        const waId = String(st?.id || ""); const status = String(st?.status || "");
        if (!waId || !status) continue;
        const iso = tsToIso(st?.timestamp);
        const patch: Record<string, unknown> = { status };
        if (status === "sent") patch.sent_at = iso;
        else if (status === "delivered") patch.delivered_at = iso;
        else if (status === "read") patch.read_at = iso;
        else if (status === "failed") { patch.failed_at = iso; try { patch.error = JSON.stringify(st?.errors ?? null); } catch { patch.error = "failed"; } }
        try { await admin.from("wa_messages").update(patch).eq("wa_id", waId); } catch (_e) { /* ignore */ }
      }

      // 2) MENSAGENS
      for (const m of (Array.isArray(value.messages) ? value.messages : [])) {
        const from = String(m?.from || "").replace(/\D/g, "");
        const msgId = String(m?.id || "");
        const type = String(m?.type || "");
        if (!from || !msgId) continue;

        const isAudio = (type === "audio" || type === "voice") && m?.audio?.id;
        let text = "";
        let kind = type;
        if (type === "text") text = String(m?.text?.body || "");
        else if (type === "button") { text = String(m?.button?.text || m?.button?.payload || ""); kind = "button"; }
        else if (type === "interactive") { const i = m.interactive || {}; text = String(i?.button_reply?.title || i?.list_reply?.title || ""); kind = "interactive"; }
        else if (isAudio) kind = "audio";

        // Dedup
        const { error: dupErr } = await admin.from("wa_interactions")
          .insert({ wa_message_id: msgId, from_phone: from, kind, incoming_text: text || null, status: "pending" });
        if (dupErr) continue;

        try { await markRead(msgId); } catch (_e) { /* ignore */ }

        // Áudio -> transcreve
        let respondWithAudio = false;
        if (isAudio) {
          respondWithAudio = true;
          const media = await downloadWaMedia(String(m.audio.id));
          const transcript = media ? await transcribe(media.bytes, media.mime) : null;
          if (!transcript) {
            const reply = "Recebi seu áudio 🎧 mas não consegui entender bem. Pode mandar de novo ou escrever?";
            const ok = await sendText(from, reply);
            await admin.from("wa_interactions").update({ reply_text: reply, status: ok ? "sent" : "error", error: "stt_falhou" }).eq("wa_message_id", msgId);
            continue;
          }
          text = transcript;
          await admin.from("wa_interactions").update({ incoming_text: transcript }).eq("wa_message_id", msgId);
        }

        const n = norm(text);
        const last8 = from.slice(-8);

        // Opt-out / opt-in (também por áudio transcrito)
        if (STOP_WORDS.has(n) || START_WORDS.has(n)) {
          const wantsStop = STOP_WORDS.has(n);
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

        if (!text.trim()) {
          await admin.from("wa_interactions").update({ status: "skipped", error: "sem texto" }).eq("wa_message_id", msgId);
          continue;
        }

        // Identidade
        let contextLine = "A pessoa ainda não foi identificada no cadastro do Chamô (número não encontrado).";
        try {
          const { data: profs } = await admin.from("profiles").select("full_name, user_type").ilike("phone", `%${last8}%`).limit(10);
          if (profs && profs.length) {
            const pro = profs.find((p: any) => ["professional", "company"].includes((p.user_type || "").toLowerCase())) || profs[0];
            const nome = String((pro as any).full_name || "").split(" ")[0];
            const papel = roleLabel((pro as any).user_type);
            contextLine = `Você está falando com ${nome || "um usuário"}${papel ? `, que é ${papel} no Chamô` : ""}.`;
          }
        } catch (_e) { /* ignore */ }

        // Histórico
        const history: { role: string; content: string }[] = [];
        try {
          const { data: hist } = await admin.from("wa_interactions")
            .select("incoming_text, reply_text, created_at, wa_message_id")
            .eq("from_phone", from).neq("wa_message_id", msgId)
            .order("created_at", { ascending: true }).limit(12);
          for (const h of (hist || []) as any[]) {
            if (h.incoming_text && h.reply_text) {
              history.push({ role: "user", content: String(h.incoming_text) });
              history.push({ role: "assistant", content: String(h.reply_text) });
            }
          }
        } catch (_e) { /* ignore */ }

        const primeira = history.length === 0 ? " É o primeiro contato dela por aqui." : " Vocês já conversaram antes (veja o histórico).";
        const canal = respondWithAudio ? " A pessoa mandou por ÁUDIO, então sua resposta será falada em áudio." : "";
        const system = `${SYSTEM_PROMPT}\n\n## Contexto desta conversa\n${contextLine}${primeira}${canal}`;
        const userMsg = (kind === "button" || kind === "interactive")
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

        let ok = false;
        let audioErr: string | null = null;
        if (respondWithAudio) {
          const res = await sendAudioReply(from, finalText);
          ok = res.ok;
          if (!ok) { audioErr = res.reason; ok = await sendText(from, finalText); } // fallback texto
        } else {
          ok = await sendText(from, finalText);
        }
        await admin.from("wa_interactions").update({ reply_text: raw, status: ok ? "sent" : "error", error: audioErr }).eq("wa_message_id", msgId);
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
