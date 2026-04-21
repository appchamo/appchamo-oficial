import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase, hardClearNativeAuthSession } from "@/integrations/supabase/client";
import { peekPostAuthRedirect, clearPostAuthRedirect } from "@/lib/chamoAuthReturn";
import { Capacitor } from "@capacitor/core";
import { isProfileSignupComplete } from "@/lib/profileSignupComplete";

export default function PostLoginGate() {
  const navigate = useNavigate();
  const { session, profile, loading, refreshProfile, refreshRoles } = useAuth();
  const [checking, setChecking] = useState(true);
  /** user resolvido via polling direto em getSession() — usa quando o contexto ainda não atualizou (corrida pós-OAuth). */
  const [fallbackUserId, setFallbackUserId] = useState<string | null>(null);
  const didDecideRef = useRef(false);
  /**
   * Antes usávamos `let cancelled = false` no escopo do effect e cleanup `cancelled = true`,
   * mas ele disparava em qualquer mudança de dep (ex.: `profile?.user_id` aparecendo no contexto
   * do useAuth durante o run()). O re-run do effect retornava cedo por `didDecideRef.current`,
   * deixando o `run()` cancelado SEM chamar setChecking(false)/navigate(...) — spinner
   * "Verificando seu cadastro…" eterno. Agora só cancelamos no unmount real.
   */
  const unmountedRef = useRef(false);
  useEffect(() => () => {
    unmountedRef.current = true;
  }, []);

  useEffect(() => {
    if (loading) return;
    if (session?.user) return;
    if (fallbackUserId) return;

    let cancelled = false;
    (async () => {
      // Nativo: não expulsar enquanto getSession ainda não vê a sessão (corrida pós-OAuth / Preferences).
      const maxWait = Capacitor.isNativePlatform() ? 24 : 4;
      for (let i = 0; i < maxWait && !cancelled; i++) {
        const { data: { session: live } } = await supabase.auth.getSession();
        if (live?.user) {
          // Contexto do React ainda pode estar nulo (SIGNED_IN atrasado): destravamos usando o userId do polling.
          setFallbackUserId(live.user.id);
          void refreshProfile(live.user.id).catch(() => {});
          void refreshRoles(live.user.id).catch(() => {});
          return;
        }
        await new Promise((r) => setTimeout(r, 150));
      }
      if (!cancelled) navigate("/login", { replace: true });
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, session?.user?.id, fallbackUserId, navigate, refreshProfile, refreshRoles]);

  useEffect(() => {
    if (loading) return;
    const userId = session?.user?.id ?? fallbackUserId;
    if (!userId) return;
    if (didDecideRef.current) return;
    didDecideRef.current = true;

    // Enquanto o perfil está carregando, faz retry curto (corrida pós-OAuth) antes de assumir travamento.
    if (!profile) {
      setChecking(true);

      const isCancelled = () => unmountedRef.current;
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

      const run = async () => {
        // tenta por ~6s no total; normalmente o trigger insere o profile quase imediato
        const attempts = [
          { waitBeforeMs: 0, timeoutMs: 2000 },
          { waitBeforeMs: 500, timeoutMs: 2500 },
          { waitBeforeMs: 900, timeoutMs: 3000 },
          { waitBeforeMs: 1200, timeoutMs: 3500 },
        ];

        for (const a of attempts) {
          if (isCancelled()) return;
          if (a.waitBeforeMs) await sleep(a.waitBeforeMs);
          try {
            const { data, error } = await Promise.race([
              supabase
                .from("profiles")
                .select("user_type, signup_completed_at, accepted_terms_version")
                .eq("user_id", userId)
                .maybeSingle()
                .then((res) => res),
              new Promise<never>((_, reject) => setTimeout(() => reject(new Error("post_login_profile_timeout")), a.timeoutMs)),
            ]);

            if (isCancelled()) return;
            if (error) {
              console.warn("[post-login] profiles select:", error.message);
            }
            const row = data as {
              user_type?: string;
              signup_completed_at?: string | null;
              accepted_terms_version?: string | null;
            } | null;
            const userType = row?.user_type;
            if (userType) {
              if (userType === "pending_signup") {
                // Aguarda até 12s para o flushPendingEmailSignup (background) completar
                // antes de jogar o usuário na tela de seleção CLIENTE/PROFISSIONAL
                let finalType = userType;
                for (let w = 0; w < 24 && !isCancelled(); w++) {
                  await sleep(500);
                  try {
                    const { data: d2 } = await supabase
                      .from("profiles")
                      .select("user_type, signup_completed_at, accepted_terms_version")
                      .eq("user_id", userId)
                      .maybeSingle();
                    const t2 = (d2 as { user_type?: string } | null)?.user_type;
                    if (t2 && t2 !== "pending_signup") { finalType = t2; break; }
                  } catch { /* continua */ }
                }
                if (isCancelled()) return;
                setChecking(false);
                if (finalType !== "pending_signup") {
                  void refreshProfile(userId).catch(() => {});
                  void refreshRoles(userId).catch(() => {});
                  const lastRow = await supabase
                    .from("profiles")
                    .select("user_type, signup_completed_at, accepted_terms_version")
                    .eq("user_id", userId)
                    .maybeSingle()
                    .then((r) => r.data as {
                      user_type?: string | null;
                      signup_completed_at?: string | null;
                      accepted_terms_version?: string | null;
                    } | null);
                  if (isCancelled()) return;
                  if (!lastRow || !isProfileSignupComplete(lastRow)) {
                    navigate("/signup", { replace: true });
                  } else {
                    const pending = peekPostAuthRedirect();
                    if (pending) { clearPostAuthRedirect(); navigate(pending, { replace: true }); }
                    else navigate("/home", { replace: true });
                  }
                } else {
                  navigate("/signup", { replace: true });
                }
                return;
              }
              setChecking(false);
              // Se veio do fluxo de cadastro via OAuth (Google/Apple na tela de Signup),
              // redireciona para o Signup para escolher o tipo de conta (Cliente/Profissional).
              const isNewSignup = localStorage.getItem("signup_in_progress") === "true";
              if (isNewSignup) {
                navigate("/signup", { replace: true });
                return;
              }
              if (!isProfileSignupComplete(row ?? {})) {
                navigate("/signup", { replace: true });
                return;
              }
              const pending = peekPostAuthRedirect();
              if (pending) {
                clearPostAuthRedirect();
                navigate(pending, { replace: true });
              } else {
                navigate("/home", { replace: true });
              }
              // Sempre com userId da sessão: após Apple/Google `user` no contexto pode atrasar e refreshProfile() era no-op.
              void refreshProfile(userId).catch(() => {});
              void refreshRoles(userId).catch(() => {});
              return;
            }
          } catch (_) {
            // segue tentando
          }
        }

        if (isCancelled()) return;

        // Trigger handle_new_user pode falhar ou atrasar: criar perfil cliente com a sessão OAuth (RLS permite insert own row).
        const { data: liveAuth } = await supabase.auth.getSession();
        const u = liveAuth?.session?.user;
        if (!u || u.id !== userId) {
          if (!isCancelled()) {
            setChecking(false);
            navigate("/login", { replace: true });
          }
          return;
        }
        const meta = (u.user_metadata || {}) as Record<string, unknown>;
        const isNewSignupFallback = localStorage.getItem("signup_in_progress") === "true";
        const { error: upsertErr } = await supabase.from("profiles").upsert(
          {
            user_id: u.id,
            email: String(u.email || "").trim(),
            full_name: String(meta.full_name || meta.name || "").trim(),
            // Preservar pending_signup se veio do fluxo de cadastro para que /signup mostre a tela de tipo de conta.
            user_type: isNewSignupFallback ? "pending_signup" : "client",
          },
          { onConflict: "user_id" },
        );
        if (isNewSignupFallback) {
          if (!isCancelled()) {
            setChecking(false);
            navigate("/signup", { replace: true });
          }
          return;
        }
        if (!upsertErr && !isCancelled()) {
          try {
            const { data: row, error: rowErr } = await Promise.race([
              supabase
                .from("profiles")
                .select("user_type, signup_completed_at, accepted_terms_version")
                .eq("user_id", userId)
                .maybeSingle(),
              new Promise<never>((_, reject) => setTimeout(() => reject(new Error("post_login_after_upsert_timeout")), 5000)),
            ]);
            if (!isCancelled() && !rowErr) {
              const ut = (row as { user_type?: string } | null)?.user_type;
              const r = row as {
                user_type?: string;
                signup_completed_at?: string | null;
                accepted_terms_version?: string | null;
              } | null;
              if (ut && ut !== "pending_signup") {
                if (!isProfileSignupComplete(r ?? {})) {
                  setChecking(false);
                  navigate("/signup", { replace: true });
                  return;
                }
                setChecking(false);
                const pending = peekPostAuthRedirect();
                if (pending) {
                  clearPostAuthRedirect();
                  navigate(pending, { replace: true });
                } else {
                  navigate("/home", { replace: true });
                }
                void refreshProfile(userId).catch(() => {});
                void refreshRoles(userId).catch(() => {});
                return;
              }
            }
          } catch {
            /* segue para fallback */
          }
        } else if (upsertErr) {
          console.warn("[post-login] upsert profile:", upsertErr.message);
        }

        if (isCancelled()) return;
        // Último recurso: sessão inválida ou bloqueio raro
        try {
          await hardClearNativeAuthSession().catch(() => {});
          await supabase.auth.signOut().catch(() => {});
        } catch (_) {}
        setChecking(false);
        navigate("/signup", { replace: true });
      };

      run();
      // Sem cleanup aqui: o `unmountedRef` (effect próprio com deps []) cuida do unmount real.
      // Cleanup via cancelled local rodava em qualquer mudança de dep (ex.: profile aparecendo
      // no contexto enquanto o run() estava em andamento) e travava a tela em "Verificando...".
      return;
    }

    // Perfil já no contexto (ex. retry anterior)
    setChecking(false);
    if (profile.user_type === "pending_signup") {
      navigate("/signup", { replace: true });
      return;
    }
    // Se veio do fluxo de cadastro via OAuth, vai para /signup para escolher tipo de conta.
    const isNewSignupCtx = localStorage.getItem("signup_in_progress") === "true";
    if (isNewSignupCtx) {
      navigate("/signup", { replace: true });
      return;
    }
    if (!isProfileSignupComplete(profile)) {
      navigate("/signup", { replace: true });
      return;
    }
    const pending = peekPostAuthRedirect();
    if (pending) {
      clearPostAuthRedirect();
      navigate(pending, { replace: true });
      return;
    }
    navigate("/home", { replace: true });
  }, [loading, session?.user?.id, fallbackUserId, profile?.user_id, navigate, refreshProfile, refreshRoles]);

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          {checking ? "Verificando seu cadastro…" : "Redirecionando…"}
        </div>
      </div>
    </div>
  );
}

