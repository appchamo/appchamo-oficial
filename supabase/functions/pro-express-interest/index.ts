import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "jsr:@panva/jose@6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Profissional demonstra interesse num pedido aberto:
 * - cria (ou reaproveita) a chamada (service_requests) com status ACEITA;
 * - envia a mensagem automática do profissional no chat;
 * - registra o interesse (best-effort);
 * - notifica o cliente (o insert em notifications dispara push/email/WhatsApp por trigger/webhook).
 *
 * Roda com service role porque criar a service_request de um cliente exige bypass de RLS.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("PROJECT_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const openRequestId = String((body as { openRequestId?: string }).openRequestId ?? "").trim();
    if (!openRequestId) return json({ error: "openRequestId ausente." }, 400);

    // --- Autenticação (verify_jwt desligado no gateway por causa do ES256) ---
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "")?.trim();
    if (!token) return json({ error: "Token ausente." }, 401);
    let proUserId: string;
    try {
      const JWKS = jose.createRemoteJWKSet(new URL(supabaseUrl + "/auth/v1/.well-known/jwks.json"));
      const { payload } = await jose.jwtVerify(token, JWKS, { issuer: supabaseUrl + "/auth/v1" });
      proUserId = String(payload.sub ?? "");
      if (!proUserId) return json({ error: "Token inválido." }, 401);
    } catch (_e) {
      return json({ error: "Token inválido ou expirado." }, 401);
    }

    // --- Profissional do usuário ---
    const { data: proRow } = await supabase
      .from("professionals")
      .select("id, profile_status, active")
      .eq("user_id", proUserId)
      .maybeSingle();
    const professionalRowId = (proRow as { id?: string } | null)?.id;
    if (!professionalRowId) return json({ error: "Cadastro profissional não encontrado." }, 400);
    if ((proRow as { profile_status?: string }).profile_status !== "approved") {
      return json({ error: "Seu cadastro profissional ainda não foi aprovado." }, 403);
    }
    if ((proRow as { active?: boolean }).active === false) {
      return json({ error: "Seu perfil profissional está inativo." }, 403);
    }

    // --- Pedido aberto ---
    const { data: openReq } = await supabase
      .from("open_service_requests")
      .select("id, client_id, description")
      .eq("id", openRequestId)
      .maybeSingle();
    const clientId = (openReq as { client_id?: string } | null)?.client_id;
    const openDesc = String((openReq as { description?: string } | null)?.description ?? "").trim();
    if (!clientId) return json({ error: "Este pedido não está mais disponível." }, 404);
    if (clientId === proUserId) return json({ error: "Você não pode responder ao próprio pedido." }, 400);

    // --- Dedup: chamada existente (pendente/aceita) com este cliente ---
    let serviceRequestId: string | null = null;
    const { data: existing } = await supabase
      .from("service_requests")
      .select("id")
      .eq("client_id", clientId)
      .eq("professional_id", professionalRowId)
      .in("status", ["pending", "accepted"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    serviceRequestId = (existing as { id?: string } | null)?.id ?? null;

    if (serviceRequestId) {
      await supabase.from("service_requests").update({ status: "accepted" }).eq("id", serviceRequestId);
    } else {
      const { data: created, error: crErr } = await supabase
        .from("service_requests")
        .insert({
          client_id: clientId,
          professional_id: professionalRowId,
          description: `(Pedido aberto)\n\n${openDesc}`,
          status: "accepted",
        })
        .select("id, protocol")
        .single();
      if (crErr || !created) return json({ error: crErr?.message ?? "Não foi possível abrir a conversa." }, 500);
      serviceRequestId = (created as { id: string }).id;
      const protocol = (created as { protocol?: string | null }).protocol;
      if (protocol) {
        await supabase.from("chat_messages").insert({
          request_id: serviceRequestId,
          sender_id: proUserId,
          content: `📋 PROTOCOLO: ${protocol}`,
        });
      }
    }

    // --- Mensagem automática do profissional ---
    await supabase.from("chat_messages").insert({
      request_id: serviceRequestId,
      sender_id: proUserId,
      content: "Tenho interesse no seu serviço.",
    });

    // --- Registra o interesse (best-effort; ignora duplicado/limite) ---
    await supabase
      .from("open_service_request_interests")
      .insert({ open_request_id: openRequestId, professional_id: professionalRowId });

    // --- Notifica o cliente (dispara push + email + WhatsApp por trigger/webhook) ---
    const { data: proProfile } = await supabase
      .from("profiles")
      .select("full_name, avatar_url")
      .eq("user_id", proUserId)
      .maybeSingle();
    const proName = String((proProfile as { full_name?: string } | null)?.full_name ?? "").trim() || "Um profissional";
    const proAvatar = (proProfile as { avatar_url?: string | null } | null)?.avatar_url ?? null;

    await supabase.from("notifications").insert({
      user_id: clientId,
      title: `${proName} tem interesse no seu serviço 💬`,
      message: "Um profissional demonstrou interesse e abriu uma conversa com você. Toque para responder.",
      type: "service_request",
      link: `/messages/${serviceRequestId}`,
      image_url: proAvatar,
    });

    return json({ serviceRequestId });
  } catch (err) {
    console.error("pro-express-interest error:", err);
    return json({ error: (err as Error)?.message ?? String(err) }, 500);
  }
});
