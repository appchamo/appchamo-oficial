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
 * Guarda o cadastro pendente DE FORMA DURÁVEL no servidor (tabela pending_signups),
 * pra concluir depois da confirmação do e-mail em QUALQUER aparelho — mesmo que o
 * navegador que iniciou seja fechado ou o e-mail seja aberto em outro device.
 * Best-effort: se falhar, o fluxo local (sessionStorage) ainda cobre o caso normal.
 */
export async function stashPendingSignupToServer(userId: string, payload: PendingEmailSignupV1): Promise<void> {
  try {
    await supabase.functions.invoke("stash-pending-signup", { body: { userId, payload } });
  } catch (e) {
    console.warn("[pendingEmailSignup] stash:", e);
  }
}

type FlushOutcome = "done" | "retry" | "nothing";

/**
 * Tenta concluir o cadastro. Usa o payload local (sessionStorage) quando existe;
 * senão manda só o userId e o servidor usa o payload guardado em pending_signups.
 */
async function attemptFlush(session: Session | null): Promise<FlushOutcome> {
  if (!session?.user?.id) return "nothing";
  const uid = session.user.id;

  const token = await getAccessTokenForEdgeFunctions();
  if (!token) return "retry";

  const local = peekPendingEmailSignup(uid);
  const body = local
    ? {
        userId: local.userId,
        accountType: local.accountType,
        profileData: local.profileData,
        basicData: local.basicData,
        docFiles: local.docFiles,
        planId: local.planId,
      }
    : { userId: uid }; // pickup do servidor

  const { data: result, error: fnError } = await supabase.functions.invoke("complete-signup", {
    body,
    headers: { Authorization: `Bearer ${token}` },
  });

  if (fnError) {
    console.error("[pendingEmailSignup] complete-signup:", fnError);
    return "retry";
  }
  const res = result as { error?: string; skipped?: boolean } | null;
  if (res && typeof res === "object" && res.error) {
    console.error("[pendingEmailSignup] complete-signup:", res.error);
    return "retry";
  }
  // Servidor não tinha nada pendente (já concluído ou nunca guardado): nada a fazer.
  if (res && typeof res === "object" && res.skipped) return "nothing";

  // Sucesso: limpa o rascunho local e aplica indicação (só temos o código no payload local).
  if (local) {
    try {
      sessionStorage.removeItem(PENDING_EMAIL_SIGNUP_KEY);
    } catch {
      void 0;
    }
    const refCode = local.referralCode?.trim() ?? "";
    if (refCode.length >= 6) {
      const { error: refErr } = await supabase.rpc("apply_referral_code", { p_raw_code: refCode });
      if (refErr) console.warn("[pendingEmailSignup] apply_referral_code:", refErr);
    }
  }
  return "done";
}

/**
 * Após login, o JWT pode demorar um instante; várias tentativas evitam ficar com perfil
 * "cliente"/"pending" até dar F5. Cobre tanto o payload local quanto o pickup do servidor.
 */
export async function flushPendingEmailSignupWithRetries(session: Session | null, maxAttempts = 8): Promise<void> {
  if (!session?.user?.id) return;
  const uid = session.user.id;

  // Sem payload local: só vale a pena tentar o pickup do servidor se o perfil ainda
  // estiver "pending_signup" (evita chamada extra em todo login normal).
  if (!peekPendingEmailSignup(uid)) {
    try {
      const { data: prof } = await supabase.from("profiles").select("user_type").eq("user_id", uid).maybeSingle();
      if (String((prof as { user_type?: string } | null)?.user_type || "") !== "pending_signup") return;
    } catch {
      /* se a consulta falhar, tenta mesmo assim */
    }
  }

  let sess: Session | null = session;
  for (let i = 0; i < maxAttempts; i++) {
    const outcome = await attemptFlush(sess);
    if (outcome === "done" || outcome === "nothing") return;

    await supabase.auth.refreshSession().catch(() => {});
    const {
      data: { session: next },
    } = await supabase.auth.getSession();
    if (next) sess = next;
    await new Promise((r) => setTimeout(r, 180 + i * 100));
  }
}

/** Compat: retorna true se concluiu o cadastro. */
export async function flushPendingEmailSignup(session: Session | null): Promise<boolean> {
  return (await attemptFlush(session)) === "done";
}
