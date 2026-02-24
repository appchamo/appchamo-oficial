import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

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

async function fetchProfile(userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .single();

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
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  // ✅ ADICIONADO: Estado para controlar se estamos saindo
  const [isSignOutInProgress, setIsSignOutInProgress] = useState(false);

  const isAdmin = useMemo(() => {
    return roles.some((r) => String(r).endsWith("_admin"));
  }, [roles]);

  const loadUserData = async (sess: Session | null) => {
    // 🛑 REGRA DE OURO: Se estivermos em processo de logout ou intenção manual, ignore!
    const isManualIntent = localStorage.getItem("manual_login_intent") === "true";
    if (isSignOutInProgress || isManualIntent) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setSession(sess);
    setUser(sess?.user ?? null);

    if (!sess?.user) {
      setProfile(null);
      setRoles([]);
      setLoading(false);
      return;
    }

    const userId = sess.user.id;
    const [p, r] = await Promise.all([fetchProfile(userId), fetchRoles(userId)]);
    
    // Segunda checagem para evitar race conditions (conflito de velocidade)
    if (!isSignOutInProgress) {
      setProfile(p);
      setRoles(r);
    }

    setLoading(false);
  };

  useEffect(() => {
    // 1) sessão inicial
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      loadUserData(s);
    });

    // 2) mudanças de auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      // ✅ Se o evento for de saída, limpa tudo imediatamente
      if (_event === 'SIGNED_OUT') {
        setUser(null);
        setSession(null);
        setProfile(null);
        setRoles([]);
        setLoading(false);
        return;
      }

      // 🛑 Se estivermos deslogando ou com intenção manual, ignore o evento de SIGNED_IN reativo
      const isManualIntent = localStorage.getItem("manual_login_intent") === "true";
      if (!isSignOutInProgress && !isManualIntent) {
        setTimeout(() => loadUserData(sess), 0);
      }
    });

    return () => subscription.unsubscribe();
  }, [isSignOutInProgress]);

  const signOut = async () => {
    // ✅ Ativa a trava de segurança
    setIsSignOutInProgress(true);
    
    try {
      await supabase.auth.signOut();
      
      // Limpa estados locais
      setUser(null);
      setSession(null);
      setProfile(null);
      setRoles([]);
      
      // ✅ Limpa flags de cadastro
      localStorage.removeItem("signup_in_progress");
      
      // ✅ Libera a trava após 1 segundo (tempo pro Android WebView respirar)
      setTimeout(() => setIsSignOutInProgress(false), 1000);
    } catch (error) {
      console.error("Erro no signOut:", error);
      setIsSignOutInProgress(false);
    }
  };

  const refreshProfile = async () => {
    if (!user) return;
    const p = await fetchProfile(user.id);
    setProfile(p);
  };

  const refreshRoles = async () => {
    if (!user) return;
    const r = await fetchRoles(user.id);
    setRoles(r);
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