import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ===============================
// 🔁 Ambiente Asaas 
// ===============================
const ASAAS_ENV = Deno.env.get("ASAAS_ENV") ?? "sandbox";
const ASAAS_BASE_URL = ASAAS_ENV === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY");

const UPLOADS_BUCKET = "uploads";

/**
 * professional_documents.file_url pode ser:
 * - path relativo: "documents/uuid/arquivo.pdf" (BecomeProfessional / upload-document)
 * - URL pública: "https://....supabase.co/storage/v1/object/public/uploads/documents/..." (complete-signup antigo)
 * createSignedUrl só aceita o path dentro do bucket.
 */
function normalizeUploadsStoragePath(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) {
    let p = s.replace(/^\/+/, "");
    if (p.startsWith(`${UPLOADS_BUCKET}/`)) p = p.slice(UPLOADS_BUCKET.length + 1);
    return p;
  }
  try {
    const u = new URL(s);
    const pathname = u.pathname;
    const pub = `/object/public/${UPLOADS_BUCKET}/`;
    const sig = `/object/sign/${UPLOADS_BUCKET}/`;
    let i = pathname.indexOf(pub);
    if (i !== -1) {
      return decodeURIComponent(pathname.slice(i + pub.length).replace(/^\/+/, ""));
    }
    i = pathname.indexOf(sig);
    if (i !== -1) {
      return decodeURIComponent(pathname.slice(i + sig.length).replace(/^\/+/, ""));
    }
    // Alguns proxies / formatos alternativos
    const m = pathname.match(/\/(?:object\/(?:public|sign)\/)?uploads\/(.+)$/);
    if (m) return decodeURIComponent(m[1]);
  } catch {
    /* ignore */
  }
  const loose = s.match(/\/object\/(?:public|sign)\/uploads\/(.+?)(?:\?|$)/);
  if (loose) return decodeURIComponent(loose[1]);
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const { action } = body;

    /**
     * Identifica o utilizador pelo JWT do pedido.
     * Usar um cliente com `global.headers.Authorization` + `getUser()` (padrão Supabase Edge), com `apikey` público
     * ou, em último caso, service_role. `getUser(jwt)` só no cliente "admin" sem override do header falhava em alguns setups.
     */
    const getCaller = async () => {
      const authHeader = req.headers.get("Authorization")?.trim();
      if (!authHeader) {
        console.warn("[getCaller] sem header Authorization");
        throw new Error("Unauthorized");
      }
      const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
      if (!jwt) throw new Error("Unauthorized");

      const apiKeyForAuth =
        Deno.env.get("SUPABASE_ANON_KEY") ||
        Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ||
        serviceRoleKey;

      const authClient = createClient(supabaseUrl, apiKeyForAuth, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
        global: {
          headers: { Authorization: authHeader },
        },
      });

      const { data: { user: caller }, error: userErr } = await authClient.auth.getUser();
      if (!userErr && caller) return caller;

      console.warn("[getCaller] authClient.getUser falhou:", userErr?.message ?? "sem user");

      const authBase = supabaseUrl.replace(/\/+$/, "");
      const bearer = /^Bearer\s+/i.test(authHeader) ? authHeader : `Bearer ${jwt}`;
      const verifyRes = await fetch(`${authBase}/auth/v1/user`, {
        headers: {
          Authorization: bearer,
          apikey: apiKeyForAuth,
          "X-Supabase-Api-Version": "2024-01-01",
        },
      });
      if (verifyRes.ok) {
        try {
          const u = await verifyRes.json();
          if (u && typeof u.id === "string") return u;
        } catch {
          /* ignore */
        }
      } else {
        const tb = await verifyRes.text().catch(() => "");
        console.warn("[getCaller] GET auth/v1/user", verifyRes.status, tb.slice(0, 300));
      }

      const { data: { user: fallback }, error: fbErr } = await supabase.auth.getUser(jwt);
      if (!fbErr && fallback) return fallback;

      console.warn("[getCaller] fallback getUser(jwt) falhou:", fbErr?.message ?? "sem user");
      throw new Error("Unauthorized");
    };

    const verifyAdmin = async () => {
      const caller = await getCaller();
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", caller.id);
      const isAdmin = roles?.some((r: any) =>
        ["super_admin", "finance_admin", "support_admin", "sponsor_admin", "moderator"].includes(r.role)
      );
      if (!isAdmin) throw new Error("Forbidden");
      return caller;
    };

    /** Executa delete em qualquer tabela sem lançar exceção; loga warnings para debug. */
    const sd = async (table: string, col: string, val: string | string[]) => {
      try {
        const q = supabase.from(table as any).delete();
        const res = Array.isArray(val)
          ? await (q as any).in(col, val)
          : await (q as any).eq(col, val);
        if (res.error) console.warn(`[del] ${table}.${col}:`, res.error.message);
      } catch (e: any) {
        console.warn(`[del] ${table}.${col} exception:`, e.message);
      }
    };

    // Shared function to cascade-delete a user
    const cascadeDeleteUser = async (user_id: string) => {
      console.log(`[cascadeDeleteUser] Starting deletion for user: ${user_id}`);

      await sd("chat_reports", "reporter_id", user_id);
      await sd("chat_thread_activity", "user_id", user_id);

      // Buscar IDs de profissional
      const { data: pros } = await supabase.from("professionals").select("id").eq("user_id", user_id);
      const proIds = (pros || []).map((p: any) => p.id);
      console.log(`[cascadeDeleteUser] proIds: ${proIds.length}`);

      // Buscar IDs de service_requests
      let reqIds: string[] = [];
      if (proIds.length > 0) {
        const { data: pr } = await supabase.from("service_requests").select("id").in("professional_id", proIds);
        reqIds.push(...(pr || []).map((r: any) => r.id));
      }
      const { data: cr } = await supabase.from("service_requests").select("id").eq("client_id", user_id);
      reqIds.push(...(cr || []).map((r: any) => r.id));
      reqIds = [...new Set(reqIds)];

      // Dados ligados a service_requests
      if (reqIds.length > 0) {
        await sd("chat_thread_activity", "request_id", reqIds);
        await sd("reviews", "request_id", reqIds);
        await sd("chat_messages", "request_id", reqIds);
        await sd("chat_read_status", "request_id", reqIds);
      }

      if (proIds.length > 0) {
        await sd("reviews", "professional_id", proIds);
      }
      await sd("reviews", "client_id", user_id);

      if (proIds.length > 0) {
        // Job applications de vagas do profissional
        const { data: jbs } = await supabase.from("job_postings").select("id").in("professional_id", proIds);
        const jobIds = (jbs || []).map((j: any) => j.id);
        if (jobIds.length > 0) await sd("job_applications", "job_id", jobIds);

        // Agenda
        await sd("agenda_appointments", "professional_id", proIds);
        await sd("agenda_reminder_log", "professional_id", proIds);
        await sd("agenda_services", "professional_id", proIds);
        await sd("agenda_availability_rules", "professional_id", proIds);
        await sd("agenda_availability_blocks", "professional_id", proIds);
        await sd("agenda_atendentes", "professional_id", proIds);

        // Analytics
        await sd("professional_analytics_events", "professional_id", proIds);
        await sd("professional_analytics_counters", "professional_id", proIds);

        // Follows / favorites ligados ao profissional
        await sd("professional_follows", "professional_id", proIds);
        await sd("professional_favorites", "professional_id", proIds);

        // Dados do profissional
        await sd("product_catalog", "professional_id", proIds);
        await sd("professional_documents", "professional_id", proIds);
        await sd("professional_fiscal_data", "professional_id", proIds);
        await sd("job_postings", "professional_id", proIds);
        await sd("service_requests", "professional_id", proIds);
        await sd("transactions", "professional_id", proIds);
      }

      await sd("agenda_appointments", "client_id", user_id);

      // Follows / amizades
      await sd("user_follows", "follower_user_id", user_id);
      await sd("user_follows", "followed_user_id", user_id);
      await sd("professional_follows", "user_id", user_id);
      await sd("professional_favorites", "user_id", user_id);
      await sd("friend_requests", "from_user_id", user_id);
      await sd("friend_requests", "to_user_id", user_id);
      await sd("user_friendships", "user_a", user_id);
      await sd("user_friendships", "user_b", user_id);

      // Comunidade
      await sd("community_comment_reactions", "user_id", user_id);
      await sd("community_comment_reports", "user_id", user_id);
      await sd("community_comment_user_hides", "user_id", user_id);
      await sd("community_post_comments", "user_id", user_id);
      await sd("community_post_reactions", "user_id", user_id);
      await sd("community_post_shares", "user_id", user_id);
      await sd("community_post_reports", "user_id", user_id);
      await sd("community_post_user_hides", "user_id", user_id);
      await sd("community_posts", "author_id", user_id);

      // Restante
      await sd("user_devices", "user_id", user_id);
      await sd("job_applications", "applicant_id", user_id);
      await sd("service_requests", "client_id", user_id);
      await sd("chat_read_status", "user_id", user_id);
      await sd("notifications", "user_id", user_id);
      await sd("coupons", "user_id", user_id);
      await sd("subscriptions", "user_id", user_id);
      await sd("sponsor_clicks", "user_id", user_id);
      await sd("enterprise_upgrade_requests", "user_id", user_id);
      await sd("support_messages", "user_id", user_id);
      await sd("support_messages", "sender_id", user_id);
      await sd("support_read_status", "user_id", user_id);
      await sd("support_read_status", "thread_user_id", user_id);
      await sd("support_tickets", "user_id", user_id);
      await sd("transactions", "client_id", user_id);
      await sd("transactions", "professional_id", user_id);
      await sd("user_roles", "user_id", user_id);

      // SET NULL em sorteios (FK sem CASCADE)
      try { await supabase.from("raffles").update({ winner_user_id: null }).eq("winner_user_id", user_id); } catch (_) {}

      // Dados privados e perfil por último
      await sd("profile_private", "user_id", user_id);
      await sd("professionals", "user_id", user_id);
      await sd("profiles", "user_id", user_id);

      console.log(`[cascadeDeleteUser] All data deleted, signing out auth user`);

      // Encerra sessões ativas (ignora se usuário não tem sessão)
      try { await supabase.auth.admin.signOut(user_id, "global"); } catch (_) {}

      // Remove o usuário do auth — passo crítico
      const { error } = await supabase.auth.admin.deleteUser(user_id);
      if (error) {
        console.error(`[cascadeDeleteUser] Auth deletion error: ${error.message}`);
        throw new Error(`Falha ao remover usuário do auth: ${error.message}`);
      }

      console.log(`[cascadeDeleteUser] User ${user_id} fully deleted`);
    };

    if (action === "create_admin") {
      const caller = await verifyAdmin();
      const { data: callerRole } = await supabase.from("user_roles").select("role").eq("user_id", caller.id).eq("role", "super_admin").single();
      if (!callerRole) throw new Error("Only super_admin can create admins");

      const { email, password, role, full_name } = body;
      if (!email || !password || !role) throw new Error("email, password and role are required");
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { full_name: full_name || "" },
      });
      if (createError) throw createError;
      await supabase.from("user_roles").insert({ user_id: newUser.user.id, role });
      await supabase.from("admin_logs").insert({
        admin_user_id: caller.id, action: "create_admin", target_type: "user", target_id: newUser.user.id,
        details: { email, role },
      });
      return new Response(JSON.stringify({ success: true, userId: newUser.user.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete_user") {
      const caller = await verifyAdmin();
      const { user_id } = body;
      if (!user_id) throw new Error("user_id required");
      if (user_id === caller.id) throw new Error("Cannot delete yourself");

      await cascadeDeleteUser(user_id);

      await supabase.from("admin_logs").insert({
        admin_user_id: caller.id, action: "delete_user", target_type: "user", target_id: user_id,
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete_own_account") {
      const caller = await getCaller();
      await cascadeDeleteUser(caller.id);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ==========================================
    // ✅ AÇÃO: APROVAR ASSINATURA (NOVO)
    // ==========================================
    if (action === "approve_subscription") {
      const caller = await verifyAdmin();
      const { userId } = body;
      
      if (!userId) throw new Error("userId é obrigatório.");

      const { data: subData, error: subError } = await supabase
        .from("subscriptions")
        .select("id, asaas_subscription_id")
        .eq("user_id", userId)
        .maybeSingle();

      if (subError) throw new Error("Erro ao buscar assinatura.");

      if (!subData?.asaas_subscription_id) {
        if (!subData) {
          await supabase.from("subscriptions").insert({ user_id: userId, plan_id: "free", status: "ACTIVE" });
        } else {
          await supabase.from("subscriptions").update({ status: "ACTIVE" }).eq("user_id", userId);
        }
        await supabase.from("admin_logs").insert({
          admin_user_id: caller.id, action: "approve_subscription", target_type: "user", target_id: userId,
          details: { note: "Sem assinatura no Asaas; ativado no app (plano free)." },
        });
        return new Response(JSON.stringify({
          success: true,
          message: "Usuário não tinha assinatura no Asaas. Ativado no app (plano free).",
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (!ASAAS_API_KEY) throw new Error("Chave do Asaas não configurada.");
      const today = new Date().toISOString().split("T")[0];

      const response = await fetch(`${ASAAS_BASE_URL}/subscriptions/${subData.asaas_subscription_id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "access_token": ASAAS_API_KEY,
        },
        body: JSON.stringify({
          nextDueDate: today
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.errors?.[0]?.description || "Erro ao atualizar Asaas");

      await supabase
        .from("subscriptions")
        .update({ status: "ACTIVE" })
        .eq("user_id", userId);
        
      await supabase.from("admin_logs").insert({
        admin_user_id: caller.id, action: "approve_subscription", target_type: "user", target_id: userId,
      });

      return new Response(JSON.stringify({ success: true, message: "Assinatura aprovada e cobrada!" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ==========================================
    // ✅ AÇÃO: FORÇAR APROVAÇÃO (sem Asaas – ex.: CPF errado)
    // ==========================================
    if (action === "force_approve_subscription") {
      const caller = await verifyAdmin();
      const { userId } = body;
      if (!userId) throw new Error("userId é obrigatório.");

      const { data: sub, error: subErr } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      if (subErr) throw new Error("Erro ao buscar assinatura.");

      if (!sub) {
        await supabase.from("subscriptions").insert({ user_id: userId, plan_id: "free", status: "ACTIVE" });
      } else {
        await supabase.from("subscriptions").update({ status: "ACTIVE" }).eq("user_id", userId);
      }

      await supabase.from("admin_logs").insert({
        admin_user_id: caller.id,
        action: "force_approve_subscription",
        target_type: "user",
        target_id: userId,
        details: { note: "Aprovado sem cobrança no Asaas (ex.: CPF inválido)" },
      });

      return new Response(JSON.stringify({ success: true, message: "Assinatura ativada no app (sem Asaas)." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ==========================================
    // ❌ AÇÃO: RECUSAR ASSINATURA (NOVO)
    // ==========================================
    if (action === "reject_subscription") {
      const caller = await verifyAdmin();
      const { userId, reason } = body;
      
      if (!userId) throw new Error("userId é obrigatório.");
      if (!ASAAS_API_KEY) throw new Error("Chave do Asaas não configurada.");

      const { data: subData, error: subError } = await supabase
        .from("subscriptions")
        .select("asaas_subscription_id")
        .eq("user_id", userId)
        .single();

      if (subError || !subData?.asaas_subscription_id) {
        throw new Error("Assinatura não encontrada no banco de dados da Chamô.");
      }

      const response = await fetch(`${ASAAS_BASE_URL}/subscriptions/${subData.asaas_subscription_id}`, {
        method: "DELETE",
        headers: { "access_token": ASAAS_API_KEY },
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.errors?.[0]?.description || "Erro ao cancelar no Asaas");

      await supabase
        .from("subscriptions")
        .update({ status: "CANCELED", plan_id: "free" })
        .eq("user_id", userId);
        
      await supabase.from("admin_logs").insert({
        admin_user_id: caller.id, action: "reject_subscription", target_type: "user", target_id: userId, details: { reason }
      });

      return new Response(JSON.stringify({ success: true, message: "Assinatura cancelada!" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }




    // ==========================================
    // 🪣 AÇÃO: CRIAR BUCKET SPONSOR-STORIES
    // ==========================================
    if (action === "create_sponsor_bucket") {
      await verifyAdmin();
      const { data: existing } = await supabase.storage.getBucket("sponsor-stories");
      if (!existing) {
        const { error: bucketErr } = await supabase.storage.createBucket("sponsor-stories", {
          public: true,
          fileSizeLimit: 10485760,
          allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
        });
        if (bucketErr) throw new Error("Erro ao criar bucket: " + bucketErr.message);
      }
      return new Response(JSON.stringify({ success: true, existed: !!existing }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ==========================================
    // 🔄 AÇÃO: RELOAD SCHEMA CACHE
    // ==========================================
    if (action === "reload_schema") {
      await verifyAdmin();
      // Força PostgREST a recarregar o schema cache
      await supabase.rpc("reload_pgrst_schema" as any).catch(() => null);
      // Fallback: query direta
      try {
        await (supabase as any).from("_pgrst_reserved").select().limit(0).throwOnError();
      } catch { /* ignorar */ }
      return new Response(JSON.stringify({ success: true, message: "Schema reload requested" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ==========================================
    // 👤 AÇÃO: CRIAR CONTA DE PATROCINADOR
    // ==========================================
    if (action === "create_sponsor_user") {
      await verifyAdmin();
      const { email, password, sponsorId } = body;
      if (!email || !password || !sponsorId) throw new Error("email, password e sponsorId são obrigatórios.");

      const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createErr || !newUser?.user) throw new Error(createErr?.message || "Erro ao criar usuário.");

      const userId = newUser.user.id;
      await new Promise((r) => setTimeout(r, 800));

      await supabase.from("profiles").upsert({
        user_id: userId,
        email,
        full_name: "",
        user_type: "sponsor",
      }, { onConflict: "user_id" });

      const { error: linkErr } = await supabase
        .from("sponsors")
        .update({ user_id: userId })
        .eq("id", sponsorId);
      if (linkErr) throw new Error("Erro ao vincular sponsor: " + linkErr.message);

      return new Response(JSON.stringify({ success: true, userId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ==========================================
    // 🔗 AÇÃO: GERAR URL ASSINADA DE DOCUMENTO
    // ==========================================
    if (action === "sign_document_url") {
      await verifyAdmin();
      const { filePath } = body;
      if (!filePath) throw new Error("filePath é obrigatório.");

      const normalized = normalizeUploadsStoragePath(filePath);
      if (!normalized) {
        console.warn("[sign_document_url] could not normalize path:", filePath);
        return new Response(JSON.stringify({ signedUrl: null, notFound: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data, error } = await supabase.storage
        .from(UPLOADS_BUCKET)
        .createSignedUrl(normalized, 3600);

      if (error || !data?.signedUrl) {
        console.warn("[sign_document_url] error:", error?.message, "raw:", filePath, "normalized:", normalized);
        return new Response(JSON.stringify({ signedUrl: null, notFound: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log("[sign_document_url] OK, normalized:", normalized);
      return new Response(JSON.stringify({ signedUrl: data.signedUrl, notFound: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ==========================================
    // 📄 AÇÃO: SOLICITAR REENVIO DE DOCUMENTOS
    // ==========================================
    if (action === "request_doc_reupload") {
      const caller = await verifyAdmin();
      const { professionalId, userId } = body;
      if (!professionalId || !userId) throw new Error("professionalId e userId são obrigatórios.");

      await supabase
        .from("professionals")
        .update({ doc_reupload_requested: true, profile_status: "pending" } as any)
        .eq("id", professionalId);

      await supabase.from("notifications").insert({
        user_id: userId,
        title: "Documentos solicitados",
        message: "A equipe do Chamô solicitou o reenvio dos seus documentos de verificação. Acesse Perfil > Configurações > Segurança para enviar.",
        type: "admin",
        link: "/profile/settings/seguranca",
      });

      await supabase.from("admin_logs").insert({
        admin_user_id: caller.id,
        action: "request_doc_reupload",
        target_type: "professional",
        target_id: professionalId,
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Invalid action");
  } catch (error: any) {
    console.error(`[admin-manage] Error: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});