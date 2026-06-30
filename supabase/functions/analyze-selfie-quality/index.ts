// Checagem de QUALIDADE da selfie e do documento no cadastro (via Claude).
// NÃO faz reconhecimento facial, identificação nem comparação de pessoas —
// apenas avalia se a imagem está nítida, com rosto visível e documento legível.
// Resultado é gravado em profiles.selfie_check_* e exibido no admin (não bloqueia o cadastro).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// Separa "data:image/jpeg;base64,XXXX" em { media_type, data }.
function parseImage(input: string): { media_type: string; data: string } | null {
  if (!input) return null;
  const m = input.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (m) return { media_type: m[1], data: m[2] };
  // base64 cru (assume jpeg)
  return { media_type: "image/jpeg", data: input.replace(/\s/g, "") };
}

const PROMPT = `Você é um verificador de QUALIDADE de imagem para um cadastro de app. \
Você NÃO identifica pessoas, NÃO compara rostos e NÃO verifica identidade. \
Avalie SOMENTE a qualidade das imagens enviadas.

Imagem 1 = SELFIE. Imagem 2 (se houver) = DOCUMENTO com foto.

Avalie:
- selfie: existe um rosto humano claramente visível? está nítida (não borrada), bem iluminada (não muito escura), o rosto não está cortado nem coberto, e NÃO parece foto de uma tela/print?
- documento: há um documento visível e o texto está legível?

Responda APENAS um JSON válido, sem texto extra, no formato:
{"selfie":{"has_face":true,"clear":true,"issues":[]},"document":{"visible":true,"legible":true,"issues":[]},"recommendation":"approve","reason":"curta explicação em português"}
recommendation deve ser "approve" (tudo ok), "review" (algo duvidoso) ou "reject" (claramente ruim/sem rosto/ilegível). \
issues: lista curta de problemas em português (ex.: "selfie escura", "rosto não visível", "documento ilegível").`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "metodo" }, 405);

  const apiKey = (Deno.env.get("ANTHROPIC_API_KEY") || "").trim();
  if (!apiKey) return json({ error: "anthropic_not_configured" }, 500);

  // Identifica o usuário pelo JWT (para gravar o resultado no perfil dele).
  const jwt = (req.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
  let userId: string | null = null;
  if (jwt) {
    const appClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data } = await appClient.auth.getUser(jwt);
    userId = data.user?.id ?? null;
  }
  const body = await req.json().catch(() => ({}));
  const targetUserId = userId || (body.user_id ? String(body.user_id) : null);
  if (!targetUserId) return json({ error: "sem_usuario" }, 401);

  const selfie = parseImage(String(body.selfie || ""));
  if (!selfie) return json({ error: "sem_selfie" }, 400);
  const doc = body.document ? parseImage(String(body.document)) : null;

  const content: unknown[] = [
    { type: "image", source: { type: "base64", media_type: selfie.media_type, data: selfie.data } },
  ];
  if (doc) content.push({ type: "image", source: { type: "base64", media_type: doc.media_type, data: doc.data } });
  content.push({ type: "text", text: PROMPT });

  let verdict = { recommendation: "review", reason: "Não foi possível analisar.", selfie: {}, document: {} } as any;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 400,
        messages: [{ role: "user", content }],
      }),
    });
    const data = await r.json().catch(() => ({}));
    const text = (data?.content?.[0]?.text || "").trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) verdict = JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error("anthropic error", String((e as Error)?.message || e));
  }

  const rec = ["approve", "review", "reject"].includes(verdict.recommendation) ? verdict.recommendation : "review";
  const status = rec === "approve" ? "ok" : rec; // 'ok' | 'review' | 'reject'
  const issues = [
    ...(Array.isArray(verdict?.selfie?.issues) ? verdict.selfie.issues : []),
    ...(Array.isArray(verdict?.document?.issues) ? verdict.document.issues : []),
  ];
  const reason = String(verdict.reason || (issues.length ? issues.join("; ") : "")).slice(0, 500);

  // Grava no perfil (service role) — não bloqueia o cadastro.
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const patch: Record<string, unknown> = {
      selfie_check_status: status,
      selfie_check_reason: reason || null,
      selfie_check_at: new Date().toISOString(),
    };
    if (body.selfie_url) patch.selfie_url = String(body.selfie_url);
    await admin.from("profiles").update(patch).eq("user_id", targetUserId);
  } catch (e) {
    console.error("save error", String((e as Error)?.message || e));
  }

  return json({ ok: true, status, reason, issues });
});
