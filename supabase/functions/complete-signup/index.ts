import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "jsr:@panva/jose@6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function isValidCpf(d: string): boolean {
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const digits = d.split("").map(Number);
  for (const k of [9, 10] as const) {
    let sum = 0;
    for (let i = 0; i < k; i++) sum += digits[i] * (k + 1 - i);
    if ((sum * 10) % 11 % 10 !== digits[k]) return false;
  }
  return true;
}

function isValidCnpj(d: string): boolean {
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const digits = d.split("").map(Number);
  const calc = (slice: number[], weights: number[]) => {
    const sum = slice.reduce((acc, n, i) => acc + n * weights[i], 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  if (calc(digits.slice(0, 12), w1) !== digits[12]) return false;
  if (calc(digits.slice(0, 13), w2) !== digits[13]) return false;
  return true;
}

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
    const { userId, accountType: accountTypeRaw, profileData, basicData, docFiles, planId } = body;

    /** Se o app perder o estado (ex.: remount WebView) pode enviar client com payload de profissional. */
    const hasProDocs = Array.isArray(docFiles) && docFiles.length > 0;
    const categoryId = profileData && typeof profileData === "object"
      ? (profileData as { categoryId?: unknown }).categoryId
      : undefined;
    const hasProProfile = categoryId !== undefined && categoryId !== null && String(categoryId).length > 0;
    let accountType = accountTypeRaw;
    if (accountType === "client" && (hasProDocs || hasProProfile)) {
      accountType = "professional";
    }

    if (!userId || !accountType || !basicData) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // CPF/CNPJ obrigatório para todos. Defesa contra clientes que chamem a função
    // ignorando o passo de UI ou enviando payload manipulado.
    {
      const docDigits = String(basicData.document ?? "").replace(/\D/g, "");
      const docType = basicData.documentType === "cnpj" ? "cnpj" : "cpf";
      if (!docDigits) {
        return new Response(
          JSON.stringify({ error: "CPF é obrigatório." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (docType === "cpf" && !isValidCpf(docDigits)) {
        return new Response(
          JSON.stringify({ error: "CPF inválido." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (docType === "cnpj" && !isValidCnpj(docDigits)) {
        return new Response(
          JSON.stringify({ error: "CNPJ inválido." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      basicData.document = docDigits;
      basicData.documentType = docType;
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

    // Lê a versão vigente dos termos para o tipo de conta. Evita gravar uma
    // versão hard-coded que ficaria desatualizada assim que o admin publicar
    // novos termos — o banner de re-aceite apareceria indevidamente para quem
    // acabou de se cadastrar.
    const termsKey =
      accountType === "professional" || accountType === "company"
        ? "terms_version_professional"
        : "terms_version";
    const { data: termsRow } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", termsKey)
      .maybeSingle();
    const parseSettingVal = (v: unknown): string => {
      if (v == null) return "";
      if (typeof v === "string") return v;
      try {
        return JSON.stringify(v).replace(/^"|"$/g, "");
      } catch {
        return String(v);
      }
    };
    const currentTermsVersion = parseSettingVal(termsRow?.value) || "1.0";

    // ✅ 4. Preparação dos dados do Perfil
    const profileUpdates: Record<string, any> = {
      user_type: accountType,
      full_name: basicData.name,
      display_name: basicData.displayName || basicData.name,
      phone: basicData.phone,
      birth_date: basicData.birthDate || null,
      accepted_terms_version: currentTermsVersion,
      accepted_terms_at: new Date().toISOString(),
      signup_completed_at: new Date().toISOString(),
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

    if (basicData.asaas_customer_id) profileUpdates.asaas_customer_id = basicData.asaas_customer_id;

    if (basicData.gender) profileUpdates.gender = basicData.gender;

    if (profileData?.avatarUrl) profileUpdates.avatar_url = profileData.avatarUrl;

    const lat = basicData.latitude;
    const lng = basicData.longitude;
    if (
      typeof lat === "number" &&
      typeof lng === "number" &&
      Number.isFinite(lat) &&
      Number.isFinite(lng)
    ) {
      profileUpdates.latitude = lat;
      profileUpdates.longitude = lng;
    }

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

    // 🔥 5. Fluxo de Profissional (sempre em análise até aprovação no admin; plano só depois)
    if (accountType === "professional") {
      const { error: proError } = await supabase.from("professionals").upsert({
        user_id: userId,
        profile_status: "pending",
        category_id: profileData?.categoryId || null,
        profession_id: profileData?.professionId || null,
        experience: profileData?.experience || null,
        services: profileData?.services?.length ? profileData.services : null,
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
          // Substitui lote anterior: retries / reenvio do mesmo cadastro não deve acumular linhas.
          const { data: staleRows } = await supabase
            .from("professional_documents")
            .select("file_url")
            .eq("professional_id", proData.id)
            .eq("type", "identity")
            .eq("status", "pending");

          const stalePaths = (staleRows ?? [])
            .map((r) => r.file_url)
            .filter(
              (p): p is string =>
                typeof p === "string" &&
                p.length > 0 &&
                !/^https?:\/\//i.test(p),
            );
          if (stalePaths.length > 0) {
            const { error: rmErr } = await supabase.storage.from("uploads").remove(stalePaths);
            if (rmErr) console.warn("complete-signup: remove stale docs:", rmErr);
          }
          await supabase
            .from("professional_documents")
            .delete()
            .eq("professional_id", proData.id)
            .eq("type", "identity")
            .eq("status", "pending");

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

            // Grava apenas o path no bucket (igual upload-document) — URLs públicas quebram createSignedUrl no admin
            await supabase.from("professional_documents").insert({
              professional_id: proData.id,
              file_url: filePath,
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

    // Notifica o admin (admin@appchamo.com) sobre novo cadastro
    const { data: adminRow } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("email", "admin@appchamo.com")
      .limit(1)
      .maybeSingle();
    if (adminRow?.user_id) {
      await supabase.from("notifications").insert({
        user_id: adminRow.user_id,
        title: "Novo cadastro",
        message: "Novo cadastro. Profissionais em análise: Admin → Profissionais.",
        type: "admin",
        link: "/admin/pros",
      });
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