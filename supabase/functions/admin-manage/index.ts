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
const ASAAS_BASE_URL = ASAAS_ENV === "production" ? "https://api.asaas.com/v3" : "https://sandbox.asaas.com/api/v3";
const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY");

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

    const getCaller = async () => {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) throw new Error("Unauthorized");
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
      const callerClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user: caller } } = await callerClient.auth.getUser();
      if (!caller) throw new Error("Unauthorized");
      return caller;
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

    // Shared function to cascade-delete a user
    const cascadeDeleteUser = async (user_id: string) => {
      console.log(`[cascadeDeleteUser] Starting deletion for user: ${user_id}`);

      // Get professional IDs
      const { data: pros } = await supabase.from("professionals").select("id").eq("user_id", user_id);
      const proIds = pros?.map((p: any) => p.id) || [];
      console.log(`[cascadeDeleteUser] Found ${proIds.length} professional records`);

      // Collect all service request IDs
      let allRequestIds: string[] = [];
      if (proIds.length > 0) {
        const { data: proRequests } = await supabase.from("service_requests").select("id").in("professional_id", proIds);
        allRequestIds.push(...(proRequests?.map((r: any) => r.id) || []));
      }
      const { data: clientRequests } = await supabase.from("service_requests").select("id").eq("client_id", user_id);
      allRequestIds.push(...(clientRequests?.map((r: any) => r.id) || []));
      allRequestIds = [...new Set(allRequestIds)];

      // Delete request-related data
      if (allRequestIds.length > 0) {
        await supabase.from("reviews").delete().in("request_id", allRequestIds);
        await supabase.from("chat_messages").delete().in("request_id", allRequestIds);
        await supabase.from("chat_read_status").delete().in("request_id", allRequestIds);
      }

      // Delete reviews where this user is the professional
      if (proIds.length > 0) {
        await supabase.from("reviews").delete().in("professional_id", proIds);
      }
      // Delete reviews where this user is the client
      await supabase.from("reviews").delete().eq("client_id", user_id);

      if (proIds.length > 0) {
        const { data: jobs } = await supabase.from("job_postings").select("id").in("professional_id", proIds);
        const jobIds = jobs?.map((j: any) => j.id) || [];
        if (jobIds.length > 0) {
          await supabase.from("job_applications").delete().in("job_id", jobIds);
        }
        await supabase.from("product_catalog").delete().in("professional_id", proIds);
        await supabase.from("professional_documents").delete().in("professional_id", proIds);
        await supabase.from("professional_fiscal_data").delete().in("professional_id", proIds);
        await supabase.from("job_postings").delete().in("professional_id", proIds);
        await supabase.from("service_requests").delete().in("professional_id", proIds);
        await supabase.from("transactions").delete().in("professional_id", proIds.map(String));
      }

      await supabase.from("job_applications").delete().eq("applicant_id", user_id);
      await supabase.from("service_requests").delete().eq("client_id", user_id);
      await supabase.from("chat_read_status").delete().eq("user_id", user_id);
      await supabase.from("notifications").delete().eq("user_id", user_id);
      await supabase.from("coupons").delete().eq("user_id", user_id);
      await supabase.from("subscriptions").delete().eq("user_id", user_id);
      await supabase.from("sponsor_clicks").delete().eq("user_id", user_id);
      await supabase.from("enterprise_upgrade_requests").delete().eq("user_id", user_id);
      // Clear raffles winner reference (SET NULL)
      await supabase.from("raffles").update({ winner_user_id: null }).eq("winner_user_id", user_id);
      await supabase.from("support_messages").delete().eq("user_id", user_id);
      await supabase.from("support_messages").delete().eq("sender_id", user_id);
      await supabase.from("support_read_status").delete().eq("user_id", user_id);
      await supabase.from("support_read_status").delete().eq("thread_user_id", user_id);
      await supabase.from("support_tickets").delete().eq("user_id", user_id);
      await supabase.from("transactions").delete().eq("client_id", user_id);
      await supabase.from("transactions").delete().eq("professional_id", user_id);
      await supabase.from("user_roles").delete().eq("user_id", user_id);
      await supabase.from("professionals").delete().eq("user_id", user_id);
      await supabase.from("profiles").delete().eq("user_id", user_id);

      console.log(`[cascadeDeleteUser] All data deleted, now signing out and deleting auth user`);

      // Force sign out from all devices first
      await supabase.auth.admin.signOut(user_id, 'global');

      // Delete the auth user - this fully removes from auth.users so they can re-register
      const { error } = await supabase.auth.admin.deleteUser(user_id);
      if (error) {
        console.error(`[cascadeDeleteUser] Auth deletion error: ${error.message}`);
        throw new Error(`Failed to delete auth user: ${error.message}`);
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
      if (!ASAAS_API_KEY) throw new Error("Chave do Asaas não configurada.");

      const { data: subData, error: subError } = await supabase
        .from("subscriptions")
        .select("asaas_subscription_id")
        .eq("user_id", userId)
        .single();

      if (subError || !subData?.asaas_subscription_id) {
        throw new Error("Assinatura não encontrada no banco de dados da Chamô.");
      }

      const today = new Date().toISOString().split("T")[0];

      const response = await fetch(`${ASAAS_BASE_URL}/subscriptions/${subData.asaas_subscription_id}`, {
        method: "POST",
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

    throw new Error("Invalid action");
  } catch (error: any) {
    console.error(`[admin-manage] Error: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});