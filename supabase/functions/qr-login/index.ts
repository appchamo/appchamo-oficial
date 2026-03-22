/**
 * Edge Function: qr-login
 *
 * POST /qr-login/generate  → gera token de sessão QR (web chama)
 * POST /qr-login/scan      → app autentica: envia token + access/refresh tokens do usuário
 * GET  /qr-login/status/:token → web faz polling para saber se foi escaneado
 */

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const url = new URL(req.url);
  const path = url.pathname.replace(/\/qr-login\/?/, "").replace(/^\//, "");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // ── Limpa sessões expiradas em background ─────────────────────────────────
  supabase.from("qr_login_sessions")
    .delete()
    .lt("expires_at", new Date().toISOString())
    .then(() => {});

  // ── POST /generate ────────────────────────────────────────────────────────
  if (req.method === "POST" && path === "generate") {
    const token = randomToken();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const { error } = await supabase.from("qr_login_sessions").insert({
      token,
      status: "pending",
      expires_at: expiresAt,
    });

    if (error) return json({ error: "Erro ao gerar QR" }, 500);
    return json({ token, expires_at: expiresAt });
  }

  // ── POST /scan ────────────────────────────────────────────────────────────
  if (req.method === "POST" && path === "scan") {
    // Requer que o app esteja autenticado
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autorizado" }, 401);

    // Verifica o usuário do app via seu JWT
    const appSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userErr } = await appSupabase.auth.getUser();
    if (userErr || !user) return json({ error: "Usuário inválido" }, 401);

    let body: { token: string; access_token: string; refresh_token: string };
    try { body = await req.json(); } catch { return json({ error: "Body inválido" }, 400); }

    if (!body.token || !body.access_token || !body.refresh_token) {
      return json({ error: "token, access_token e refresh_token são obrigatórios" }, 400);
    }

    // Verifica que a sessão existe e está pendente
    const { data: session, error: sessionErr } = await supabase
      .from("qr_login_sessions")
      .select("id, status, expires_at")
      .eq("token", body.token)
      .single();

    if (sessionErr || !session) return json({ error: "QR Code inválido" }, 404);
    if (session.status !== "pending") return json({ error: "QR Code já utilizado" }, 409);
    if (new Date(session.expires_at) < new Date()) {
      await supabase.from("qr_login_sessions").update({ status: "expired" }).eq("id", session.id);
      return json({ error: "QR Code expirado" }, 410);
    }

    // Marca como completada com os tokens do usuário (ficam ~segundos no DB)
    const { error: updateErr } = await supabase
      .from("qr_login_sessions")
      .update({
        status: "completed",
        user_id: user.id,
        access_token: body.access_token,
        refresh_token: body.refresh_token,
      })
      .eq("id", session.id);

    if (updateErr) return json({ error: "Erro ao autenticar" }, 500);
    return json({ ok: true, message: "Login web autorizado com sucesso!" });
  }

  // ── GET /status/:token ────────────────────────────────────────────────────
  if (req.method === "GET" && path.startsWith("status/")) {
    const token = path.replace("status/", "");
    if (!token) return json({ error: "Token obrigatório" }, 400);

    const { data: session, error } = await supabase
      .from("qr_login_sessions")
      .select("status, access_token, refresh_token, expires_at")
      .eq("token", token)
      .single();

    if (error || !session) return json({ error: "Sessão não encontrada" }, 404);

    // Verifica expiração
    if (session.status === "pending" && new Date(session.expires_at) < new Date()) {
      await supabase.from("qr_login_sessions").update({ status: "expired" }).eq("token", token);
      return json({ status: "expired" });
    }

    if (session.status === "completed") {
      const tokens = {
        status: "completed",
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      };
      // Remove imediatamente do banco após entrega (tokens não ficam armazenados)
      await supabase.from("qr_login_sessions").delete().eq("token", token);
      return json(tokens);
    }

    return json({ status: session.status, expires_at: session.expires_at });
  }

  return json({ error: "Rota não encontrada" }, 404);
});
