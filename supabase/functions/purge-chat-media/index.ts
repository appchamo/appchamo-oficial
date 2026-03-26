import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type PurgeRow = { attachment_id: string; message_id: string; object_path: string };

/**
 * Remove ficheiros do bucket chat-media e limpa image_urls nas mensagens.
 * Agendar no Supabase (Cron / invoke manual) com:
 *   Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
 */
serve(async (req) => {
  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const auth = req.headers.get("Authorization") ?? "";
    if (!serviceKey || auth !== `Bearer ${serviceKey}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey);

    const { data: rows, error: rpcErr } = await supabase.rpc("get_chat_media_attachments_to_purge");
    if (rpcErr) throw rpcErr;

    const list = (rows ?? []) as PurgeRow[];
    if (list.length === 0) {
      return new Response(JSON.stringify({ ok: true, attachments_removed: 0, messages_touched: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const paths = list.map((r) => r.object_path);
    const messageIds = [...new Set(list.map((r) => r.message_id))];
    const attachmentIds = list.map((r) => r.attachment_id);

    const { error: stErr } = await supabase.storage.from("chat-media").remove(paths);
    if (stErr) console.error("[purge-chat-media] storage.remove:", stErr);

    await supabase.from("chat_media_attachments").delete().in("id", attachmentIds);

    for (const mid of messageIds) {
      const { data: msg } = await supabase.from("chat_messages").select("id, content").eq("id", mid).maybeSingle();
      if (!msg) continue;
      const c = String(msg.content ?? "");
      const nextContent = c.startsWith("📷")
        ? "📷 Foto removida automaticamente (30 dias após o encerramento da chamada)."
        : c;
      await supabase
        .from("chat_messages")
        .update({ image_urls: [], content: nextContent })
        .eq("id", mid);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        attachments_removed: attachmentIds.length,
        messages_touched: messageIds.length,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[purge-chat-media]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
