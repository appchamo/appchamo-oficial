// Dispara o template WhatsApp "pedido_novo_regiao" para os profissionais que
// receberam um PEDIDO aberto (open_service_requests). Chamado pela trigger do banco
// (pg_net) com header x-hook-secret. Respeita opt-out (whatsapp_notifications_enabled)
// e loga cada envio em wa_messages.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GRAPH_VERSION = "v21.0";
const TEMPLATE = "pedido_novo_regiao";

function toMsisdn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) return d;
  if (d.length === 12 && d.startsWith("55")) return d;
  if (d.length === 11 || d.length === 10) return "55" + d;
  return null;
}

Deno.serve(async (req) => {
  try {
    const hookSecret = (Deno.env.get("EMAIL_HOOK_SECRET") || "").trim();
    if (!hookSecret || (req.headers.get("x-hook-secret") || "").trim() !== hookSecret) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
    }
    const token = (Deno.env.get("WHATSAPP_TOKEN") || "").trim();
    const phoneId = (Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "").trim();
    if (!token || !phoneId) {
      return new Response(JSON.stringify({ error: "whatsapp_not_configured" }), { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const requestId = String(body.request_id || "").trim();
    if (!requestId) {
      return new Response(JSON.stringify({ error: "missing_request_id" }), { status: 400 });
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Pedido + categoria
    const { data: reqRow } = await admin
      .from("open_service_requests")
      .select("id, client_id, category_id, city, state, status")
      .eq("id", requestId)
      .maybeSingle();
    if (!reqRow) return new Response(JSON.stringify({ error: "request_not_found" }), { status: 404 });

    const { data: cat } = await admin.from("categories").select("name").eq("id", (reqRow as any).category_id).maybeSingle();
    const categoryName = String((cat as any)?.name || "um serviço");
    const city = String((reqRow as any).city || "");

    // Destinatários (user_ids distintos), exceto o próprio cliente
    const { data: recs } = await admin
      .from("open_request_recipients")
      .select("user_id")
      .eq("open_request_id", requestId)
      .limit(20000);
    const userIds = Array.from(new Set(((recs as any[]) || [])
      .map((r) => r.user_id)
      .filter((u): u is string => Boolean(u) && u !== (reqRow as any).client_id)));
    if (userIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: "sem_destinatarios" }), { status: 200 });
    }

    // Perfis (telefone, nome, opt-in)
    const { data: profs } = await admin
      .from("profiles")
      .select("user_id, full_name, phone, whatsapp_notifications_enabled")
      .in("user_id", userIds)
      .limit(20000);

    const targets = ((profs as any[]) || [])
      .filter((p) => p.whatsapp_notifications_enabled !== false)
      .map((p) => ({ user_id: p.user_id as string, name: String(p.full_name || "").split(" ")[0] || "profissional", to: toMsisdn(p.phone) }))
      .filter((t) => Boolean(t.to));

    const work = (async () => {
      const logRows: Record<string, unknown>[] = [];
      for (const t of targets) {
        const params = [t.name, city, categoryName];
        const payload = {
          messaging_product: "whatsapp",
          to: t.to,
          type: "template",
          template: {
            name: TEMPLATE,
            language: { code: "pt_BR" },
            components: [{ type: "body", parameters: params.map((x) => ({ type: "text", text: x })) }],
          },
        };
        try {
          const r = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const j = await r.json().catch(() => ({}));
          const waId = (j as any)?.messages?.[0]?.id ?? null;
          logRows.push({
            wa_id: waId,
            to_phone: t.to,
            user_id: t.user_id,
            template: TEMPLATE,
            body: `Oi ${t.name}! Um cliente em ${city} está procurando ${categoryName} agora no Chamô.`,
            status: r.ok ? "sent" : "error",
            payload: j,
          });
        } catch (e) {
          logRows.push({ wa_id: null, to_phone: t.to, user_id: t.user_id, template: TEMPLATE, body: null, status: "error", payload: { error: String(e) } });
        }
      }
      if (logRows.length) { try { await admin.from("wa_messages").insert(logRows); } catch (_e) { /* log não-crítico */ } }
    })();

    try { (globalThis as any).EdgeRuntime?.waitUntil?.(work); } catch { /* ignore */ }
    if (!(globalThis as any).EdgeRuntime?.waitUntil) { await work; }

    return new Response(JSON.stringify({ ok: true, queued: targets.length }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error)?.message }), { status: 200 });
  }
});
