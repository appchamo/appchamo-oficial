import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_SENDER_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"; // UUID fixo do assistente Chamô

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  try {
    const { ticket_id } = await req.json();
    if (!ticket_id) {
      return new Response(JSON.stringify({ error: "ticket_id obrigatório" }), { status: 400 });
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      console.error("OPENAI_API_KEY não configurado no Supabase Secrets.");
      return new Response(JSON.stringify({ error: "IA não configurada" }), { status: 500 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: ticket, error: ticketError } = await supabase
      .from("support_tickets")
      .select("id, user_id, subject")
      .eq("id", ticket_id)
      .single();

    if (ticketError || !ticket) {
      return new Response(JSON.stringify({ error: "Ticket não encontrado" }), { status: 404 });
    }

    const { data: messages, error: msgError } = await supabase
      .from("support_messages")
      .select("sender_id, content, created_at")
      .eq("ticket_id", ticket_id)
      .order("created_at", { ascending: true })
      .limit(20);

    if (msgError) {
      console.error("Erro ao buscar mensagens:", msgError);
      return new Response(JSON.stringify({ error: "Erro ao carregar conversa" }), { status: 500 });
    }

    const isBot = (id: string) => id === BOT_SENDER_ID;
    const conversation = (messages || []).map((m) =>
      isBot(m.sender_id) ? `Assistente: ${m.content}` : `Usuário: ${m.content}`
    );
    const lastMessage = (messages || [])[(messages?.length ?? 0) - 1];
    if (lastMessage && isBot(lastMessage.sender_id)) {
      return new Response(JSON.stringify({ ok: true, skipped: "last was bot" }), { status: 200 });
    }

    const systemPrompt = `Você é o assistente de suporte do app Chamô. Responda em português do Brasil, de forma clara, objetiva e prestativa.
Assunto do ticket: ${ticket.subject || "Geral"}.
Regras: seja breve (2-4 frases quando possível), não invente informações sobre preços ou planos específicos, e sugira "falar com um atendente" se a dúvida for muito específica ou sensível.`;

    const userPrompt = conversation.length
      ? conversation.join("\n")
      : "Usuário acabou de abrir o ticket. Dê boas-vindas e pergunte em que pode ajudar.";

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 400,
        temperature: 0.5,
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error("OpenAI error:", openaiRes.status, errText);
      return new Response(
        JSON.stringify({ error: "Erro ao gerar resposta da IA" }),
        { status: 502 }
      );
    }

    const openaiData = await openaiRes.json();
    const reply =
      openaiData?.choices?.[0]?.message?.content?.trim() ||
      "Desculpe, não consegui processar. Um atendente pode ajudar em breve.";

    const { error: insertError } = await supabase.from("support_messages").insert({
      ticket_id: ticket_id,
      user_id: ticket.user_id,
      sender_id: BOT_SENDER_ID,
      content: reply,
    });

    if (insertError) {
      console.error("Erro ao inserir mensagem do bot:", insertError);
      return new Response(JSON.stringify({ error: "Erro ao salvar resposta" }), { status: 500 });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error("support-ai-reply erro:", err);
    return new Response(JSON.stringify({ error: "Erro interno" }), { status: 500 });
  }
});
