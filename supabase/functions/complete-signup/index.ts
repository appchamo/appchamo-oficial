import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "jsr:@panva/jose@6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// CPFs reservados para contas de teste (passam na validação e podem repetir).
const TEST_CPFS = ["00000000000"];
function isValidCpf(d: string): boolean {
  if (TEST_CPFS.includes(d)) return true; // CPF de teste
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

function stateToUF(raw: string): string {
  const s = (raw || "").trim();
  if (s.length === 2) return s.toUpperCase();
  const map: Record<string, string> = {
    "minas gerais": "MG", "são paulo": "SP", "rio de janeiro": "RJ", "bahia": "BA",
    "paraná": "PR", "parana": "PR", "rio grande do sul": "RS", "pernambuco": "PE",
    "ceará": "CE", "ceara": "CE", "santa catarina": "SC", "goiás": "GO", "goias": "GO",
    "maranhão": "MA", "maranhao": "MA", "paraíba": "PB", "paraiba": "PB", "amazonas": "AM",
    "espírito santo": "ES", "espirito santo": "ES", "rio grande do norte": "RN", "alagoas": "AL",
    "piauí": "PI", "piaui": "PI", "distrito federal": "DF", "mato grosso": "MT",
    "mato grosso do sul": "MS", "sergipe": "SE", "tocantins": "TO", "rondônia": "RO",
    "rondonia": "RO", "acre": "AC", "amapá": "AP", "amapa": "AP", "roraima": "RR",
  };
  const key = s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return map[key] || s.slice(0, 2).toUpperCase();
}

/**
 * Reverse-geocode no servidor (Deno). Ao contrário do navegador/webview, aqui
 * dá para enviar User-Agent — requisito do Nominatim. Cai para BigDataCloud.
 */
async function reverseGeocode(lat: number, lng: number): Promise<{ city: string; state: string }> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
    const res = await fetch(url, {
      headers: { "Accept-Language": "pt-BR", "User-Agent": "ChamoApp/1.0 (contato@appchamo.com)" },
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = await res.json();
      const addr = data?.address || {};
      const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || "";
      const stateRaw =
        (addr["ISO3166-2-lvl4"] && String(addr["ISO3166-2-lvl4"]).split("-")[1]) || addr.state || "";
      if (city) return { city, state: stateToUF(stateRaw) };
    }
  } catch (_) { /* tenta o fallback */ }
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=pt`,
      { signal: AbortSignal.timeout(4000) },
    );
    if (res.ok) {
      const data = await res.json();
      const city = data?.city || data?.locality || "";
      const code = String(data?.principalSubdivisionCode || "");
      const state = code.includes("-") ? code.split("-")[1].toUpperCase() : stateToUF(data?.principalSubdivision || "");
      if (city) return { city, state };
    }
  } catch (_) { /* sem cidade */ }
  return { city: "", state: "" };
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
    let { accountType: accountTypeRaw, profileData, basicData, docFiles, planId } = body;
    const { userId } = body;

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validação do JWT (verify_jwt desligado no gateway por causa do ES256) — feita ANTES
    // de qualquer coisa, pois o pickup do servidor depende de o token bater com o userId.
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

    // Pickup do servidor: se o navegador não enviou os dados (cadastro por e-mail
    // concluído em OUTRO aparelho, ou o app reiniciado apagou o sessionStorage),
    // busca o payload guardado de forma durável em `pending_signups`.
    if (!basicData) {
      const { data: pend } = await supabase
        .from("pending_signups")
        .select("payload")
        .eq("user_id", userId)
        .maybeSingle();
      const p = (pend as { payload?: Record<string, unknown> } | null)?.payload as any;
      if (!p) {
        // Nada pra completar (usuário já concluído ou sem pendência). No-op seguro.
        return new Response(
          JSON.stringify({ skipped: true, reason: "sem_pendencia" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      accountTypeRaw = p.accountType ?? accountTypeRaw;
      profileData = p.profileData ?? profileData;
      basicData = p.basicData ?? basicData;
      docFiles = p.docFiles ?? docFiles;
      planId = p.planId ?? planId;
    }

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

    if (!accountType || !basicData) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // CPF/CNPJ obrigatório para profissional/empresa. Cliente pode se cadastrar
    // SEM CPF (a coleta/verificação acontece no 1º pagamento). Defesa contra
    // payload manipulado que pule o passo de UI.
    {
      const docDigits = String(basicData.document ?? "").replace(/\D/g, "");
      const docType = basicData.documentType === "cnpj" ? "cnpj" : "cpf";
      const isClient = accountType === "client";
      if (!docDigits) {
        if (!isClient) {
          return new Response(
            JSON.stringify({ error: "CPF é obrigatório." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        // Cliente sem CPF: segue o cadastro; documento não será gravado agora.
      } else {
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

    // Cliente que permitiu GPS mas não temos cidade: converte coordenada → Cidade/UF
    // aqui no servidor (o app/webview não consegue por causa do User-Agent do Nominatim).
    // A Home, o Perfil e o match por região dependem de address_city/address_state.
    if (
      (!profileUpdates.address_city || !String(profileUpdates.address_city).trim()) &&
      typeof profileUpdates.latitude === "number" &&
      typeof profileUpdates.longitude === "number"
    ) {
      const geo = await reverseGeocode(profileUpdates.latitude as number, profileUpdates.longitude as number);
      if (geo.city) {
        profileUpdates.address_city = geo.city;
        if (geo.state) profileUpdates.address_state = geo.state;
      }
    }

    // Bloqueia CPF/CNPJ duplicado APENAS no cadastro de conta.
    // (No pagamento é permitido reutilizar um CPF já cadastrado — a unicidade global foi removida.)
    if (basicData.document && !TEST_CPFS.includes(basicData.document)) {
      const docCol = basicData.documentType === "cnpj" ? "cnpj" : "cpf";
      const { data: dupRow } = await supabase
        .from("profiles")
        .select("user_id")
        .eq(docCol, basicData.document)
        .neq("user_id", userId)
        .limit(1)
        .maybeSingle();
      if (dupRow) {
        return new Response(
          JSON.stringify({ error: "CPF ou CNPJ já cadastrado. Verifique o número ou use outro." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
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

    // Cadastro concluído: remove a pendência durável (se existia).
    try {
      await supabase.from("pending_signups").delete().eq("user_id", userId);
    } catch (_e) { /* best-effort */ }

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