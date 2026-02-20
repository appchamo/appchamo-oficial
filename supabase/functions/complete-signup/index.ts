import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("PROJECT_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { userId, accountType, profileData, basicData, docFiles, planId } =
      body;

    if (!userId || !accountType || !basicData) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: authUser, error: authError } =
      await supabase.auth.admin.getUserById(userId);

    if (authError || !authUser?.user) {
      return new Response(
        JSON.stringify({ error: "Usuário não encontrado." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

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
      if (basicData.documentType === "cpf")
        profileUpdates.cpf = basicData.document;
      else profileUpdates.cnpj = basicData.document;
    }

    if (profileData?.avatarUrl)
      profileUpdates.avatar_url = profileData.avatarUrl;

    // 🔥 UPSERT (resolve corrida de trigger)
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert(
        {
          user_id: userId,
          email: authUser.user.email,
          ...profileUpdates,
        },
        { onConflict: "user_id" }
      );

    if (profileError) {
      return new Response(
        JSON.stringify({ error: profileError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 🔥 Fluxo profissional
    if (accountType === "professional") {
      const needsAnalysis = planId === "vip" || planId === "business";
      const profileStatus = needsAnalysis ? "pending" : "approved";

      const { error: proError } = await supabase.from("professionals").insert({
        user_id: userId,
        profile_status: profileStatus,
        category_id: profileData?.categoryId || null,
        profession_id: profileData?.professionId || null,
        bio: profileData?.bio || null,
      });

      if (proError) {
        return new Response(
          JSON.stringify({ error: proError.message }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (docFiles && docFiles.length > 0) {
        const { data: proData } = await supabase
          .from("professionals")
          .select("id")
          .eq("user_id", userId)
          .single();

        if (proData) {
          for (const doc of docFiles) {
            const filePath = `documents/${userId}/${Date.now()}_${Math.random()
              .toString(36)
              .slice(2)}.${doc.ext || "jpg"}`;

            const binaryStr = atob(doc.base64);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
              bytes[i] = binaryStr.charCodeAt(i);
            }

            const { error: uploadError } = await supabase.storage
              .from("uploads")
              .upload(filePath, bytes, {
                contentType: doc.contentType,
              });

            if (uploadError) {
              console.error("Upload error:", uploadError);
              continue;
            }

            const projectUrl = Deno.env.get("PROJECT_URL")!;
            const publicUrl = `${projectUrl}/storage/v1/object/public/uploads/${filePath}`;

            await supabase.from("professional_documents").insert({
              professional_id: proData.id,
              file_url: publicUrl,
              type: "identity",
              status: "pending",
            });
          }
        }
      }

      if (planId && planId !== "free") {
        await supabase
          .from("subscriptions")
          .update({ plan_id: planId })
          .eq("user_id", userId);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("complete-signup error:", err);
    return new Response(
      JSON.stringify({ error: err?.message ?? String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});