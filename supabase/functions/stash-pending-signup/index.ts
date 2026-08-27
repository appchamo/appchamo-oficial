import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", ...cors } });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Guarda o cadastro por e-mail de forma duravel, pra concluir apos a confirmacao
// em qualquer aparelho. Chamado logo apos supabase.auth.signUp (sem sessao ainda),
// entao verify_jwt=false. Protecao contra abuso: so aceita se o userId existir como
// usuario recem-criado e AINDA NAO confirmado (email_confirmed_at nulo).
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { userId, payload } = await req.json();
    if (!userId || !UUID_RE.test(String(userId))) {
      return json({ error: "userId invalido" }, 400);
    }
    if (!payload || typeof payload !== "object") {
      return json({ error: "payload ausente" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: authUser, error: authErr } = await supabase.auth.admin.getUserById(String(userId));
    if (authErr || !authUser?.user) {
      return json({ error: "usuario nao encontrado" }, 404);
    }
    // So permite guardar enquanto o e-mail nao foi confirmado (janela do cadastro).
    if (authUser.user.email_confirmed_at) {
      return json({ ok: true, skipped: "ja_confirmado" });
    }

    const { error: upErr } = await supabase
      .from("pending_signups")
      .upsert(
        { user_id: String(userId), payload, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
    if (upErr) {
      console.error("stash-pending-signup upsert:", upErr);
      return json({ error: "falha ao guardar" }, 500);
    }

    return json({ ok: true });
  } catch (e) {
    console.error("stash-pending-signup:", e);
    return json({ error: "erro interno", message: (e as Error).message }, 500);
  }
});
