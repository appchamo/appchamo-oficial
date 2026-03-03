import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_SENDER_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"; // UUID fixo do assistente Chamô

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(body: object, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const { ticket_id } = await req.json();
    if (!ticket_id) {
      return jsonResponse({ error: "ticket_id obrigatório" }, 400);
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      console.error("OPENAI_API_KEY não configurado no Supabase Secrets.");
      return jsonResponse({ error: "IA não configurada" }, 500);
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
      return jsonResponse({ error: "Ticket não encontrado" }, 404);
    }

    const { data: messages, error: msgError } = await supabase
      .from("support_messages")
      .select("sender_id, content, created_at")
      .eq("ticket_id", ticket_id)
      .order("created_at", { ascending: true })
      .limit(20);

    if (msgError) {
      console.error("Erro ao buscar mensagens:", msgError);
      return jsonResponse({ error: "Erro ao carregar conversa" }, 500);
    }

    const isBot = (id: string) => id === BOT_SENDER_ID;
    const list = messages || [];
    const conversation = list.map((m) =>
      isBot(m.sender_id) ? `Assistente: ${m.content}` : `Usuário: ${m.content}`
    );
    const lastMessage = list[list.length - 1];
    if (lastMessage && isBot(lastMessage.sender_id)) {
      console.log("Pulando: última mensagem já é do bot (evita resposta duplicada)");
      return jsonResponse({ ok: true, skipped: "last was bot" }, 200);
    }
    if (list.length === 0) {
      console.log("Nenhuma mensagem no ticket ainda; enviando boas-vindas.");
    }

    const lastUserContent = lastMessage && !isBot(lastMessage.sender_id) ? (lastMessage.content || "").toLowerCase() : "";
    const wantsHuman = /\b(atendente\s+humano|falar\s+com\s+(um\s+)?(atendente|humano|pessoa)|quero\s+(um\s+)?(atendente|humano)|atendente\s+por\s+favor|transferir\s+para\s+(um\s+)?(atendente|humano))\b/i.test(lastUserContent);

    if (wantsHuman) {
      const { data: ticketRow } = await supabase.from("support_tickets").select("requested_human_at").eq("id", ticket_id).single();
      if (ticketRow && !ticketRow.requested_human_at) {
        await supabase.from("support_tickets").update({ requested_human_at: new Date().toISOString() }).eq("id", ticket_id);
        const { data: supportProfile } = await supabase.from("profiles").select("user_id").eq("email", "suporte@appchamo.com").maybeSingle();
        if (supportProfile?.user_id) {
          await supabase.from("notifications").insert({
            user_id: supportProfile.user_id,
            title: "Um usuário quer falar com um atendente",
            message: "Clique para abrir o atendimento no suporte.",
            type: "support",
            link: "/suporte-desk",
          });
        }
        await supabase.from("support_messages").insert({
          ticket_id: ticket_id,
          user_id: ticket.user_id,
          sender_id: BOT_SENDER_ID,
          content: "Entendido, em breve um atendente entrará em contato, aguarde.",
        });
        return jsonResponse({ ok: true, requested_human: true }, 200);
      }
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
      return jsonResponse({ error: "Erro ao gerar resposta da IA" }, 502);
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
      return jsonResponse({ error: "Erro ao salvar resposta" }, 500);
    }

    console.log("Resposta da IA inserida no ticket", ticket_id);
    return jsonResponse({ ok: true }, 200);
  } catch (err) {
    console.error("support-ai-reply erro:", err);
    return jsonResponse({ error: "Erro interno" }, 500);
  }
});
