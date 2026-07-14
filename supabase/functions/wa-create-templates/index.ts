// Cria (e envia pra análise) modelos de mensagem do WhatsApp via Cloud API.
// POST { waba_id } com header x-hook-secret. Usa WHATSAPP_TOKEN (env).
// Idempotente-ish: se o nome já existe, a Meta retorna erro e a gente só reporta.
const GRAPH_VERSION = "v21.0";

type Btn =
  | { type: "URL"; text: string; url: string }
  | { type: "QUICK_REPLY"; text: string };

interface Tpl {
  name: string;
  category: "UTILITY" | "MARKETING";
  body: string;
  example: string[];        // valores de exemplo para {{1}}, {{2}}...
  buttons?: Btn[];
}

const TEMPLATES: Tpl[] = [
  // ── Feedback ──
  { name: "avaliar_servico", category: "UTILITY",
    body: "Oi {{1}}! Como foi o serviço com {{2}} pelo Chamô? Sua avaliação ajuda outros clientes e valoriza quem faz um bom trabalho. Leva 10 segundos. ⭐",
    example: ["João", "Douglas (Eletricista)"],
    buttons: [{ type: "URL", text: "Avaliar agora", url: "https://appchamo.com/" }] },
  { name: "pesquisa_satisfacao", category: "MARKETING",
    body: "Oi {{1}}, tá gostando do Chamô? De 0 a 10, o quanto você recomendaria pra um amigo? Sua resposta ajuda a gente a melhorar. 💚",
    example: ["Maria"],
    buttons: [{ type: "QUICK_REPLY", text: "Recomendo muito" }, { type: "QUICK_REPLY", text: "Poderia melhorar" }] },

  // ── Cliente ──
  { name: "chamada_criada", category: "UTILITY",
    body: "Oi {{1}}! Sua chamada para {{2}} foi enviada pelo Chamô. Assim que o profissional responder, você é avisado aqui e no app.",
    example: ["Maria", "Diarista"] },
  { name: "profissional_respondeu", category: "UTILITY",
    body: "Boas notícias, {{1}}! O profissional {{2}} respondeu sua chamada no Chamô. Abra o app para combinar os detalhes e fechar o serviço.",
    example: ["Maria", "Douglas"],
    buttons: [{ type: "URL", text: "Abrir conversa", url: "https://appchamo.com/" }] },
  { name: "lembrete_agendamento", category: "UTILITY",
    body: "Oi {{1}}, passando pra lembrar do seu atendimento com {{2}} em {{3}}. Se precisar remarcar, é só falar pelo app.",
    example: ["João", "Ana (Manicure)", "amanhã às 14h"] },
  { name: "reativacao_cliente", category: "MARKETING",
    body: "Oi {{1}}, faz um tempo que você não usa o Chamô. Precisa de um profissional de confiança? Tem eletricista, diarista, pintor, borracheiro e muito mais na sua região. É só chamar. 😉",
    example: ["Carlos"],
    buttons: [{ type: "URL", text: "Encontrar profissional", url: "https://appchamo.com/" }] },
  { name: "cupom_cliente", category: "MARKETING",
    body: "Oi {{1}}! Você ganhou {{2}} de desconto no Chamô. 🎁 Válido até {{3}}. Contrate um profissional e economize.",
    example: ["Maria", "R$ 20", "31/07"],
    buttons: [{ type: "URL", text: "Usar cupom", url: "https://appchamo.com/" }] },

  // ── Profissional ──
  { name: "cliente_avaliou", category: "UTILITY",
    body: "Oi {{1}}, você recebeu uma nova avaliação no Chamô ⭐. Veja o que o cliente falou e continue caprichando pra aparecer mais nas buscas.",
    example: ["Douglas"],
    buttons: [{ type: "URL", text: "Ver avaliação", url: "https://appchamo.com/" }] },
  { name: "chamada_sem_resposta", category: "UTILITY",
    body: "Oi {{1}}, você tem uma chamada esperando resposta há {{2}}. Responda rápido pra não perder o cliente — quem responde primeiro fecha mais serviços.",
    example: ["Ana", "2 horas"],
    buttons: [{ type: "URL", text: "Responder agora", url: "https://appchamo.com/" }] },
  { name: "limite_plano_pro", category: "MARKETING",
    body: "Oi {{1}}, você atingiu o limite de chamadas do plano grátis e novos clientes já não conseguem te chamar. Ative o Pro e volte a receber sem limite hoje mesmo.",
    example: ["Douglas"],
    buttons: [{ type: "URL", text: "Ativar o Pro", url: "https://appchamo.com/subscriptions" }] },
  { name: "documentos_pendentes", category: "UTILITY",
    body: "Oi {{1}}, faltou enviar seus documentos de verificação no Chamô. Perfis verificados recebem mais chamadas e passam mais confiança. Envie pelo app em Perfil > Segurança.",
    example: ["Carlos"] },
  { name: "dica_profissional", category: "MARKETING",
    body: "Oi {{1}}! Dica rápida do Chamô: perfis com foto real, serviços descritos e avaliações recebem até 3x mais chamadas. Dá uma revisada no seu perfil hoje. 🚀",
    example: ["Ana"],
    buttons: [{ type: "URL", text: "Revisar meu perfil", url: "https://appchamo.com/" }] },
];

Deno.serve(async (req) => {
  const hookSecret = (Deno.env.get("EMAIL_HOOK_SECRET") || "").trim();
  if (!hookSecret || (req.headers.get("x-hook-secret") || "").trim() !== hookSecret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }
  const token = (Deno.env.get("WHATSAPP_TOKEN") || "").trim();
  const body = await req.json().catch(() => ({}));
  const waba = String(body.waba_id || "").trim();
  if (!token || !waba) {
    return new Response(JSON.stringify({ error: "missing_token_or_waba" }), { status: 400 });
  }
  // Permite criar só um subconjunto: { only: ["avaliar_servico", ...] }
  const only: string[] | null = Array.isArray(body.only) && body.only.length ? body.only.map(String) : null;
  const list = only ? TEMPLATES.filter((t) => only.includes(t.name)) : TEMPLATES;

  const results: unknown[] = [];
  for (const t of list) {
    const components: Record<string, unknown>[] = [
      { type: "BODY", text: t.body, example: { body_text: [t.example] } },
    ];
    if (t.buttons?.length) {
      components.push({
        type: "BUTTONS",
        buttons: t.buttons.map((b) =>
          b.type === "URL"
            ? { type: "URL", text: b.text, url: b.url }
            : { type: "QUICK_REPLY", text: b.text }),
      });
    }
    const payload = { name: t.name, language: "pt_BR", category: t.category, components };
    try {
      const r = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${waba}/message_templates`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      results.push({ name: t.name, ok: r.ok, status: r.status, id: (j as any)?.id ?? null, category: (j as any)?.category ?? t.category, error: r.ok ? null : ((j as any)?.error?.error_user_msg || (j as any)?.error?.message || JSON.stringify(j)) });
    } catch (e) {
      results.push({ name: t.name, ok: false, error: String(e) });
    }
  }
  const okCount = results.filter((r: any) => r.ok).length;
  return new Response(JSON.stringify({ ok: true, submitted: okCount, total: list.length, results }, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
});
