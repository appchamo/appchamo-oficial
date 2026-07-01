// Classifica RÁPIDO o tipo de documento (RG / CNH / passaporte) na hora da foto,
// usando Claude (visão), e compara com o tipo que o usuário selecionou.
// Retorna { ok } para o app decidir se libera ou pede nova foto.
// NÃO identifica pessoas nem faz reconhecimento facial — apenas classifica o tipo/qualidade.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function parseImage(input: string): { media_type: string; data: string } | null {
  if (!input) return null;
  const m = input.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (m) return { media_type: m[1], data: m[2] };
  return { media_type: "image/jpeg", data: input.replace(/\s/g, "") };
}

const TYPE_NAMES: Record<string, string> = {
  identidade: "Identidade (RG)",
  cnh: "CNH",
  passaporte: "Passaporte",
};

const PROMPT = `Você classifica o TIPO de um documento brasileiro em uma foto. \
NÃO identifica pessoas, NÃO compara rostos, NÃO lê dados pessoais — apenas classifica o tipo do documento e a qualidade.

Tipos possíveis:
- "identidade": carteira de identidade / RG (documento físico verde, "Carteira de Identidade", "Registro Geral").
- "cnh": Carteira Nacional de Habilitação (CNH) / carteira de motorista ("HABILITAÇÃO", "DRIVER LICENSE", tabela de categorias A/B/C).
- "passaporte": passaporte ("PASSAPORTE", "PASSPORT", página com foto e código de leitura no rodapé <<<).
- "outro": é um documento, mas não é nenhum dos três acima.
- "nenhum": NÃO há documento na imagem (ex.: foto de outra coisa, borrada demais, tela em branco).

Responda APENAS um JSON válido, sem texto extra:
{"is_document": true, "type": "identidade", "legible": true, "reason": "curta explicação em português"}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "metodo" }, 405);

  const apiKey = (Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
  // Sem chave: não bloqueia o fluxo (fail-open) — a checagem final no admin ainda ocorre.
  if (!apiKey) return json({ ok: true, skipped: "anthropic_not_configured" });

  const body = await req.json().catch(() => ({}));
  const img = parseImage(String(body.image || ""));
  const expected = String(body.expected_type || "");
  const side = String(body.side || "front"); // "front" | "back"
  if (!img) return json({ ok: true, skipped: "sem_imagem" });

  const content: unknown[] = [
    { type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } },
    { type: "text", text: PROMPT },
  ];

  let verdict: any = null;
  const MODELS = ["claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-6"];
  for (const model of MODELS) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 200, messages: [{ role: "user", content }] }),
      });
      if (r.status === 404) continue;
      const data = await r.json().catch(() => ({}));
      const text = (data?.content?.[0]?.text || "").trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) verdict = JSON.parse(jsonMatch[0]);
      break;
    } catch (e) {
      console.error("classify error", String((e as Error)?.message || e));
      break;
    }
  }

  // Falha de IA / parse: fail-open (não trava o usuário).
  if (!verdict) return json({ ok: true, skipped: "no_verdict" });

  const isDoc = verdict.is_document !== false;
  const detected = String(verdict.type || "outro");
  const expectedName = TYPE_NAMES[expected] || "documento";

  // Não é documento nenhum → bloqueia.
  if (!isDoc || detected === "nenhum") {
    return json({
      ok: false,
      detected,
      reason: `Não identificamos um documento na foto. Enquadre o ${expectedName} e tente novamente.`,
    });
  }

  // Só bloqueia por tipo na FRENTE, e apenas quando é um tipo conhecido DIFERENTE do selecionado.
  // (O verso costuma não mostrar o tipo; "outro" pode ser erro de leitura → não bloqueia.)
  const known = ["identidade", "cnh", "passaporte"];
  if (side === "front" && known.includes(detected) && expected && detected !== expected) {
    return json({
      ok: false,
      detected,
      reason: `Isso parece um(a) ${TYPE_NAMES[detected]}, mas você escolheu ${expectedName}. Tire a foto do documento certo ou troque o tipo.`,
    });
  }

  return json({ ok: true, detected });
});
