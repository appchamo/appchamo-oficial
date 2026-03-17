import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Preferences } from "@capacitor/preferences";

interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  cpf: string | null;
  cnpj: string | null;
  avatar_url: string | null;
  user_type: string;
  is_blocked: boolean;
  accepted_terms_version: string | null;
  job_posting_enabled?: boolean;
  /** male | female | prefer_not_say – usado para "Bem-vindo(a)" na Home */
  gender?: string | null;
  address_city?: string | null;
  address_state?: string | null;
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
  refreshProfile: () => Promise<void>;
  refreshRoles: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  roles: [],
  isAdmin: false,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
  refreshRoles: async () => {},
});

export const useAuth = () => useContext(AuthContext);

// 🛡️ Trava para evitar processamento duplicado (AbortError: Lock broken)
let lastProcessedCode: string | null = null;
let isExchangingOAuth = false;
const OAUTH_COOLDOWN_MS = 60000; // 1 min — só processa o primeiro callback; ignora segundo se usuário abriu o browser de novo
const OAUTH_FAILED_CODE_TTL_MS = 300000; // 5 min — não reprocessar código que já falhou (evita loop no iOS)
export const OAUTH_FAILED_KEY = "chamo_oauth_failed";
let lastOAuthProcessedAt = 0;

/** Código na URL pode vir com ? ou # no final (ex.: ...code=xxx#); normalizar para comparar/salvar. */
function normalizeOAuthCode(code: string | null): string | null {
  if (!code || typeof code !== "string") return null;
  return code.replace(/[?#\s]+$/g, "").trim() || null;
}

async function fetchProfile(userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, user_id, full_name, email, phone, cpf, cnpj, avatar_url, user_type, is_blocked, job_posting_enabled, gender, address_city, address_state")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return null;
  return data as Profile;
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

  const loadUserData = (sess: Session | null) => {
    if (isSignOutInProgress) return;

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
        let [p, r] = await Promise.all([fetchProfile(userId), fetchRoles(userId)]);

        if (isSignOutInProgress) return;
        if (p?.user_type === "pending_signup") {
          await supabase.from("profiles").update({ user_type: "client" }).eq("user_id", userId);
          p = { ...p, user_type: "client" } as Profile;
        }

        if (p) {
          setProfile(p);
          setRoles(r);
          localStorage.setItem("chamo_cached_profile", JSON.stringify(p));
          localStorage.setItem("chamo_cached_roles", JSON.stringify(r));
        }
      } catch (e) {
        console.error("Erro ao carregar dados de auth:", e);
      }
    })();
  };

  useEffect(() => {
    const safetyTimeout = setTimeout(() => setLoading(false), 10000);

    const loadInitialSession = async () => {
      try {
        const { data: { session: s } } = await supabase.auth.getSession();
        if (s) {
          loadUserData(s);
          return;
        }
        if (Capacitor.isNativePlatform()) {
          await new Promise((r) => setTimeout(r, 300));
          const { data: { session: s2 } } = await supabase.auth.getSession();
          loadUserData(s2 ?? null);
        } else {
          loadUserData(null);
        }
      } catch (e) {
        console.error("Erro ao carregar sessão inicial:", e);
        setLoading(false);
      }
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
      if (now - lastOAuthProcessedAt < OAUTH_COOLDOWN_MS) return false;
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
      lastOAuthProcessedAt = now;
      isExchangingOAuth = true;
      let exchangeOk = false;
      try {
        await Browser.close().catch(() => {}); // Safari já fechado → "No active window" é esperado, ignorar
        const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          console.error("[OAuth] exchange error:", exchangeError.message);
          lastProcessedCode = null;
          if (Capacitor.isNativePlatform()) {
            await Preferences.set({ key: OAUTH_FAILED_KEY, value: JSON.stringify({ code: normalizeOAuthCode(code) ?? code, ts: Date.now() }) }).catch(() => {});
          }
        } else if (exchangeData?.session) {
          exchangeOk = true;
          await Preferences.remove({ key: OAUTH_FAILED_KEY }).catch(() => {});
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
            try {
              sessionStorage.setItem('chamo_oauth_just_landed', '1');
            } catch (_) {}
            setTimeout(() => {
              try {
                window.location.replace((window.location.origin || '') + '/home');
              } catch (_) {}
            }, 1200);
          } else if (!alreadyOnLogin) {
            setTimeout(() => {
              try {
                window.location.replace((window.location.origin || '') + '/login');
              } catch (_) {}
            }, 1200);
          } else {
            // Ficamos na Login com loading=true → dispara evento para a tela desbloquear "Entrando..."
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
          if (url && url.includes('code=')) {
            // Pode ser retorno do nosso próprio redirect após login ok (página recarregou em /home).
            // Se já temos sessão, não trocar o código de novo (evita erro e tela branca).
            const { data: { session: existing } } = await supabase.auth.getSession();
            if (existing?.user) {
              await loadInitialSession();
              return;
            }
            await handleUrl(url);
            await loadInitialSession();
            return;
          }
        } catch (_) {}
      }
      await loadInitialSession();
    };

    run();

    const { data: { subscription: sub } } = supabase.auth.onAuthStateChange((event, sess) => {
      try {
        console.log("🔐 Auth Event:", event);
        if (event === 'SIGNED_OUT') {
          setUser(null);
          setSession(null);
          setProfile(null);
          setRoles([]);
          localStorage.removeItem("chamo_cached_profile");
          localStorage.removeItem("chamo_cached_roles");
          setLoading(false);
        } else if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          loadUserData(sess ?? null);
        }
      } catch (e) {
        console.error("Erro no listener de auth:", e);
        setLoading(false);
      }
    });
    subscription = sub;

    if (Capacitor.isNativePlatform()) {
      urlListener = CapacitorApp.addListener('appUrlOpen', (data: { url: string }) => handleUrl(data.url));
    }

    return () => {
      clearTimeout(safetyTimeout);
      subscription?.unsubscribe?.();
      if (urlListener) urlListener.then((l: any) => l.remove());
    };
  }, [isSignOutInProgress]);

  const signOut = async () => {
    setIsSignOutInProgress(true);
    try {
      localStorage.clear();
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
      setProfile(null);
      setRoles([]);
      setTimeout(() => setIsSignOutInProgress(false), 1000);
    } catch (error) {
      setIsSignOutInProgress(false);
    }
  };

  const refreshProfile = async () => {
    if (!user) return;
    const p = await fetchProfile(user.id);
    if (p) {
      setProfile(p);
      localStorage.setItem("chamo_cached_profile", JSON.stringify(p));
    }
  };

  const refreshRoles = async () => {
    if (!user) return;
    const r = await fetchRoles(user.id);
    setRoles(r);
    localStorage.setItem("chamo_cached_roles", JSON.stringify(r));
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, roles, isAdmin, loading, signOut, refreshProfile, refreshRoles }}>
      {children}
    </AuthContext.Provider>
  );
}