import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";

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

// 🛡️ Trava master fora do componente para evitar processamento duplicado em re-renders
let lastProcessedUrl = "";

// 🚀 OTIMIZAÇÃO: Seleciona apenas campos essenciais para navegação rápida
async function fetchProfile(userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, user_id, full_name, email, phone, avatar_url, user_type, is_blocked")
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
  
  // 🚀 OTIMIZAÇÃO: Cache do perfil
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

  const loadUserData = async (sess: Session | null) => {
    const isManualIntent = localStorage.getItem("manual_login_intent") === "true";
    
    if (isSignOutInProgress || isManualIntent) {
      setLoading(false);
      return;
    }

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

    try {
      const userId = sess.user.id;
      const [p, r] = await Promise.all([fetchProfile(userId), fetchRoles(userId)]);
      
      if (!isSignOutInProgress && p) {
        setProfile(p);
        setRoles(r);
        localStorage.setItem("chamo_cached_profile", JSON.stringify(p));
        localStorage.setItem("chamo_cached_roles", JSON.stringify(r));
      }
    } catch (e) {
      console.error("Erro ao carregar dados de auth:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const isManualIntent = localStorage.getItem("manual_login_intent") === "true";
    
    // 1) sessão inicial
    if (!isManualIntent) {
      supabase.auth.getSession().then(({ data: { session: s } }) => {
        loadUserData(s);
      });
    } else {
      setLoading(false);
    }

    // 2) mudanças de auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, sess) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setSession(null);
        setProfile(null);
        setRoles([]);
        localStorage.removeItem("chamo_cached_profile");
        localStorage.removeItem("chamo_cached_roles");
        setLoading(false);
        return;
      }

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        const manualMode = localStorage.getItem("manual_login_intent") === "true";
        if (!isSignOutInProgress && !manualMode) {
          loadUserData(sess);
        }
      }
    });

    // 3) Gestão de Deep Links (Apenas para Mobile) - NOVO AJUSTE
    let urlListener: any = null;
    if (Capacitor.isNativePlatform()) {
      const handleUrl = async (urlStr: string) => {
        // Bloqueia se for a mesma URL enviada em loop pelo iOS
        if (!urlStr || urlStr === lastProcessedUrl) return;
        if (!urlStr.includes('code=') && !urlStr.includes('access_token=')) return;

        lastProcessedUrl = urlStr;
        console.log("🚀 Deep Link processado no useAuth:", urlStr);

        let fixedUrl = urlStr.replace('#', '?');
        if (fixedUrl.startsWith('com.chamo.app:?')) {
          fixedUrl = fixedUrl.replace('com.chamo.app:?', 'com.chamo.app://?');
        }

        try {
          const urlObj = new URL(fixedUrl);
          const code = urlObj.searchParams.get('code');

          if (code) {
            // Fecha o navegador nativo (Safari) para o usuário voltar ao app
            await Browser.close().catch(() => {});
            
            const cleanCode = code.replace(/[^a-zA-Z0-9-]/g, '');
            const { data, error } = await supabase.auth.exchangeCodeForSession(cleanCode);
            
            if (error) {
              console.error("Erro na troca PKCE:", error.message);
            } else if (data.session) {
              // Se o login der certo, desativa o modo manual e carrega os dados
              localStorage.removeItem("manual_login_intent");
              loadUserData(data.session);
            }
          }
        } catch (e) {
          console.error("Falha ao processar URL nativa:", e);
        }
      };

      // Escuta URLs recebidas enquanto o app está aberto
      urlListener = CapacitorApp.addListener('appUrlOpen', (data) => handleUrl(data.url));
      
      // Verifica se o app foi aberto "frio" por um link
      CapacitorApp.getLaunchUrl().then(val => val?.url && handleUrl(val.url));
    }

    return () => {
      subscription.unsubscribe();
      if (urlListener) {
        urlListener.then((l: any) => l.remove());
      }
    };
  }, [isSignOutInProgress]);

  const signOut = async () => {
    setIsSignOutInProgress(true);
    try {
      localStorage.removeItem("signup_in_progress");
      localStorage.removeItem("chamo_cached_profile");
      localStorage.removeItem("chamo_cached_roles");
      
      await supabase.auth.signOut();

      setUser(null);
      setSession(null);
      setProfile(null);
      setRoles([]);
      
      setTimeout(() => setIsSignOutInProgress(false), 1000);
    } catch (error) {
      console.error("Erro ao deslogar:", error);
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
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        roles,
        isAdmin,
        loading,
        signOut,
        refreshProfile,
        refreshRoles,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}