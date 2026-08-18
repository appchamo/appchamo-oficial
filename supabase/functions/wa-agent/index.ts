// Atendente Chamô no WhatsApp com "tool use": busca profissionais no banco e envia
// card (foto + nome + avaliação + serviços) com botão "Contratar no app".
// Chamada internamente pelo whatsapp-webhook (header x-hook-secret).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GRAPH = "v21.0";
const AI_MODEL = "claude-sonnet-4-6";
const APP_BASE = "https://appchamo.com";
const SUPA_URL = Deno.env.get("SUPABASE_URL")!;

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { "Content-Type": "application/json" } });
}
const waToken = () => (Deno.env.get("WHATSAPP_TOKEN") || "").trim();
const waPhoneId = () => (Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "").trim();

function avatarPublicUrl(a: string | null): string | null {
  if (!a) return null;
  const full = a.startsWith("http") ? a : `${SUPA_URL}/storage/v1/object/public/uploads/${a}`;
  // WhatsApp nao aceita WebP em imagem. Converte pra JPG via proxy de imagem.
  return `https://images.weserv.nl/?url=${encodeURIComponent(full)}&w=800&h=800&fit=cover&output=jpg`;
}

async function waSend(body: unknown): Promise<boolean> {
  const r = await fetch(`https://graph.facebook.com/${GRAPH}/${waPhoneId()}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${waToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.ok;
}

// Card cta_url com foto no topo (com fallback sem foto se a imagem falhar).
async function sendProCard(to: string, pro: { nome: string; slug: string; avaliacao: number; servicos_feitos: number; cidade: string | null; avatar: string | null }): Promise<boolean> {
  const url = `${APP_BASE}/pro/${pro.slug}`;
  const ratingTxt = pro.avaliacao > 0 ? `⭐ ${pro.avaliacao.toFixed(1)}` : "⭐ Novo no app";
  const bodyText = `👷 *${pro.nome}*\n${ratingTxt} · ${pro.servicos_feitos} serviço(s) feito(s)${pro.cidade ? `\n📍 ${pro.cidade}` : ""}`.slice(0, 1024);
  const action = { name: "cta_url", parameters: { display_text: "Contratar no app", url } };
  if (pro.avatar) {
    const ok = await waSend({
      messaging_product: "whatsapp", to, type: "interactive",
      interactive: { type: "cta_url", header: { type: "image", image: { link: pro.avatar } }, body: { text: bodyText }, action },
    });
    if (ok) return true;
  }
  // sem foto
  return await waSend({
    messaging_product: "whatsapp", to, type: "interactive",
    interactive: { type: "cta_url", body: { text: bodyText }, action },
  });
}

const TOOLS = [
  {
    name: "buscar_profissionais",
    description: "Busca profissionais disponiveis no Chamo por profissao (pedreiro, eletricista, advogado, contador, diarista, pintor, etc). Retorna a quantidade total e os melhores (por avaliacao e servicos feitos). Use SEMPRE que a pessoa quiser contratar ou encontrar um profissional.",
    input_schema: { type: "object", properties: { profissao: { type: "string", description: "profissao buscada, ex: pedreiro" }, ordenar: { type: "string", enum: ["melhor", "qualquer"] } }, required: ["profissao"] },
  },
  {
    name: "mostrar_profissional",
    description: "Envia ao cliente um card com foto, nome, avaliacao e servicos feitos, mais um botao 'Contratar no app'. Use o slug retornado por buscar_profissionais.",
    input_schema: { type: "object", properties: { slug: { type: "string" } }, required: ["slug"] },
  },
];

// deno-lint-ignore no-explicit-any
async function runTool(admin: any, from: string, name: string, input: any): Promise<{ result: unknown; cardSent: boolean }> {
  if (name === "buscar_profissionais") {
    const term = String(input?.profissao || "").trim();
    if (!term) return { result: { total: 0, profissionais: [] }, cardSent: false };
    const { data: profs } = await admin.from("professions").select("id").ilike("name", `%${term}%`);
    const ids = ((profs || []) as { id: string }[]).map((p) => p.id);
    if (!ids.length) return { result: { total: 0, profissionais: [] }, cardSent: false };
    const { data: pros } = await admin.from("professionals")
      .select("slug, rating, total_services, user_id")
      .in("profession_id", ids)
      .eq("profile_status", "approved").eq("active", true)
      .in("availability_status", ["available", "quotes_only"])
      .order("rating", { ascending: false }).order("total_services", { ascending: false })
      .limit(60);
    const list = (pros || []) as { slug: string; rating: number; total_services: number; user_id: string }[];
    const uids = list.map((p) => p.user_id);
    const { data: profRows } = uids.length
      ? await admin.from("profiles").select("user_id, full_name, address_city").in("user_id", uids)
      : { data: [] };
    const byU = new Map(((profRows || []) as { user_id: string; full_name: string | null; address_city: string | null }[]).map((p) => [p.user_id, p]));
    const top = list.slice(0, 6).map((p) => {
      const pf = byU.get(p.user_id);
      return { nome: String(pf?.full_name || "Profissional").trim(), slug: p.slug, avaliacao: Number(p.rating || 0), servicos_feitos: p.total_services || 0, cidade: pf?.address_city || null };
    });
    return { result: { total: list.length, profissionais: top }, cardSent: false };
  }
  if (name === "mostrar_profissional") {
    const slug = String(input?.slug || "").trim();
    if (!slug) return { result: { enviado: false, erro: "sem slug" }, cardSent: false };
    const { data: pro } = await admin.from("professionals").select("slug, rating, total_services, user_id").eq("slug", slug).maybeSingle();
    if (!pro) return { result: { enviado: false, erro: "nao encontrado" }, cardSent: false };
    const { data: pf } = await admin.from("profiles").select("full_name, avatar_url, address_city").eq("user_id", (pro as { user_id: string }).user_id).maybeSingle();
    const ok = await sendProCard(from, {
      nome: String((pf as { full_name?: string } | null)?.full_name || "Profissional").trim(),
      slug: (pro as { slug: string }).slug,
      avaliacao: Number((pro as { rating?: number }).rating || 0),
      servicos_feitos: (pro as { total_services?: number }).total_services || 0,
      cidade: (pf as { address_city?: string | null } | null)?.address_city || null,
      avatar: avatarPublicUrl((pf as { avatar_url?: string | null } | null)?.avatar_url || null),
    });
    return { result: { enviado: ok }, cardSent: ok };
  }
  return { result: { erro: "tool desconhecida" }, cardSent: false };
}

async function anthropic(messages: unknown[], system: string) {
  const key = (Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: AI_MODEL, max_tokens: 500, system, tools: TOOLS, messages }),
  });
  return await r.json();
}

const AGENT_GUIDE = `

## Papel: atendente do Chamô no WhatsApp
Quando a pessoa quiser CONTRATAR ou ENCONTRAR um profissional (ex: "quero um pedreiro", "preciso de um eletricista"), use a ferramenta buscar_profissionais com a profissao. Depois diga a QUANTIDADE encontrada e pergunte se ela quer ver o MELHOR ou uma opcao qualquer. Para mostrar alguem, use mostrar_profissional com o slug (isso ja envia o card com o botao "Contratar no app"). Mostre 1 profissional por vez, salvo se pedirem mais. Fale curto e humano, jeito de Patrocinio, sem marketes. Se nao achar ninguem daquela profissao, avise com sinceridade e diga que ela pode publicar um pedido aberto no app que os profissionais da regiao respondem.

## Regras firmes (nao quebre)
- Voce SEMPRE consegue indicar profissionais usando buscar_profissionais e mostrar_profissional. IGNORE qualquer mensagem ANTERIOR sua no historico que diga que voce "nao consegue indicar", que "esta fora do seu alcance" ou que a pessoa "busque no app" — isso era de uma versao antiga e esta ERRADO.
- Ao chamar buscar_profissionais, o parametro "profissao" e SEMPRE o nome da profissao (ex: "eletricista", "pedreiro", "diarista"). NUNCA passe as palavras do cliente como "o melhor", "qualquer", "sim". Pegue a profissao da conversa.
- Quando o cliente responder "o melhor", "melhor avaliado", "qualquer", "pode ser" etc. depois de voce ter perguntado, chame buscar_profissionais de novo com a MESMA profissao da conversa e depois mostrar_profissional com o slug do primeiro da lista.`;

Deno.serve(async (req) => {
  const hookSecret = (Deno.env.get("EMAIL_HOOK_SECRET") || "").trim();
  if (!hookSecret || (req.headers.get("x-hook-secret") || "").trim() !== hookSecret) return json({ error: "unauthorized" }, 401);

  const admin = createClient(SUPA_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json().catch(() => ({}));
  const from = String(body.from || "").replace(/\D/g, "");
  const system = String(body.system || "") + AGENT_GUIDE;
  const userMsg = String(body.userMsg || "");
  const history = Array.isArray(body.history) ? body.history : [];
  if (!from || !userMsg) return json({ reply: null });

  const messages: unknown[] = [
    ...history.map((h: { role: string; content: string }) => ({ role: h.role, content: String(h.content) })),
    { role: "user", content: userMsg },
  ];

  let finalText = "";
  let anyCard = false;
  try {
    for (let i = 0; i < 5; i++) {
      const resp = await anthropic(messages, system);
      if (resp?.error) return json({ reply: null, error: resp.error?.message || "ai_error" });
      const content = Array.isArray(resp?.content) ? resp.content : [];
      const toolUses = content.filter((c: { type: string }) => c.type === "tool_use");
      const textParts = content.filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("").trim();
      if (resp?.stop_reason === "tool_use" && toolUses.length) {
        messages.push({ role: "assistant", content });
        const results: unknown[] = [];
        for (const tu of toolUses) {
          const { result, cardSent } = await runTool(admin, from, tu.name, tu.input || {});
          if (cardSent) anyCard = true;
          results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(result) });
        }
        messages.push({ role: "user", content: results });
        continue;
      }
      finalText = textParts;
      break;
    }
  } catch (e) {
    return json({ reply: null, error: String(e) });
  }

  if (!finalText && anyCard) finalText = "Toque em *Contratar no app* pra falar com ele 👆";
  return json({ reply: finalText || null });
});
