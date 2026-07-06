// Post diário na Comunidade, escrito por IA (Claude), publicado como o perfil oficial Chamô Tecnologia.
// Cron 1x/dia (x-hook-secret). Insere em community_posts -> dispara notificação aos profissionais
// (respeitando o opt-out do sino da comunidade).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// Perfil oficial: Chamô Tecnologia (chamotecnologia@gmail.com)
const CHAMO_AUTHOR_ID = "f0e03e07-fb41-4338-931a-ef7ac7ecc698";
const MODELS = ["claude-sonnet-4-6", "claude-haiku-4-5-20251001", "claude-opus-4-6"];

function buildPrompt(recentPosts: string[]): string {
  const evitar = recentPosts.length
    ? `\n\nNão repita nem pareça com estes posts recentes:\n- ${recentPosts.map((p) => p.slice(0, 120)).join("\n- ")}`
    : "";
  return `Você escreve UM post curto e MUITO SIMPLES pro feed da Comunidade do app "Chamô", como o perfil oficial "Chamô Tecnologia".

Sobre o Chamô: app que liga o cliente ao profissional de serviço da cidade (eletricista, encanador, diarista, pintor, montador, jardineiro, etc.) em Patrocínio-MG e região. Na Comunidade quem lê são os profissionais, gente simples que trabalha com as mãos.

Tem que ser uma DICA CONCRETA e útil, que a pessoa aprende algo prático de verdade. Escolha um tema simples do dia a dia do profissional: conseguir mais clientes, atender bem, foto de perfil, responder rápido, combinar preço, organizar o trabalho, fidelizar cliente. Varie o tema todo dia.

PROIBIDO (isso deixa com cara de robô, NÃO faça):
- Mensagem motivacional genérica tipo "bom dia, excelente segunda-feira, um dia de conquistas".
- Frases de efeito vazias tipo "acreditamos que o sucesso acontece quando pessoas se conectam", "juntos vamos mais longe".
- Travessão (— ou –). NUNCA use. Use vírgula ou ponto.
- Palavra difícil ou de escritório: "otimize", "estratégia", "engajamento", "diferencial", "propósito", "excelência".
- Tom de coach ou de LinkedIn. Sem "TODA diferença", sem "não é X, é Y".

COMO ESCREVER:
- Fale como um amigo falando, simples e direto, do jeito que a gente fala na rua.
- Comece já pela dica, sem enrolação. Uma ideia só, clara na primeira lida.
- Frases curtas. No máximo 1 emoji. Entre 200 e 420 caracteres (curto!). Pode terminar com uma pergunta simples.
- Nada de promessa falsa, link externo ou pedir dados.

Exemplos do TOM e do TAMANHO certo (não copie o conteúdo, faça outro tema):
1) "Cliente gosta de resposta rápida. Se você demora, ele já chama outro. Deixa as notificações do app ligadas e responde assim que der. Já perdeu serviço por demorar?"
2) "Uma foto sua trabalhando vale mais que mil palavras. Tira uma no próximo serviço e põe no perfil. Cliente confia mais em quem ele vê fazendo. Você já tem foto no seu?"${evitar}

Responda APENAS um JSON válido, sem texto extra:
{"body":"texto do post aqui"}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const hookSecret = (Deno.env.get("EMAIL_HOOK_SECRET") || "").trim();
  if (!hookSecret || (req.headers.get("x-hook-secret") || "").trim() !== hookSecret) return json({ error: "unauthorized" }, 401);

  const apiKey = (Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
  if (!apiKey) return json({ error: "anthropic_not_configured" }, 500);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Posts recentes do Chamô (pra não repetir).
  let recent: string[] = [];
  try {
    const { data } = await admin.from("community_posts").select("body").eq("author_id", CHAMO_AUTHOR_ID).order("created_at", { ascending: false }).limit(12);
    recent = ((data as any[]) || []).map((r) => String(r.body || "").trim()).filter(Boolean);
  } catch { /* best-effort */ }

  // Gera o post com a IA.
  let bodyText = "";
  const prompt = buildPrompt(recent);
  for (const model of MODELS) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 700, messages: [{ role: "user", content: prompt }] }),
      });
      if (r.status === 404) continue;
      const data = await r.json().catch(() => ({}));
      const text = (data?.content?.[0]?.text || "").trim();
      const m = text.match(/\{[\s\S]*\}/);
      if (m) {
        const v = JSON.parse(m[0]);
        bodyText = String(v.body || "").trim();
        if (bodyText) break;
      }
    } catch (e) {
      console.error("anthropic error", String((e as Error)?.message || e));
    }
  }

  if (!bodyText) {
    return json({ ok: false, error: "ia_sem_resposta" }, 200);
  }
  // Rede de segurança: remove qualquer travessão que tenha escapado (cara de IA).
  bodyText = bodyText.replace(/\s*[—–]\s*/g, ", ").replace(/,\s*,/g, ",").slice(0, 600);

  const { data: inserted, error } = await admin
    .from("community_posts")
    .insert({ author_id: CHAMO_AUTHOR_ID, body: bodyText, audience: "public" })
    .select("id")
    .single();
  if (error) return json({ ok: false, error: error.message }, 200);

  return json({ ok: true, post_id: (inserted as any)?.id, preview: bodyText.slice(0, 140) });
});
