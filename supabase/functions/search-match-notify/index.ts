/**
 * Casar busca <-> oferta.
 * Quando um profissional novo é aprovado, avisa os usuários que buscaram
 * aquele tipo de serviço e não encontraram ninguém (search_events com 0 resultados).
 * Invocada por cron (x-hook-secret). Dedupe via search_events.notified_at.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const norm = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const hookSecret = (Deno.env.get("EMAIL_HOOK_SECRET") || "").trim();
  if (!hookSecret || (req.headers.get("x-hook-secret") || "").trim() !== hookSecret) return json({ error: "unauthorized" }, 401);

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const now = Date.now();

    // 1) Buscas sem resultado, ainda não notificadas, dos últimos 45 dias, com usuário conhecido.
    const cutoff = new Date(now - 45 * 86400000).toISOString();
    const { data: searches } = await admin
      .from("search_events")
      .select("id, term, term_norm, user_id, city, created_at")
      .eq("results_count", 0)
      .is("notified_at", null)
      .not("user_id", "is", null)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(500);
    if (!searches || !searches.length) return json({ ok: true, matched: 0, reason: "sem buscas pendentes" });

    // 2) Profissionais aprovados recentemente (últimos 7 dias) e disponíveis.
    const proCutoff = new Date(now - 7 * 86400000).toISOString();
    const { data: pros } = await admin
      .from("professionals")
      .select("id, user_id, category_id, profession_id, categories(name), professions:profession_id(name)")
      .eq("active", true)
      .eq("profile_status", "approved")
      .neq("availability_status", "unavailable")
      .gte("created_at", proCutoff)
      .limit(500);
    if (!pros || !pros.length) return json({ ok: true, matched: 0, reason: "sem pros novos" });

    // Nomes + cidade dos pros
    const proUserIds = pros.map((p: any) => p.user_id);
    const { data: proProfiles } = await admin.from("profiles").select("user_id, full_name, address_city").in("user_id", proUserIds);
    const profMap = new Map((proProfiles || []).map((p: any) => [p.user_id, p]));

    // Monta "haystack" de cada pro (categoria + profissão + nome) e cidade normalizada.
    const proIndex = pros.map((p: any) => {
      const pr = profMap.get(p.user_id) || {};
      const haystack = norm(`${p.categories?.name || ""} ${p.professions?.name || ""} ${pr.full_name || ""}`);
      return { haystack, city: norm(pr.city || pr.address_city || ""), category: p.categories?.name || "profissional" };
    });

    let matched = 0;
    const idsToStamp: string[] = [];

    for (const s of searches) {
      const t = norm(s.term_norm || s.term || "");
      if (t.length < 4) continue;
      const sCity = norm(s.city || "");
      const hit = proIndex.find((p) => p.haystack.includes(t) && (!sCity || !p.city || p.city === sCity));
      if (!hit) continue;

      // Não notifica usuário bloqueado.
      const { data: blk } = await admin.from("profiles").select("is_blocked").eq("user_id", s.user_id).maybeSingle();
      if ((blk as any)?.is_blocked) { idsToStamp.push(s.id); continue; }

      await admin.from("notifications").insert({
        user_id: s.user_id,
        title: "Achamos um profissional pra você! 🎯",
        message: `Você procurou "${s.term}" e não tinha ninguém. Agora tem ${hit.category} disponível. Dá uma olhada!`,
        type: "info",
        link: `/search?q=${encodeURIComponent(s.term || "")}`,
        metadata: { source: "search_match" },
      });
      idsToStamp.push(s.id);
      matched++;
    }

    if (idsToStamp.length) {
      await admin.from("search_events").update({ notified_at: new Date().toISOString() }).in("id", idsToStamp);
    }
    return json({ ok: true, matched, stamped: idsToStamp.length });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
