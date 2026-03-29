import { supabase } from "@/integrations/supabase/client";
import { getAccessTokenForEdgeFunctions } from "@/lib/getAccessTokenForEdgeFunctions";
import type { Session } from "@supabase/supabase-js";
import type { BasicData } from "@/components/signup/StepBasicData";
import type { StepProfileData } from "@/components/signup/StepProfile";

export const PENDING_EMAIL_SIGNUP_KEY = "chamo_pending_email_signup_v1";

export type PendingEmailSignupDoc = { base64: string; ext: string; contentType: string };

export type PendingEmailSignupV1 = {
  v: 1;
  userId: string;
  accountType: "client" | "professional";
  /** Sem senha — só dados para complete-signup */
  basicData: Omit<BasicData, "password">;
  profileData: StepProfileData;
  docFiles: PendingEmailSignupDoc[];
  planId: string;
  referralCode: string | null;
};

export function peekPendingEmailSignup(userId: string): PendingEmailSignupV1 | null {
  try {
    const raw = sessionStorage.getItem(PENDING_EMAIL_SIGNUP_KEY);
    if (!raw) return null;
    const pending = JSON.parse(raw) as PendingEmailSignupV1;
    if (pending.v !== 1 || pending.userId !== userId) return null;
    return pending;
  } catch {
    return null;
  }
}

/**
 * Após login, o JWT pode demorar um instante; várias tentativas evitam ficar com perfil "cliente" até dar F5.
 */
export async function flushPendingEmailSignupWithRetries(session: Session | null, maxAttempts = 8): Promise<void> {
  if (!session?.user?.id) return;
  const uid = session.user.id;
  if (!peekPendingEmailSignup(uid)) return;

  let sess: Session | null = session;
  for (let i = 0; i < maxAttempts; i++) {
    if (!peekPendingEmailSignup(uid)) return;

    const ok = await flushPendingEmailSignup(sess);
    if (ok) return;

    await supabase.auth.refreshSession().catch(() => {});
    const {
      data: { session: next },
    } = await supabase.auth.getSession();
    if (next) sess = next;
    await new Promise((r) => setTimeout(r, 180 + i * 100));
  }
}

/**
 * Após o utilizador confirmar o e-mail e obter sessão, envia o payload guardado em sessionStorage
 * para complete-signup (o fluxo sem sessão imediata após signUp não consegue chamar a Edge Function antes).
 */
export async function flushPendingEmailSignup(session: Session | null): Promise<boolean> {
  if (!session?.user?.id) return false;

  const pending = peekPendingEmailSignup(session.user.id);
  if (!pending) return false;

  const token = await getAccessTokenForEdgeFunctions();
  if (!token) return false;

  const { data: result, error: fnError } = await supabase.functions.invoke("complete-signup", {
    body: {
      userId: pending.userId,
      accountType: pending.accountType,
      profileData: pending.profileData,
      basicData: pending.basicData,
      docFiles: pending.docFiles,
      planId: pending.planId,
    },
    headers: { Authorization: `Bearer ${token}` },
  });

  if (fnError || (result && typeof result === "object" && "error" in result && (result as { error?: string }).error)) {
    console.error("[pendingEmailSignup] complete-signup:", fnError || result);
    return false;
  }

  // Acesso antecipado: aplica VIP (CPF) ou Business (CNPJ) para cadastros antes de 15/04
  if (pending.accountType === "professional") {
    const EARLY_CUTOFF = new Date("2026-04-15T00:00:00");
    const EARLY_EXPIRES = new Date("2026-07-15T00:00:00");
    if (new Date() < EARLY_CUTOFF) {
      const docType = (pending.basicData.documentType as "cpf" | "cnpj") ?? "cpf";
      const planId = docType === "cnpj" ? "business" : "vip";
      try {
        const { data: pro } = await supabase.from("professionals").select("id").eq("user_id", pending.userId).maybeSingle();
        if (pro?.id) {
          await supabase
            .from("professionals")
            .update({ doc_type: docType, early_access: true } as any)
            .eq("id", pro.id);
        }
        await supabase.from("subscriptions").upsert(
          { user_id: pending.userId, plan_id: planId, status: "ACTIVE", expires_at: EARLY_EXPIRES.toISOString() },
          { onConflict: "user_id" },
        );
        if (docType === "cnpj") {
          await supabase.from("profiles").update({ user_type: "company" }).eq("user_id", pending.userId);
        }
        try { localStorage.setItem(`early_access_modal_${pending.userId}`, "pending"); } catch { void 0; }
      } catch (e) {
        console.warn("[pendingEmailSignup] early_access failed:", e);
      }
    }
  }

  try {
    sessionStorage.removeItem(PENDING_EMAIL_SIGNUP_KEY);
  } catch {
    void 0;
  }

  const refCode = pending.referralCode?.trim() ?? "";
  if (refCode.length >= 6) {
    const { data: refData, error: refErr } = await supabase.rpc("apply_referral_code", { p_raw_code: refCode });
    if (refErr) console.warn("[pendingEmailSignup] apply_referral_code:", refErr);
    else if (refData && typeof refData === "object" && "ok" in refData && (refData as { ok?: boolean }).ok === false) {
      console.warn("[pendingEmailSignup] referral:", (refData as { error?: string }).error);
    }
  }

  return true;
}
