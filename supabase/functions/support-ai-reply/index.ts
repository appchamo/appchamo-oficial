/**
 * support-ai-reply
 * Usa a OpenAI Assistants API com o assistant "CHAMO" configurado pelo usuário.
 * Cada ticket de suporte tem seu próprio thread persistido em openai_thread_id.
 *
 * Secrets necessários no Supabase:
 *   OPENAI_API_KEY       — chave da API OpenAI
 *   OPENAI_ASSISTANT_ID  — ID do assistant (ex: asst_V8vpnyKUF45KjQXaniJCbcnbS)
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

/** Helpers para a Assistants API */
const openaiBase = "https://api.openai.com/v1";
function oaiFetch(path: string, apiKey: string, opts: RequestInit = {}) {
  return fetch(`${openaiBase}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "OpenAI-Beta": "assistants=v2",
      ...(opts.headers ?? {}),
    },
  });
}

/** Aguarda o run completar (polling com timeout de 30 s) */
async function waitForRun(threadId: string, runId: string, apiKey: string): Promise<string> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1200));
    const res = await oaiFetch(`/threads/${threadId}/runs/${runId}`, apiKey);
    if (!res.ok) return "failed";
    const run = await res.json();
    if (run.status === "completed") return "completed";
    if (["failed", "cancelled", "expired"].includes(run.status)) return run.status;
  }
  return "timeout";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const { ticket_id } = await req.json();
    if (!ticket_id) return jsonResponse({ error: "ticket_id obrigatório" }, 400);

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const assistantId = Deno.env.get("OPENAI_ASSISTANT_ID");
    if (!openaiKey) {
      console.error("OPENAI_API_KEY não configurado");
      return jsonResponse({ error: "IA não configurada" }, 500);
    }
    if (!assistantId) {
      console.error("OPENAI_ASSISTANT_ID não configurado");
      return jsonResponse({ error: "Assistant não configurado" }, 500);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    /* ── 1. Busca ticket ── */
    const { data: ticket, error: tErr } = await supabase
      .from("support_tickets")
      .select("id, user_id, subject, openai_thread_id, requested_human_at")
      .eq("id", ticket_id)
      .single();
    if (tErr || !ticket) return jsonResponse({ error: "Ticket não encontrado" }, 404);

    /* ── 2. Busca mensagens do ticket ── */
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
      return jsonResponse({ ok: true, skipped: "last was bot" });
    }

    // Detecta pedido de atendente humano
    const lastContent = (last && !isBot(last.sender_id) ? last.content : "").toLowerCase();
    const wantsHuman = /atendente\s*humano|falar\s*com\s*(um\s*)?(atendente|humano|pessoa)|transferir/i.test(lastContent);

    if (wantsHuman && !ticket.requested_human_at) {
      await supabase.from("support_tickets").update({ requested_human_at: new Date().toISOString() }).eq("id", ticket_id);
      const { data: sp } = await supabase.from("profiles").select("user_id").eq("email", "suporte@appchamo.com").maybeSingle();
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
        content: "Entendido! Em breve um atendente entrará em contato. Aguarde um momento. 😊",
      });
      return jsonResponse({ ok: true, requested_human: true });
    }

    /* ── 3. Thread: reutiliza ou cria novo ── */
    let threadId = ticket.openai_thread_id as string | null;

    if (!threadId) {
      const tRes = await oaiFetch("/threads", openaiKey, { method: "POST", body: JSON.stringify({}) });
      if (!tRes.ok) {
        console.error("Erro ao criar thread:", await tRes.text());
        return jsonResponse({ error: "Erro ao criar thread" }, 502);
      }
      const tData = await tRes.json();
      threadId = tData.id as string;
      await supabase.from("support_tickets").update({ openai_thread_id: threadId }).eq("id", ticket_id);

      // Adiciona contexto inicial ao thread (histórico pré-existente se houver)
      const history = list.slice(0, -1); // tudo menos a última mensagem (que adicionaremos depois)
      for (const m of history) {
        const role = isBot(m.sender_id) ? "assistant" : "user";
        await oaiFetch(`/threads/${threadId}/messages`, openaiKey, {
          method: "POST",
          body: JSON.stringify({ role, content: m.content }),
        });
      }
    }

    /* ── 4. Adiciona a última mensagem do usuário ao thread ── */
    const lastUserMsg = last && !isBot(last.sender_id) ? last.content : "Olá, preciso de ajuda.";
    const addRes = await oaiFetch(`/threads/${threadId}/messages`, openaiKey, {
      method: "POST",
      body: JSON.stringify({ role: "user", content: lastUserMsg }),
    });
    if (!addRes.ok) {
      console.error("Erro ao adicionar mensagem:", await addRes.text());
      return jsonResponse({ error: "Erro ao enviar mensagem para o assistant" }, 502);
    }

    /* ── 5. Cria run com o assistant ── */
    const runRes = await oaiFetch(`/threads/${threadId}/runs`, openaiKey, {
      method: "POST",
      body: JSON.stringify({
        assistant_id: assistantId,
        additional_instructions: `Assunto do ticket: ${ticket.subject || "Suporte geral"}. Responda em português do Brasil, de forma clara e objetiva. Se a dúvida for muito específica ou sensível, sugira falar com um atendente humano.`,
      }),
    });
    if (!runRes.ok) {
      console.error("Erro ao criar run:", await runRes.text());
      return jsonResponse({ error: "Erro ao executar assistant" }, 502);
    }
    const runData = await runRes.json();

    /* ── 6. Aguarda conclusão ── */
    const finalStatus = await waitForRun(threadId, runData.id, openaiKey);
    if (finalStatus !== "completed") {
      console.error("Run não completou:", finalStatus);
      return jsonResponse({ error: `Run ${finalStatus}` }, 502);
    }

    /* ── 7. Busca a resposta do assistant ── */
    const msgsRes = await oaiFetch(`/threads/${threadId}/messages?limit=1&order=desc`, openaiKey);
    if (!msgsRes.ok) return jsonResponse({ error: "Erro ao buscar resposta" }, 502);
    const msgsData = await msgsRes.json();
    const assistantMsg = msgsData.data?.[0];
    const reply = assistantMsg?.content?.[0]?.text?.value?.trim()
      ?? "Desculpe, não consegui processar. Um atendente pode ajudar em breve.";

    /* ── 8. Salva resposta no banco ── */
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

    console.log("Resposta do assistant CHAMO inserida no ticket", ticket_id);
    return jsonResponse({ ok: true });

  } catch (err) {
    console.error("support-ai-reply erro:", err);
    return jsonResponse({ error: "Erro interno" }, 500);
  }
});
