import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "jsr:@panva/jose@6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  // ✅ 1. Resposta para o Preflight do navegador (CORS)
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ✅ 2. Uso das variáveis de ambiente padrão do Supabase
    // Em São Paulo, o Supabase usa SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY por padrão
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("PROJECT_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const { userId, accountType, profileData, basicData, docFiles, planId } = body;

    if (!userId || !accountType || !basicData) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validação do JWT (verify_jwt desligado no gateway por causa do ES256)
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "")?.trim();
    if (!token) {
      return new Response(
        JSON.stringify({ error: "Token ausente." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    try {
      const JWKS = jose.createRemoteJWKSet(
        new URL(supabaseUrl + "/auth/v1/.well-known/jwks.json")
      );
      const issuer = supabaseUrl + "/auth/v1";
      const { payload } = await jose.jwtVerify(token, JWKS, { issuer });
      const sub = payload.sub as string | undefined;
      if (!sub || sub !== userId) {
        return new Response(
          JSON.stringify({ error: "Token inválido para este usuário." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch (_e) {
      return new Response(
        JSON.stringify({ error: "Token inválido ou expirado." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verificação do usuário no Auth
    const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userId);

    if (authError || !authUser?.user) {
      return new Response(
        JSON.stringify({ error: "Usuário não encontrado." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ✅ 4. Preparação dos dados do Perfil
    const profileUpdates: Record<string, any> = {
      user_type: accountType,
      full_name: basicData.name,
      phone: basicData.phone,
      birth_date: basicData.birthDate || null,
      accepted_terms_version: "1.0",
      accepted_terms_at: new Date().toISOString(),
      address_zip: basicData.addressZip || null,
      address_street: basicData.addressStreet || null,
      address_number: basicData.addressNumber || null,
      address_complement: basicData.addressComplement || null,
      address_neighborhood: basicData.addressNeighborhood || null,
      address_city: basicData.addressCity || null,
      address_state: basicData.addressState || null,
      address_country: basicData.addressCountry || "Brasil",
    };

    if (basicData.document) {
      if (basicData.documentType === "cpf") profileUpdates.cpf = basicData.document;
      else profileUpdates.cnpj = basicData.document;
    }

    if (profileData?.avatarUrl) profileUpdates.avatar_url = profileData.avatarUrl;

    // 🔥 UPSERT (resolve conflito com o Trigger SQL que criamos antes)
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert(
        {
          id: userId, // Garante que o ID primário seja preenchido
          user_id: userId,
          email: authUser.user.email,
          ...profileUpdates,
        },
        { onConflict: "user_id" }
      );

    if (profileError) {
      return new Response(
        JSON.stringify({ error: profileError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Garante user_type após upsert (evita que trigger ou default deixe como client)
    await supabase
      .from("profiles")
      .update({ user_type: accountType })
      .eq("user_id", userId);

    // 🔥 5. Fluxo de Profissional
    if (accountType === "professional") {
      const needsAnalysis = planId === "vip" || planId === "business";
      const profileStatus = needsAnalysis ? "pending" : "approved";

      // Usando insert ou upsert para profissionais para evitar erro de duplicidade se ele recomeçar o cadastro
      const { error: proError } = await supabase.from("professionals").upsert({
        user_id: userId,
        profile_status: profileStatus,
        category_id: profileData?.categoryId || null,
        profession_id: profileData?.professionId || null,
        bio: profileData?.bio || null,
      }, { onConflict: 'user_id' });

      if (proError) {
        return new Response(
          JSON.stringify({ error: proError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ✅ 6. Upload de Documentos
      if (docFiles && docFiles.length > 0) {
        const { data: proData } = await supabase
          .from("professionals")
          .select("id")
          .eq("user_id", userId)
          .single();

        if (proData) {
          for (const doc of docFiles) {
            const filePath = `documents/${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${doc.ext || "jpg"}`;
            const binaryStr = atob(doc.base64);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
              bytes[i] = binaryStr.charCodeAt(i);
            }

            const { error: uploadError } = await supabase.storage
              .from("uploads")
              .upload(filePath, bytes, { contentType: doc.contentType });

            if (uploadError) {
              console.error("Upload error:", uploadError);
              continue;
            }

            // Usamos o getPublicUrl oficial para garantir que funcione em qualquer região
            const { data: { publicUrl } } = supabase.storage.from("uploads").getPublicUrl(filePath);

            await supabase.from("professional_documents").insert({
              professional_id: proData.id,
              file_url: publicUrl,
              type: "identity",
              status: "pending",
            });
          }
        }
      }

      // ✅ 7. Atualização da Assinatura
      if (planId && planId !== "free") {
        await supabase
          .from("subscriptions")
          .upsert({ 
            user_id: userId, 
            plan_id: planId,
            status: 'PENDING'
          }, { onConflict: 'user_id' });
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("complete-signup error:", err);
    return new Response(
      JSON.stringify({ error: err?.message ?? String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});