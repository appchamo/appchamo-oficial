import { createContext, useContext, useEffect, useMemo, useState, useCallback, ReactNode } from "react";
import { supabase, hardClearNativeAuthSession } from "@/integrations/supabase/client";
import { clearLocalChamoSession } from "@/lib/localChamoSessionClear";
import { flushPendingEmailSignupWithRetries } from "@/lib/pendingEmailSignup";
import { isFatalAuthUserError } from "@/lib/authErrors";
import type { User, Session } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Preferences } from "@capacitor/preferences";

const withTimeout = async <T,>(p: Promise<T>, ms: number, tag: string) => {
  let t: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        t = setTimeout(() => reject(new Error(`${tag}_timeout_${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (t) clearTimeout(t);
  }
};

interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  cpf: string | null;
  cnpj: string | null;
  /** Nome público exibido no app (nome de exibição/fantasia). Fallback: full_name. */
  display_name?: string | null;
  avatar_url: string | null;
  user_type: string;
  is_blocked: boolean;
  accepted_terms_version: string | null;
  /** Preenchido ao finalizar cadastro no app (complete-signup). */
  signup_completed_at?: string | null;
  job_posting_enabled?: boolean;
  /** male | female | prefer_not_say – usado para "Bem-vindo(a)" na Home */
  gender?: string | null;
  address_zip?: string | null;
  address_neighborhood?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  /** Código único Indique e ganhe */
  invite_code?: string | null;
}

type AppRole =
  | "finance_admin"
  | "support_admin"
  | "sponsor_admin"
  | "moderator"
  | "client"
  | "professional"
  | "company"
  | string;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: AppRole[];
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  /** Conta removida no servidor ou JWT inválido: limpa sessão local e envia para a entrada do app (/). */
  exitSessionToLanding: () => Promise<void>;
  refreshProfile: (forUserId?: string) => Promise<void>;
  refreshRoles: (forUserId?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  roles: [],
  isAdmin: false,
  loading: true,
  signOut: async () => {},
  exitSessionToLanding: async () => {},
  refreshProfile: async () => {},
  refreshRoles: async () => {},
});

export const useAuth = () => useContext(AuthContext);

// 🛡️ Trava para evitar processamento duplicado (AbortError: Lock broken)
let lastProcessedCode: string | null = null;
let isExchangingOAuth = false;
/** Não reprocessar o mesmo código OAuth que já falhou (evita loop no iOS com getLaunchUrl antigo). */
const OAUTH_FAILED_CODE_TTL_MS = 300000; // 5 min
export const OAUTH_FAILED_KEY = "chamo_oauth_failed";

/** Liberta travas OAuth após logout — um cooldown global bloqueava login com outra conta durante ~1 min. */
function resetOAuthGuardsAfterSignOut() {
  lastProcessedCode = null;
  isExchangingOAuth = false;
  if (Capacitor.isNativePlatform()) {
    void Preferences.remove({ key: OAUTH_FAILED_KEY }).catch(() => {});
  }
}

/** Código na URL pode vir com ? ou # no final (ex.: ...code=xxx#); normalizar para comparar/salvar. */
function normalizeOAuthCode(code: string | null): string | null {
  if (!code || typeof code !== "string") return null;
  return code.replace(/[?#\s]+$/g, "").trim() || null;
}

type ProfileFetchStatus = "ok" | "missing" | "error";

async function fetchProfileWithStatus(userId: string): Promise<{
  p: Profile | null;
  status: ProfileFetchStatus;
}> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, user_id, full_name, email, phone, cpf, cnpj, display_name, avatar_url, user_type, is_blocked, job_posting_enabled, gender, address_zip, address_neighborhood, address_city, address_state, invite_code, accepted_terms_version, signup_completed_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return { p: null, status: "error" };
  if (!data) return { p: null, status: "missing" };
  return { p: data as Profile, status: "ok" };
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  const r = await fetchProfileWithStatus(userId);
  return r.status === "ok" ? r.p : null;
}

async function fetchRoles(userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  if (error || !data) return [];
  return data.map((r) => r.role as AppRole);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(() => {
    const cached = localStorage.getItem("chamo_cached_profile");
    return cached ? JSON.parse(cached) : null;
  });
  const [roles, setRoles] = useState<AppRole[]>(() => {
    const cached = localStorage.getItem("chamo_cached_roles");
    return cached ? JSON.parse(cached) : [];
  });
  const [loading, setLoading] = useState(true);
  const [isSignOutInProgress, setIsSignOutInProgress] = useState(false);

  const isAdmin = useMemo(() => {
    return roles.some((r) => String(r).endsWith("_admin"));
  }, [roles]);

  const exitSessionToLanding = useCallback(async () => {
    setIsSignOutInProgress(true);
    try {
      await clearLocalChamoSession();
      setUser(null);
      setSession(null);
      setProfile(null);
      setRoles([]);
    } finally {
      setIsSignOutInProgress(false);
      try {
        window.location.replace("/");
      } catch {
        void 0;
      }
    }
  }, []);

  const loadUserData = (sess: Session | null) => {
    // Durante signOut ficamos ~1s com isSignOutInProgress; se o utilizador entrar com outro OAuth
    // nesse intervalo, SIGNED_IN deve aplicar — senão a Home fica sem perfil/dados (skeleton eterno).
    if (isSignOutInProgress && !sess?.user) return;
    if (sess?.user) setIsSignOutInProgress(false);

    setSession(sess);
    setUser(sess?.user ?? null);

    if (!sess?.user) {
      setProfile(null);
      setRoles([]);
      localStorage.removeItem("chamo_cached_profile");
      localStorage.removeItem("chamo_cached_roles");
      setLoading(false);
      return;
    }

    // Libera a tela assim que temos sessão; perfil e roles carregam em segundo plano (evita tela travada se fetch travar no app nativo)
    setLoading(false);

    (async () => {
      try {
        const userId = sess.user.id;

        try {
          await flushPendingEmailSignupWithRetries(sess);
        } catch (e) {
          console.error("[auth] flush pending email signup:", e);
        }

        // iOS pós-OAuth pode travar chamadas; se não conseguirmos confirmar o profile rápido, deslogamos (não permite auto-login sem cadastro)
        let p: Profile | null = null;
        let pFetch: ProfileFetchStatus | "timeout" = "timeout";
        let r: AppRole[] = [];
        const tMs = Capacitor.isNativePlatform() ? 9000 : 4000;
        const [profileResult, rolesResult] = await Promise.allSettled([
          withTimeout(fetchProfileWithStatus(userId), tMs, "fetchProfile"),
          withTimeout(fetchRoles(userId), tMs, "fetchRoles"),
        ]);
        if (profileResult.status === "fulfilled") {
          p = profileResult.value.p;
          pFetch = profileResult.value.status;
        }
        if (rolesResult.status === "fulfilled") r = rolesResult.value ?? [];

        if (p?.user_type === "pending_signup") {
          await new Promise((res) => setTimeout(res, 400));
          const p2 = await fetchProfile(userId).catch(() => null);
          if (p2) {
            p = p2;
            pFetch = "ok";
          }
        }

        if (isSignOutInProgress) return;

        // BD confirmou: não existe linha em profiles (ex.: admin apagou o utilizador). Não reutilizar cache local.
        if (pFetch === "missing") {
          const isPendingSignup =
            String(sess.user.user_metadata?.user_type ?? "") === "pending_signup" ||
            String(sess.user.app_metadata?.user_type ?? "") === "pending_signup";
          if (isPendingSignup) {
            await new Promise((res) => setTimeout(res, 400));
            const r2 = await fetchProfileWithStatus(userId).catch(() => ({ p: null, status: "error" as const }));
            if (r2.status === "ok" && r2.p) {
              p = r2.p;
              pFetch = "ok";
            }
          }
          if (pFetch === "missing") {
            const { data: gu, error: guErr } = await supabase.auth.getUser();
            if (guErr && isFatalAuthUserError(guErr)) {
              await exitSessionToLanding();
              return;
            }
            if (!guErr && !gu?.user) {
              await exitSessionToLanding();
              return;
            }
            // Erro de rede / 5xx: não expulsar — a sessão local ainda é válida; /post-login ou retry de perfil trata.
            // Auth válido, perfil ainda não existe (corrida pós-cadastro/OAuth): gate /post-login faz retry.
            localStorage.removeItem("chamo_cached_profile");
            localStorage.removeItem("chamo_cached_roles");
            setProfile(null);
            setRoles([]);
            window.setTimeout(() => {
              void (async () => {
                const {
                  data: { session: cur },
                } = await supabase.auth.getSession();
                if (!cur?.user || cur.user.id !== userId) return;
                const fp = await fetchProfileWithStatus(userId).catch(() => ({ p: null, status: "error" as const }));
                if (fp.status === "ok" && fp.p) {
                  setProfile(fp.p);
                  localStorage.setItem("chamo_cached_profile", JSON.stringify(fp.p));
                }
              })();
            }, 2000);
            return;
          }
        }

        // Erro ou timeout de rede: mantém cache para não “apagar” o perfil à toa.
        if (!p) {
          let recovered: Profile | null = null;
          try {
            const raw = localStorage.getItem("chamo_cached_profile");
            if (raw) {
              const c = JSON.parse(raw) as Profile;
              if (c.user_id === userId) recovered = c;
            }
          } catch {
            /* ignore */
          }
          if (recovered) {
            setProfile(recovered);
            try {
              const rr = localStorage.getItem("chamo_cached_roles");
              setRoles(rr ? (JSON.parse(rr) as AppRole[]) : []);
            } catch {
              setRoles([]);
            }
            window.setTimeout(() => {
              void (async () => {
                const {
                  data: { session: cur },
                } = await supabase.auth.getSession();
                if (!cur?.user || cur.user.id !== userId) return;
                const p2 = await fetchProfile(userId).catch(() => null);
                if (p2) {
                  setProfile(p2);
                  localStorage.setItem("chamo_cached_profile", JSON.stringify(p2));
                }
              })();
            }, 1800);
            return;
          }
          setProfile(null);
          setRoles([]);
          localStorage.removeItem("chamo_cached_profile");
          localStorage.removeItem("chamo_cached_roles");
          return;
        }

        setProfile(p);
        setRoles(r);
        localStorage.setItem("chamo_cached_profile", JSON.stringify(p));
        localStorage.setItem("chamo_cached_roles", JSON.stringify(r));
      } catch (e) {
        console.error("Erro ao carregar dados de auth:", e);
      }
    })();
  };

  useEffect(() => {
    const safetyTimeout = setTimeout(() => setLoading(false), 10000);

    const syncRealtimeJwt = (sess: Session | null) => {
      try {
        const token = sess?.access_token ?? null;
        if (token) void supabase.realtime.setAuth(token);
        else void supabase.realtime.setAuth(null);
      } catch {
        /* ignore */
      }
    };

    const loadInitialSession = async () => {
      try {
        let s = (await supabase.auth.getSession()).data.session;
        syncRealtimeJwt(s ?? null);
        if (s?.user) {
          loadUserData(s);
          return;
        }
        // Nativo: após OAuth o Preferences pode atrasar vs 1ª leitura — antes dávamos loadUserData(null)
        // e o PostLoginGate mandava o utilizador de volta para /login com sessão já gravada.
        if (Capacitor.isNativePlatform()) {
          for (let i = 0; i < 20; i++) {
            await new Promise((r) => setTimeout(r, 150));
            s = (await supabase.auth.getSession()).data.session;
            if (s?.user) {
              syncRealtimeJwt(s);
              loadUserData(s);
              return;
            }
          }
          syncRealtimeJwt(null);
          loadUserData(null);
        } else {
          loadUserData(null);
        }
      } catch (e) {
        console.error("Erro ao carregar sessão inicial:", e);
        setLoading(false);
      }
    };

    /** Query + fragment (Supabase envia tokens no #). */
    const collectParamsFromDeepLink = (urlStr: string): Record<string, string> => {
      const out: Record<string, string> = {};
      const consume = (segment: string) => {
        if (!segment) return;
        const clean = segment.startsWith("?") || segment.startsWith("#") ? segment.slice(1) : segment;
        try {
          new URLSearchParams(clean).forEach((v, k) => {
            out[k] = v;
          });
        } catch {
          /* ignore */
        }
      };
      const q = urlStr.indexOf("?");
      const h = urlStr.indexOf("#");
      if (q >= 0) {
        const end = h > q ? h : urlStr.length;
        consume(urlStr.slice(q, end));
      }
      if (h >= 0) consume(urlStr.slice(h));
      return out;
    };

    /**
     * Link de confirmação de e-mail abre o app via `com.chamo.app://auth/email-confirm#access_token=…`.
     * (No nativo detectSessionInUrl está desligado — precisamos de setSession explícito.)
     */
    const handleEmailConfirmTokensUrl = async (urlStr: string): Promise<boolean> => {
      if (!Capacitor.isNativePlatform() || !urlStr) return false;
      if (!urlStr.includes("com.chamo.app://")) return false;
      const params = collectParamsFromDeepLink(urlStr);
      const access_token = params.access_token;
      const refresh_token = params.refresh_token;
      if (!access_token || !refresh_token) return false;
      const type = params.type || "";
      const allowed = ["signup", "email", "magiclink", "invite", "email_change", "recovery"];
      if (type && !allowed.includes(type)) return false;

      const { error } = await supabase.auth.setSession({ access_token, refresh_token });
      if (error) {
        console.error("[auth] email confirm setSession:", error.message);
        return false;
      }
      try {
        localStorage.removeItem("manual_login_intent");
      } catch {
        /* ignore */
      }
      const origin = window.location.origin || "";
      const hashRest = urlStr.includes("#") ? `#${urlStr.split("#").slice(1).join("#")}` : "";
      if (type === "recovery") {
        window.location.replace(`${origin}/reset-password${hashRest}`);
      } else {
        window.location.replace(`${origin}/post-login`);
      }
      return true;
    };

    const handleUrl = async (urlStr: string): Promise<boolean> => {
      if (!urlStr || !urlStr.includes('code=')) return false;
      let fixedUrl = urlStr.replace('#', '?');
      if (fixedUrl.startsWith('com.chamo.app:?')) fixedUrl = fixedUrl.replace('com.chamo.app:?', 'com.chamo.app://?');
      let code: string | null = null;
      try {
        const urlObj = new URL(fixedUrl);
        code = urlObj.searchParams.get('code');
      } catch (_) {
        const m = urlStr.match(/[?&]code=([^&?#]+)/);
        code = m ? decodeURIComponent(m[1]) : null;
      }
      code = normalizeOAuthCode(code);
      if (!code) return false;
      const now = Date.now();
      // Só ignorar reentrada do *mesmo* código (duplo appUrlOpen / launch URL repetido).
      if (lastProcessedCode === code) return false;
      if (isExchangingOAuth) return false;
      // No iOS, após falha redirecionamos para /login e getLaunchUrl continua devolvendo a mesma URL → loop. Ignorar código já tentado.
      if (Capacitor.isNativePlatform()) {
        try {
          const { value } = await Preferences.get({ key: OAUTH_FAILED_KEY });
          if (value) {
            const { code: failedCode, ts } = JSON.parse(value);
            const normalizedFailed = normalizeOAuthCode(failedCode);
            if (normalizedFailed && normalizedFailed === code && now - ts < OAUTH_FAILED_CODE_TTL_MS) return false;
          }
        } catch (_) {}
      }
      lastProcessedCode = code;
      isExchangingOAuth = true;
      let exchangeOk = false;
      try {
        await Browser.close().catch(() => {}); // Safari já fechado → "No active window" é esperado, ignorar
        const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        // Algumas vezes o exchange retorna ok sem session (ex.: storage native ainda persistindo).
        // Antes de assumir falha, tenta getSession() por ~2s — se já existir, consideramos sucesso.
        let liveSession = exchangeData?.session ?? null;
        if (!exchangeError && !liveSession) {
          for (let i = 0; i < 10; i++) {
            const { data } = await supabase.auth.getSession();
            if (data?.session) { liveSession = data.session; break; }
            await new Promise((r) => setTimeout(r, 200));
          }
        }
        if (exchangeError) {
          console.error("[OAuth] exchange error:", exchangeError.message);
          lastProcessedCode = null;
          if (Capacitor.isNativePlatform()) {
            await Preferences.set({ key: OAUTH_FAILED_KEY, value: JSON.stringify({ code: normalizeOAuthCode(code) ?? code, ts: Date.now() }) }).catch(() => {});
          }
        } else if (liveSession) {
          exchangeOk = true;
          await Preferences.remove({ key: OAUTH_FAILED_KEY }).catch(() => {});
          // Se veio de cadastro OAuth (Signup), limpa a flag assim que a troca foi bem sucedida para evitar
          // que o PostLoginGate force /signup → signOut em contas com profile já completo (race condition).
          try {
            const hadFlag = localStorage.getItem("signup_in_progress") === "true";
            if (hadFlag) {
              // Mantemos a flag apenas se o user realmente for "pending_signup". O PostLoginGate lida com isso
              // consultando o profile; aqui a removemos para que users existentes (login via botão do Signup)
              // não sejam jogados pra /signup indevidamente.
              const { data: row } = await supabase
                .from("profiles")
                .select("user_type")
                .eq("user_id", liveSession.user.id)
                .maybeSingle();
              const ut = (row as { user_type?: string } | null)?.user_type;
              if (ut && ut !== "pending_signup") {
                localStorage.removeItem("signup_in_progress");
              }
            }
          } catch { /* best-effort */ }
          const isEmailConfirmLink = /email-confirm/i.test(urlStr);
          if (isEmailConfirmLink) {
            // Confirmação de e-mail (PKCE com ?code=): não usar flags de OAuth + reload da Home (evita +5s).
            try {
              localStorage.removeItem("manual_login_intent");
              window.location.replace("/post-login");
            } catch {
              /* ignore */
            }
          } else if (Capacitor.isNativePlatform()) {
            // Apple/Google: full-page para /post-login. O SPA em /login falhava (corrida storage vs React,
            // proceedToRedirect lento, SIGNED_IN vs flags de hard-reload) — o utilizador ficava na login até reabrir a app.
            try {
              localStorage.removeItem("manual_login_intent");
              localStorage.removeItem("chamo_force_hard_reload");
              localStorage.removeItem("chamo_oauth_just_landed");
              sessionStorage.removeItem("chamo_oauth_just_landed");
              sessionStorage.setItem("chamo_hang_reload_grace_until", String(Date.now() + 120_000));
              sessionStorage.removeItem("chamo_featured_reload_after_oauth");
            } catch {
              /* ignore */
            }
            try {
              window.location.replace("/post-login");
            } catch {
              /* ignore */
            }
          } else {
            try {
              sessionStorage.setItem("chamo_oauth_just_landed", "1");
              localStorage.setItem("chamo_oauth_just_landed", "1");
              localStorage.setItem("chamo_force_hard_reload", "1");
            } catch {
              /* ignore */
            }
          }
        }
      } catch (e) {
        console.error("[OAuth] Deep link error:", e);
        lastProcessedCode = null;
        if (Capacitor.isNativePlatform()) {
          await Preferences.set({ key: OAUTH_FAILED_KEY, value: JSON.stringify({ code: normalizeOAuthCode(code) ?? code, ts: Date.now() }) }).catch(() => {});
        }
      } finally {
        isExchangingOAuth = false;
        if (Capacitor.getPlatform() === 'ios') {
          const path = window.location.pathname || '';
          const alreadyOnLogin = path.includes('login');
          if (exchangeOk) {
            // Igual ao Google: não navegar daqui; a página de Login reage a session?.user e redireciona
          } else if (!alreadyOnLogin) {
            setTimeout(() => {
              try {
                window.location.replace((window.location.origin || '') + '/login');
              } catch (_) {}
            }, 1200);
          } else {
            window.dispatchEvent(new CustomEvent('chamo-oauth-done', { detail: { success: false } }));
          }
        }
      }
      return exchangeOk;
    };

    let subscription: { unsubscribe?: () => void } | null = null;
    let urlListener: any = null;

    const run = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          const launch = await CapacitorApp.getLaunchUrl();
          const url = launch?.url;
          if (url) {
            if (await handleEmailConfirmTokensUrl(url)) return;
            if (url.includes("code=")) {
              // Pode ser retorno do nosso próprio redirect após login ok (página recarregou em /home).
              // Se já temos sessão, não trocar o código de novo (evita erro e tela branca).
              const {
                data: { session: existing },
              } = await supabase.auth.getSession();
              if (existing?.user) {
                await loadInitialSession();
                return;
              }
              await handleUrl(url);
              await loadInitialSession();
              return;
            }
          }
        } catch (_) {}
      }
      await loadInitialSession();
    };

    run();

    const { data: { subscription: sub } } = supabase.auth.onAuthStateChange((event, sess) => {
      syncRealtimeJwt(sess ?? null);
      try {
        console.log("🔐 Auth Event:", event);
        if (event === 'SIGNED_OUT') {
          resetOAuthGuardsAfterSignOut();
          setUser(null);
          setSession(null);
          setProfile(null);
          setRoles([]);
          localStorage.removeItem("chamo_cached_profile");
          localStorage.removeItem("chamo_cached_roles");
          try {
            sessionStorage.removeItem("chamo_featured_reload_after_oauth");
            sessionStorage.removeItem("chamo_oauth_just_landed");
            sessionStorage.removeItem("chamo_hang_reload_grace_until");
          } catch (_) {}
          setLoading(false);
        } else if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && sess?.user) {
            setIsSignOutInProgress(false);
          }
          // Refresh de token não deve refazer fetch do perfil: em rede lenta o timeout apagava profile/cache e “quebrava” a Home.
          if (event === "TOKEN_REFRESHED") {
            if (sess) {
              setSession(sess);
              setUser(sess.user);
            }
            setLoading(false);
            void (async () => {
              const { error } = await supabase.auth.getUser();
              if (error && isFatalAuthUserError(error)) await exitSessionToLanding();
            })();
          } else {
            loadUserData(sess ?? null);
          }

          // Evita hard-reload por “hang” nos 2 min após login (iOS reprocessaria oauth?code= e trava).
          if (event === "SIGNED_IN" && Capacitor.isNativePlatform()) {
            try {
              sessionStorage.setItem("chamo_hang_reload_grace_until", String(Date.now() + 120_000));
            } catch (_) {}
          }

          // iOS pós-OAuth (Apple/Google via deep link): faz hard reload APENAS quando uma flag mandar.
          // Isso evita piscar em loops e impede reloads em logins normais.
          if (event === "SIGNED_IN" && Capacitor.getPlatform() === "ios") {
            try {
              // O SIGNED_IN pode chegar antes da flag ser gravada (race do exchange). Por isso rechecamos após um pequeno delay.
              const doneKey = "chamo_ios_post_oauth_hard_reload_done";
              if (localStorage.getItem(doneKey) === "1") return;
              localStorage.setItem(doneKey, "1");

              const clearOAuthReloadFlags = () => {
                try {
                  localStorage.removeItem("chamo_force_hard_reload");
                  localStorage.removeItem("chamo_oauth_just_landed");
                  sessionStorage.removeItem("chamo_oauth_just_landed");
                  localStorage.removeItem(doneKey);
                } catch (_) {}
              };

              const tryHardReload = () => {
                try {
                  const flagKey = "chamo_force_hard_reload";
                  const should =
                    localStorage.getItem(flagKey) === "1" ||
                    localStorage.getItem("chamo_oauth_just_landed") === "1" ||
                    sessionStorage.getItem("chamo_oauth_just_landed") === "1";
                  if (!should) {
                    localStorage.removeItem(doneKey);
                    return;
                  }
                  // Já está na Home (ou fluxo pós-login em SPA): NUNCA dar hard reload —
                  // o timer de 350ms disparava depois que o usuário já via o tutorial e parecia "bug ao pular".
                  const p = (window.location.pathname || "").toLowerCase();
                  if (
                    p === "/home" ||
                    p.startsWith("/home/") ||
                    p === "/post-login" ||
                    p === "/signup" ||
                    p === "/complete-signup"
                  ) {
                    clearOAuthReloadFlags();
                    return;
                  }
                  localStorage.removeItem(flagKey);
                  const origin = window.location.origin || "";
                  window.location.replace(origin + "/hard-reload?to=%2Fhome");
                } catch (_) {
                  try { localStorage.removeItem(doneKey); } catch (_) {}
                }
              };

              tryHardReload();
              setTimeout(tryHardReload, 350);
            } catch (_) {}
          }
        }
      } catch (e) {
        console.error("Erro no listener de auth:", e);
        setLoading(false);
      }
    });
    subscription = sub;

    if (Capacitor.isNativePlatform()) {
      urlListener = CapacitorApp.addListener("appUrlOpen", async (data: { url: string }) => {
        if (await handleEmailConfirmTokensUrl(data.url)) return;
        const exchangeOk = await handleUrl(data.url);
        // Igual ao fluxo com getLaunchUrl: o exchange grava no storage mas o SIGNED_IN no contexto pode atrasar no iOS;
        // força loadUserData para não ficar preso na tela de login até reabrir o app.
        if (exchangeOk) {
          const { data: { session: s } } = await supabase.auth.getSession();
          if (s?.user) loadUserData(s);
        }
      });
    }

    return () => {
      clearTimeout(safetyTimeout);
      subscription?.unsubscribe?.();
      if (urlListener) urlListener.then((l: any) => l.remove());
    };
  }, [isSignOutInProgress, exitSessionToLanding]);

  // ─── Force-logout em tempo real ─────────────────────────────────────────────
  // Quando um admin executa "Excluir usuário" no painel, o backend já chama
  // auth.admin.signOut + auth.admin.deleteUser e remove a linha em `profiles`.
  // Aqui o app escuta o DELETE do próprio profile via Realtime e desloga
  // imediatamente, sem precisar esperar o foreground/refresh de token.
  // Requer REPLICA IDENTITY FULL em public.profiles (migration realtime_profile_kick).
  useEffect(() => {
    const uid = user?.id;
    if (!uid) return;
    const channel = supabase
      .channel(`profile-kick-${uid}`)
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "profiles", filter: `user_id=eq.${uid}` },
        async () => {
          console.log("🛑 Profile deleted remotely → force logout");
          await exitSessionToLanding();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, exitSessionToLanding]);

  const signOut = async () => {
    setIsSignOutInProgress(true);
    resetOAuthGuardsAfterSignOut();
    try {
      // Limpeza do mapeamento do dispositivo para evitar que notificações do usuário anterior continuem chegando
      // quando o mesmo celular faz login em outra conta.
      const deviceId = localStorage.getItem("chamo_device_id");
      const currentUserId = user?.id;
      try {
        if (currentUserId && deviceId) {
          await supabase
            .from("user_devices")
            .delete()
            .eq("user_id", currentUserId)
            .eq("device_id", deviceId);
        }
      } catch (e) {
        // Não bloqueia logout se a limpeza falhar (RLS/latência). O importante é sair da sessão.
        console.warn("[signOut] Falha ao limpar user_devices:", e);
      }

      // Limpar apenas chaves relacionadas ao auth (não todas as chaves do localStorage)
      const authKeys = [
        "chamo_cached_profile",
        "chamo_cached_roles",
        "signup_in_progress",
        "manual_login_intent",
        "chamo_oauth_just_landed",
        "chamo_featured_reload_after_oauth",
        "chamo_hang_reload_grace_until",
        `sb-${import.meta.env.VITE_SUPABASE_URL?.split("//")[1]?.split(".")[0]}-auth-token`,
      ];
      authKeys.forEach((k) => localStorage.removeItem(k));
      try {
        localStorage.removeItem("chamo_ios_post_oauth_hard_reload_done");
        sessionStorage.removeItem("chamo_featured_reload_after_oauth");
        sessionStorage.removeItem("chamo_oauth_just_landed");
        sessionStorage.removeItem("chamo_hang_reload_grace_until");
      } catch (_) {}
      await supabase.auth.signOut();
      await hardClearNativeAuthSession();
      setUser(null);
      setSession(null);
      setProfile(null);
      setRoles([]);
      setTimeout(() => setIsSignOutInProgress(false), 1000);
    } catch (error) {
      setIsSignOutInProgress(false);
    }
  };

  // Depender só de user.id: o objeto `user` do Supabase muda a cada refresh de token e recriava estes
  // callbacks — efeitos como PostLoginGate (deps em refreshProfile) cancelavam o retry infinitamente.
  const userId = user?.id ?? null;
  /** `forUserId`: usar após OAuth quando `session.user` já existe mas `user` no contexto ainda não (evita gate preso em "Verificando…"). */
  const refreshProfile = useCallback(async (forUserId?: string) => {
    const uid = forUserId ?? userId;
    if (!uid) return;
    const p = await fetchProfile(uid);
    if (p) {
      setProfile(p);
      localStorage.setItem("chamo_cached_profile", JSON.stringify(p));
    }
  }, [userId]);

  const refreshRoles = useCallback(async (forUserId?: string) => {
    const uid = forUserId ?? userId;
    if (!uid) return;
    const r = await fetchRoles(uid);
    setRoles(r);
    localStorage.setItem("chamo_cached_roles", JSON.stringify(r));
  }, [userId]);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        roles,
        isAdmin,
        loading,
        signOut,
        exitSessionToLanding,
        refreshProfile,
        refreshRoles,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}