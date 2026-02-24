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

  // ✅ ADICIONADO: Trava de estado para ignorar sessões fantasmas durante o logout
  const [isSignOutInProgress, setIsSignOutInProgress] = useState(false);

  const isAdmin = useMemo(() => {
    return roles.some((r) => String(r).endsWith("_admin"));
  }, [roles]);

  const loadUserData = async (sess: Session | null) => {
    // 🛑 REGRA DE OURO: Se houver intenção manual de login ou logout ativo, não carregue os dados.
    // Isso impede as chamadas automáticas que você viu no Network.
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
    
    // Verificação dupla antes de preencher o estado para garantir que não houve logout no meio do processo
    if (!isSignOutInProgress) {
      setProfile(p);
      setRoles(r);
    }

    setLoading(false);
  };

  useEffect(() => {
    // 1) sessão inicial - Só carrega se não houver intenção manual de estar na tela de login
    const isManualIntent = localStorage.getItem("manual_login_intent") === "true";
    if (!isManualIntent) {
      supabase.auth.getSession().then(({ data: { session: s } }) => {
        loadUserData(s);
      });
    } else {
      setLoading(false);
    }

    // 2) mudanças de auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      // Se o usuário saiu explicitamente, limpamos tudo e paramos aqui
      if (_event === 'SIGNED_OUT') {
        setUser(null);
        setSession(null);
        setProfile(null);
        setRoles([]);
        setLoading(false);
        return;
      }

      // 🛑 Só dispara o carregamento se não estivermos saindo ou em modo manual
      const manualMode = localStorage.getItem("manual_login_intent") === "true";
      if (!isSignOutInProgress && !manualMode) {
        setTimeout(() => loadUserData(sess), 0);
      }
    });

    return () => subscription.unsubscribe();
  }, [isSignOutInProgress]);

  const signOut = async () => {
    // Ativa a trava imediatamente
    setIsSignOutInProgress(true);
    
    try {
      // Remove a flag de progresso de cadastro
      localStorage.removeItem("signup_in_progress");
      
      await supabase.auth.signOut();

      // Limpa os estados locais
      setUser(null);
      setSession(null);
      setProfile(null);
      setRoles([]);
      
      // ✅ Mantém a trava por 1 segundo para o cache do navegador limpar
      setTimeout(() => setIsSignOutInProgress(false), 1000);
    } catch (error) {
      console.error("Erro ao deslogar:", error);
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