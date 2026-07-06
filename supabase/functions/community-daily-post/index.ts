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
const MODELS = ["claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-6"];

function buildPrompt(recentPosts: string[]): string {
  const evitar = recentPosts.length
    ? `\n\nNÃO repita nem pareça com estes posts recentes:\n- ${recentPosts.map((p) => p.slice(0, 120)).join("\n- ")}`
    : "";
  return `Você escreve UM post curto para o feed da Comunidade do app "Chamô", publicando como o perfil oficial "Chamô Tecnologia".

Sobre o Chamô: app que conecta clientes a profissionais de serviços locais (eletricista, encanador, diarista, pintor, montador, técnico, designer, jardineiro, etc.) em Patrocínio-MG e região. A Comunidade é um feed onde os PROFISSIONAIS e empresas interagem — uma rede dos prestadores de serviço.

Escreva UMA dica, ideia ou novidade do dia. Escolha um destes ângulos (varie a cada dia):
- Dica de negócio pro profissional: atendimento, captar mais clientes, precificar, pós-venda, reputação, foto de perfil, responder rápido.
- Dica prática do ofício ou de organização do trabalho.
- Como usar melhor o Chamô pra crescer (destaque, avaliações, responder chamadas rápido).
- Uma novidade, motivação ou reflexão curta que engaje a comunidade.

Regras:
- Português do Brasil, tom humano, próximo e inspirador — NADA de corporativês nem robótico.
- Entre 250 e 600 caracteres. Pode usar 1 a 3 emojis com bom senso e quebras de linha.
- Pode terminar com uma pergunta pra estimular comentários.
- Nada de promessa falsa, nada de link externo, nada de pedir dados.${evitar}

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
  bodyText = bodyText.slice(0, 1500);

  const { data: inserted, error } = await admin
    .from("community_posts")
    .insert({ author_id: CHAMO_AUTHOR_ID, body: bodyText, audience: "public" })
    .select("id")
    .single();
  if (error) return json({ ok: false, error: error.message }, 200);

  return json({ ok: true, post_id: (inserted as any)?.id, preview: bodyText.slice(0, 140) });
});
