// Webhook de ENTRADA do WhatsApp (Cloud API). Trata:
//  1) STATUS das mensagens enviadas (sent/delivered/read/failed) -> atualiza public.wa_messages.
//  2) OPT-OUT/OPT-IN: se a pessoa responder PARAR/SAIR/STOP/CANCELAR -> desliga
//     whatsapp_notifications_enabled e confirma. VOLTAR/ATIVAR/SIM -> religa.
// - GET: verificação do webhook (hub.challenge) com WA_VERIFY_TOKEN.
// Secrets: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WA_VERIFY_TOKEN (opcional; default abaixo).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GRAPH_VERSION = "v21.0";
const VERIFY_TOKEN = (Deno.env.get("WA_VERIFY_TOKEN") || "chamo-wa-2026").trim();

const STOP_WORDS = new Set(["parar", "sair", "stop", "cancelar", "descadastrar", "pare"]);
const START_WORDS = new Set(["voltar", "ativar", "sim", "start", "retornar"]);

function norm(s: string): string {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

function tsToIso(t: unknown): string {
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : new Date().toISOString();
}

async function sendText(to: string, bodyText: string) {
  const token = (Deno.env.get("WHATSAPP_TOKEN") || "").trim();
  const phoneId = (Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "").trim();
  if (!token || !phoneId) return;
  try {
    await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: bodyText } }),
    });
  } catch (_e) { /* best-effort */ }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // 1) Verificação (GET)
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("ok", { status: 200 });

  let payload: any = {};
  try { payload = await req.json(); } catch { /* ignore */ }

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const entries = Array.isArray(payload?.entry) ? payload.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const ch of changes) {
        const value = ch?.value || {};

        // ── 1) STATUS de mensagens enviadas → atualiza wa_messages ──
        const statuses = Array.isArray(value.statuses) ? value.statuses : [];
        for (const st of statuses) {
          const waId = String(st?.id || "");
          const status = String(st?.status || "");
          if (!waId || !status) continue;
          const iso = tsToIso(st?.timestamp);
          const patch: Record<string, unknown> = { status };
          if (status === "sent") patch.sent_at = iso;
          else if (status === "delivered") patch.delivered_at = iso;
          else if (status === "read") patch.read_at = iso;
          else if (status === "failed") {
            patch.failed_at = iso;
            try { patch.error = JSON.stringify(st?.errors ?? st ?? null); } catch { patch.error = "failed"; }
          }
          try { await admin.from("wa_messages").update(patch).eq("wa_id", waId); } catch (_e) { /* ignore */ }
        }

        // ── 2) Mensagens recebidas → opt-out/opt-in ──
        const msgs = Array.isArray(value.messages) ? value.messages : [];
        for (const m of msgs) {
          if (m?.type !== "text") continue;
          const from = String(m?.from || "").replace(/\D/g, "");
          const text = norm(m?.text?.body || "");
          if (!from || !text) continue;

          const wantsStop = STOP_WORDS.has(text);
          const wantsStart = START_WORDS.has(text);
          if (!wantsStop && !wantsStart) continue;

          // Casa o telefone (from = 55DDDNNNNNNNN) com profiles.phone (formato variável): usa os últimos 8 dígitos.
          const last8 = from.slice(-8);
          const { data: rows } = await admin
            .from("profiles")
            .select("user_id, phone")
            .ilike("phone", `%${last8}%`)
            .limit(10);
          const ids = (rows || []).map((r: any) => r.user_id).filter(Boolean);
          if (ids.length) {
            await admin.from("profiles")
              .update({ whatsapp_notifications_enabled: !wantsStop })
              .in("user_id", ids);
          }

          if (wantsStop) {
            await sendText(from, "Pronto! Você não vai mais receber mensagens do Chamô por aqui. 💚 Se mudar de ideia, responda VOLTAR ou reative nas Preferências do app.");
          } else {
            await sendText(from, "Feito! Você voltou a receber as mensagens do Chamô por aqui. 💚");
          }
        }
      }
    }
  } catch (e) {
    console.error("[whatsapp-webhook] erro:", (e as Error)?.message);
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
