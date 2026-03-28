/**
 * support-ai-reply
 * - Mensagens de texto: GPT-4o-mini responde em texto
 * - Mensagens de áudio [AUDIO:url:seconds]: Whisper transcreve → GPT responde → ElevenLabs sintetiza → bot envia áudio
 *
 * Secrets necessários no Supabase:
 *   OPENAI_API_KEY       — chave da API OpenAI (GPT + Whisper)
 *   ELEVENLABS_API_KEY   — chave da API ElevenLabs
 *   ELEVENLABS_VOICE_ID  — ID da voz ElevenLabs (ex: "pNInz6obpgDQGcFmaJgB")
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_SENDER_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

// ── Transcreve áudio via OpenAI Whisper ────────────────────────────────────
async function transcribeAudio(audioUrl: string, openaiKey: string): Promise<string | null> {
  try {
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) throw new Error(`Falha ao baixar áudio: ${audioRes.status}`);
    const audioBlob = await audioRes.blob();

    const ext = audioUrl.includes(".webm") ? "webm" : audioUrl.includes(".mp4") ? "mp4" : "m4a";
    const mimeType = ext === "webm" ? "audio/webm" : "audio/mp4";

    const form = new FormData();
    form.append("file", new File([audioBlob], `audio.${ext}`, { type: mimeType }));
    form.append("model", "whisper-1");
    form.append("language", "pt");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: form,
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Whisper error:", err);
      return null;
    }
    const data = await res.json();
    return data.text ?? null;
  } catch (e) {
    console.error("transcribeAudio error:", e);
    return null;
  }
}

// ── Sintetiza voz via ElevenLabs ──────────────────────────────────────────
async function synthesizeSpeech(text: string, elevenlabsKey: string, voiceId: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": elevenlabsKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("ElevenLabs error:", err);
      return null;
    }
    const buffer = await res.arrayBuffer();
    return new Uint8Array(buffer);
  } catch (e) {
    console.error("synthesizeSpeech error:", e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const { ticket_id } = await req.json();
    if (!ticket_id) return jsonResponse({ error: "ticket_id obrigatório" }, 400);

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      console.error("OPENAI_API_KEY não configurado");
      return jsonResponse({ error: "IA não configurada" }, 500);
    }

    const elevenlabsKey = Deno.env.get("ELEVENLABS_API_KEY");
    const elevenlabsVoiceId = Deno.env.get("ELEVENLABS_VOICE_ID") ?? "pNInz6obpgDQGcFmaJgB";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    /* ── 1. Busca ticket ── */
    const { data: ticket, error: tErr } = await supabase
      .from("support_tickets")
      .select("id, user_id, subject, requested_human_at")
      .eq("id", ticket_id)
      .single();
    if (tErr || !ticket) return jsonResponse({ error: "Ticket não encontrado" }, 404);

    /* ── 2. Busca histórico de mensagens ── */
    const { data: msgs } = await supabase
      .from("support_messages")
      .select("sender_id, content, created_at")
      .eq("ticket_id", ticket_id)
      .order("created_at", { ascending: true })
      .limit(30);

    const list = msgs ?? [];
    const isBot = (id: string) => id === BOT_SENDER_ID;

    // Não responde se a última mensagem já é do bot
    const last = list[list.length - 1];
    if (last && isBot(last.sender_id)) {
      console.log("Última mensagem já é do bot, pulando.");
      return jsonResponse({ ok: true, skipped: "last was bot" });
    }

    // Não responde se o conteúdo for [CLOSED]
    if (last?.content === "[CLOSED]") return jsonResponse({ ok: true, skipped: "closed" });

    // Se um atendente humano já respondeu, IA fica em silêncio
    const hasHumanAgent = list.some((m: any) =>
      m.sender_id !== BOT_SENDER_ID && m.sender_id !== ticket.user_id
    );
    if (hasHumanAgent) {
      console.log("Atendente humano detectado — IA desativada para o ticket:", ticket_id);
      return jsonResponse({ ok: true, skipped: "human_agent_active" });
    }

    /* ── 3. Verifica se a última mensagem é um áudio ── */
    const audioMatch = last?.content?.match(/\[AUDIO:(.+):(\d+)\]$/);
    const isAudioMessage = !!audioMatch;
    let userTextForAI = "";

    if (isAudioMessage) {
      const audioUrl = audioMatch![1];
      console.log("Mensagem de áudio detectada, transcrevendo:", audioUrl);
      const transcription = await transcribeAudio(audioUrl, openaiKey);
      if (!transcription) {
        // Não conseguiu transcrever — responde em texto pedindo para repetir
        userTextForAI = "[O usuário enviou um áudio que não foi possível transcrever]";
      } else {
        console.log("Transcrição:", transcription);
        userTextForAI = transcription;
      }
    }

    /* ── 4. Detecta pedido de atendente humano ── */
    const lastContent = isAudioMessage
      ? userTextForAI
      : (last && !isBot(last.sender_id) ? last.content : "").toLowerCase();

    const wantsHuman = /atendente\s*humano|falar\s*com\s*(um\s*)?(atendente|humano|pessoa)|transferir/i.test(lastContent);

    if (wantsHuman && !ticket.requested_human_at) {
      await supabase.from("support_tickets")
        .update({ requested_human_at: new Date().toISOString() })
        .eq("id", ticket_id);

      const { data: sp } = await supabase
        .from("profiles").select("user_id").eq("email", "suporte@appchamo.com").maybeSingle();
      if (sp?.user_id) {
        await supabase.from("notifications").insert({
          user_id: sp.user_id,
          title: "Um usuário quer falar com um atendente",
          message: "Clique para abrir o atendimento no suporte.",
          type: "support",
          link: "/suporte-desk",
        });
      }

      await supabase.from("support_messages").insert({
        ticket_id,
        user_id: ticket.user_id,
        sender_id: BOT_SENDER_ID,
        content: "Entendido! Em breve um atendente entrará em contato com você. Aguarde um momento. 😊",
      });
      return jsonResponse({ ok: true, requested_human: true });
    }

    /* ── 5. Monta histórico para o GPT ── */
    const systemPrompt = `Você é o Chamô, assistente virtual do app Chamô — plataforma que conecta clientes a profissionais e empresas de serviços.

Responda SEMPRE em português do Brasil, de forma amigável, clara e objetiva. Use no máximo 3-4 frases por resposta.

Sobre o app Chamô:
- Clientes encontram e contratam profissionais e empresas de serviços (eletricistas, pintores, designers, barbeiros etc.)
- Profissionais e empresas se cadastram, criam perfil, gerenciam agenda e recebem pagamentos pelo app
- Planos: Gratuito (limitado) e Business (recursos completos com agenda, pagamentos, etc.)
- Pagamentos: o app cobra uma taxa sobre os serviços. O saldo fica disponível na Carteira
- Suporte: atendimento via chat (você), com opção de falar com atendente humano se necessário

Regras:
- Se não souber a resposta exata, diga que vai verificar e sugira falar com um atendente humano
- Nunca invente valores, taxas ou prazos específicos que não conhece
- Se o problema for muito específico (pagamento bloqueado, conta suspensa, fraude), indique falar com atendente humano
- Seja empático e prestativo

Assunto do ticket: ${ticket.subject || "Suporte geral"}`;

    const chatMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt },
    ];

    // Histórico (filtra mensagens de sistema e vazias)
    for (const m of list) {
      const content = m.content?.trim();
      if (!content || content === "[CLOSED]") continue;

      // Áudio anterior: usa transcrição se disponível, senão indica
      if (content.startsWith("[AUDIO:")) {
        // Só processa o último áudio em tempo real; para histórico usa placeholder
        if (m === last && isAudioMessage) {
          chatMessages.push({ role: "user", content: userTextForAI });
        } else {
          chatMessages.push({ role: "user", content: "[usuário enviou um áudio]" });
        }
        continue;
      }

      // Anexos (imagem/vídeo/PDF): não enviar URL bruta ao modelo
      if (/^\[(IMAGE|VIDEO|FILE)(\|\|\|SPT\|\|\||:)/.test(content)) continue;
      chatMessages.push({ role: isBot(m.sender_id) ? "assistant" : "user", content });
    }

    /* ── 6. Chama GPT ── */
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: chatMessages,
        max_tokens: 350,
        temperature: 0.6,
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error("OpenAI error:", openaiRes.status, errText);
      return jsonResponse({ error: "Erro ao gerar resposta" }, 502);
    }

    const openaiData = await openaiRes.json();
    const replyText =
      openaiData?.choices?.[0]?.message?.content?.trim() ||
      "Desculpe, não consegui processar sua mensagem. Um atendente pode ajudar em breve!";

    /* ── 7. Se mensagem foi áudio + ElevenLabs disponível → responde em áudio ── */
    if (isAudioMessage && elevenlabsKey) {
      console.log("Sintetizando resposta em áudio via ElevenLabs...");
      const audioBytes = await synthesizeSpeech(replyText, elevenlabsKey, elevenlabsVoiceId);

      if (audioBytes) {
        const fileName = `audio/bot/${ticket_id}/${Date.now()}.mp3`;
        const { error: uploadErr } = await supabase.storage
          .from("uploads")
          .upload(fileName, audioBytes, { contentType: "audio/mpeg", upsert: true });

        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from("uploads").getPublicUrl(fileName);
          // Estima duração: ~150 palavras/min, ~2.5 chars/palavra → chars / 375 segundos
          const estimatedSeconds = Math.max(3, Math.round(replyText.length / 15));
          await supabase.from("support_messages").insert({
            ticket_id,
            user_id: ticket.user_id,
            sender_id: BOT_SENDER_ID,
            content: `[AUDIO:${urlData.publicUrl}:${estimatedSeconds}]`,
          });
          console.log("Resposta em áudio inserida para ticket", ticket_id);
          return jsonResponse({ ok: true, type: "audio" });
        } else {
          console.error("Erro ao fazer upload do áudio do bot:", uploadErr);
          // Cai para resposta em texto
        }
      }
    }

    /* ── 8. Salva resposta em texto ── */
    const { error: insertErr } = await supabase.from("support_messages").insert({
      ticket_id,
      user_id: ticket.user_id,
      sender_id: BOT_SENDER_ID,
      content: replyText,
    });

    if (insertErr) {
      console.error("Erro ao inserir resposta do bot:", insertErr);
      return jsonResponse({ error: "Erro ao salvar resposta" }, 500);
    }

    console.log("Resposta de texto inserida para ticket", ticket_id);
    return jsonResponse({ ok: true, type: "text" });

  } catch (err) {
    console.error("support-ai-reply erro:", err);
    return jsonResponse({ error: "Erro interno" }, 500);
  }
});
