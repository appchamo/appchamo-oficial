/**
 * support-ai-reply
 * Usa a OpenAI Chat Completions API (gpt-4o-mini) — mais rápida e confiável.
 * Cada chamada envia o histórico da conversa para a IA responder em contexto.
 *
 * Secrets necessários no Supabase:
 *   OPENAI_API_KEY  — chave da API OpenAI
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

    /* ── 3. Detecta pedido de atendente humano ── */
    const lastContent = (last && !isBot(last.sender_id) ? last.content : "").toLowerCase();
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

    /* ── 4. Monta histórico para a IA ── */
    const chatMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
      {
        role: "system",
        content: `Você é o Chamô, assistente virtual do app Chamô — plataforma que conecta clientes a profissionais e empresas de serviços.

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

Assunto do ticket: ${ticket.subject || "Suporte geral"}`,
      },
    ];

    // Adiciona histórico (filtra mensagens de sistema e vazias)
    for (const m of list) {
      const content = m.content?.trim();
      if (!content || content === "[CLOSED]") continue;
      if (content.startsWith("[AUDIO:") || content.startsWith("[IMAGE:") || content.startsWith("[FILE:")) continue;
      chatMessages.push({
        role: isBot(m.sender_id) ? "assistant" : "user",
        content,
      });
    }

    /* ── 5. Chama a OpenAI Chat Completions ── */
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
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
    const reply =
      openaiData?.choices?.[0]?.message?.content?.trim() ||
      "Desculpe, não consegui processar sua mensagem. Um atendente pode ajudar em breve!";

    /* ── 6. Salva resposta no banco ── */
    const { error: insertErr } = await supabase.from("support_messages").insert({
      ticket_id,
      user_id: ticket.user_id,
      sender_id: BOT_SENDER_ID,
      content: reply,
    });

    if (insertErr) {
      console.error("Erro ao inserir resposta do bot:", insertErr);
      return jsonResponse({ error: "Erro ao salvar resposta" }, 500);
    }

    console.log("Resposta da IA inserida no ticket", ticket_id);
    return jsonResponse({ ok: true });

  } catch (err) {
    console.error("support-ai-reply erro:", err);
    return jsonResponse({ error: "Erro interno" }, 500);
  }
});
