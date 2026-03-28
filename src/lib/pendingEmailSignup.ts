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

/**
 * Após o utilizador confirmar o e-mail e obter sessão, envia o payload guardado em sessionStorage
 * para complete-signup (o fluxo sem sessão imediata após signUp não consegue chamar a Edge Function antes).
 */
export async function flushPendingEmailSignup(session: Session | null): Promise<boolean> {
  if (!session?.user?.id) return false;

  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(PENDING_EMAIL_SIGNUP_KEY);
  } catch {
    return false;
  }
  if (!raw) return false;

  let pending: PendingEmailSignupV1;
  try {
    pending = JSON.parse(raw) as PendingEmailSignupV1;
  } catch {
    return false;
  }

  if (pending.v !== 1 || pending.userId !== session.user.id) return false;

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
