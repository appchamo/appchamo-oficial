import { supabase } from "@/integrations/supabase/client";

export type StartOpenRequestChatResult =
  | { ok: true; serviceRequestId: string }
  | { ok: false; message: string };

/**
 * Cliente inicia chat com um profissional a partir de um pedido aberto;
 * opcionalmente marca o pedido como atendido (`filled`) para não receber novos interesses.
 */
export async function startClientChatFromOpenRequest(params: {
  clientUserId: string;
  professionalRowId: string;
  openRequestId: string;
  openRequestDescription: string;
  markFilled: boolean;
}): Promise<StartOpenRequestChatResult> {
  // Dedup: se já existe uma conversa ativa com este profissional, reaproveita (evita chat duplicado
  // quando o cliente conversa com vários interessados e volta a clicar no mesmo).
  const { data: existingReq } = await supabase
    .from("service_requests")
    .select("id, status")
    .eq("client_id", params.clientUserId)
    .eq("professional_id", params.professionalRowId)
    .in("status", ["pending", "accepted"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if ((existingReq as { id?: string } | null)?.id) {
    return { ok: true, serviceRequestId: (existingReq as { id: string }).id };
  }

  const desc = `(Pedido aberto)\n\n${params.openRequestDescription.trim()}`;
  const { data: req, error: reqError } = await supabase
    .from("service_requests")
    .insert({
      client_id: params.clientUserId,
      professional_id: params.professionalRowId,
      description: desc,
    })
    .select()
    .single();

  if (reqError || !req) {
    return { ok: false, message: reqError?.message ?? "Não foi possível abrir o chat." };
  }

  const requestId = req.id as string;
  const protocol = (req as { protocol?: string | null }).protocol;
  if (protocol) {
    await supabase.from("chat_messages").insert({
      request_id: requestId,
      sender_id: params.clientUserId,
      content: `📋 PROTOCOLO: ${protocol}`,
    });
  }

  await supabase.from("chat_messages").insert({
    request_id: requestId,
    sender_id: params.clientUserId,
    content:
      "Olá! Você manifestou interesse no meu pedido aberto e quero conversar por aqui para combinarmos.",
  });

  const { data: proRecord } = await supabase
    .from("professionals")
    .select("user_id")
    .eq("id", params.professionalRowId)
    .maybeSingle();
  const { data: clientPub } = await supabase
    .from("profiles_public" as never)
    .select("avatar_url")
    .eq("user_id", params.clientUserId)
    .maybeSingle();

  const proUid = (proRecord as { user_id?: string } | null)?.user_id;
  if (proUid) {
    await supabase.from("notifications").insert({
      user_id: proUid,
      title: "Cliente quer conversar 💬",
      message: "Você manifestou interesse em um pedido aberto e o cliente iniciou o chat.",
      type: "service_request",
      link: `/messages/${requestId}`,
      image_url: (clientPub as { avatar_url?: string | null } | null)?.avatar_url ?? null,
    } as never);
  }

  if (params.markFilled) {
    await supabase
      .from("open_service_requests")
      .update({ status: "filled" })
      .eq("id", params.openRequestId)
      .eq("client_id", params.clientUserId);
  }

  try {
    window.dispatchEvent(new CustomEvent("chamo-open-requests-changed"));
  } catch {
    /* ignore */
  }

  return { ok: true, serviceRequestId: requestId };
}
