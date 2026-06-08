/**
 * Edge Function: sponsor-checkin
 *
 * Validação de cliente no caixa do patrocinador (QR impresso no balcão).
 *
 * POST  { action: "scan", token, consent? }   → cliente autenticado valida no caixa
 * POST  { action: "list", limit? }            → patrocinador lista check-ins recentes (CPF mascarado)
 *
 * Auth: header Authorization: Bearer <jwt do usuário> (anexado pelo supabase-js invoke).
 */

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function hasApiKeyHeader(req: Request): boolean {
  return Boolean((req.headers.get("apikey") ?? "").trim());
}

/** Extrai o UUID do token, aceitando token puro ou a URL do QR (…/c/<uuid>). */
function extractToken(raw: string): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const m = s.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return m ? m[0].toLowerCase() : null;
}

/** Mostra só os 4 últimos dígitos do CPF, mascarando o resto: •••.•••.•89-00 */
function maskCpfLast4(cpf: string | null): string | null {
  if (!cpf) return null;
  const d = cpf.replace(/\D/g, "");
  if (d.length < 4) return "•••.•••.•••-••";
  const m = "•••••••" + d.slice(-4); // 7 mascarados + 4 visíveis
  return `${m.slice(0, 3)}.${m.slice(3, 6)}.${m.slice(6, 9)}-${m.slice(9, 11)}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método não suportado" }, 405);

  if (!hasApiKeyHeader(req)) {
    return json({ error: "Cabeçalho apikey ausente. Atualize o app.", code: 401 }, 401);
  }

  const authHeader = (req.headers.get("Authorization") ?? "").trim();
  const jwt = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  if (!jwt) return json({ error: "Não autorizado" }, 401);

  let body: { action?: string; token?: string; consent?: boolean; limit?: number };
  try { body = await req.json(); } catch { return json({ error: "Body inválido" }, 400); }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const appSupabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
  );

  const { data: { user }, error: userErr } = await appSupabase.auth.getUser(jwt);
  if (userErr || !user) {
    return json({ error: "Sessão expirada. Faça login novamente." }, 401);
  }

  // ── LISTA (patrocinador) ───────────────────────────────────────────────────
  if (body.action === "list") {
    const { data: sponsor } = await admin
      .from("sponsors")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!sponsor) return json({ error: "Patrocinador não encontrado." }, 403);

    const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 100);
    const { data: rows, error: listErr } = await admin
      .from("sponsor_checkins")
      .select("id, created_at, client_user_id")
      .eq("sponsor_id", sponsor.id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (listErr) return json({ error: "Erro ao carregar check-ins." }, 500);

    const ids = [...new Set((rows ?? []).map((r) => r.client_user_id))];
    const profilesById: Record<string, { full_name: string; avatar_url: string | null; cpf: string | null; birth_date: string | null }> = {};
    if (ids.length) {
      const { data: profs } = await admin
        .from("profiles")
        .select("user_id, full_name, avatar_url, cpf, birth_date")
        .in("user_id", ids);
      for (const p of profs ?? []) {
        profilesById[p.user_id] = {
          full_name: p.full_name,
          avatar_url: p.avatar_url,
          cpf: p.cpf,
          birth_date: p.birth_date,
        };
      }
    }

    const checkins = (rows ?? []).map((r) => {
      const p = profilesById[r.client_user_id];
      return {
        id: r.id,
        created_at: r.created_at,
        name: p?.full_name ?? "Cliente",
        avatar_url: p?.avatar_url ?? null,
        cpf_masked: maskCpfLast4(p?.cpf ?? null),
        birth_date: p?.birth_date ?? null,
      };
    });

    return json({ ok: true, checkins });
  }

  // ── SCAN (cliente valida no caixa) ─────────────────────────────────────────
  if (body.action === "scan") {
    const token = extractToken(body.token ?? "");
    if (!token) return json({ error: "QR Code inválido." }, 400);

    const { data: sponsor } = await admin
      .from("sponsors")
      .select("id, name, user_id, active")
      .eq("checkin_token", token)
      .maybeSingle();
    if (!sponsor) return json({ error: "QR Code inválido ou expirado." }, 404);
    if (!sponsor.active) return json({ error: "Este estabelecimento está inativo no momento." }, 409);

    // Perfil do cliente
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, checkin_consent_at")
      .eq("user_id", user.id)
      .maybeSingle();

    const clientName = (profile?.full_name || "Cliente").trim();

    // Consentimento LGPD na primeira validação
    if (!profile?.checkin_consent_at && body.consent !== true) {
      return json({ ok: false, needs_consent: true, sponsor_name: sponsor.name });
    }
    if (!profile?.checkin_consent_at && body.consent === true) {
      await admin.from("profiles")
        .update({ checkin_consent_at: new Date().toISOString() })
        .eq("user_id", user.id);
    }

    // Grava o check-in
    const { error: insErr } = await admin.from("sponsor_checkins").insert({
      sponsor_id: sponsor.id,
      client_user_id: user.id,
    });
    if (insErr) return json({ error: "Não foi possível registrar a validação." }, 500);

    // Notifica o patrocinador (push dispara automaticamente via webhook em notifications)
    if (sponsor.user_id) {
      const hora = new Date().toLocaleTimeString("pt-BR", {
        hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
      });
      await admin.from("notifications").insert({
        user_id: sponsor.user_id,
        title: `Cliente ${clientName} autenticado`,
        message: `Cliente validado no caixa às ${hora}. Toque para ver os dados.`,
        type: "info",
        link: "/sponsor/dashboard?checkins=1",
        read: false,
      });
    }

    return json({ ok: true, sponsor_name: sponsor.name });
  }

  return json({ error: "Ação inválida." }, 400);
});
