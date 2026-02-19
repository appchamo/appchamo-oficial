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

  const isAdmin = useMemo(() => {
    // "admin total" = qualquer role *_admin
    return roles.some((r) => String(r).endsWith("_admin"));
  }, [roles]);

  const loadUserData = async (sess: Session | null) => {
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
    setProfile(p);
    setRoles(r);

    setLoading(false);
  };

  useEffect(() => {
    // 1) sessão inicial
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      loadUserData(s);
    });

    // 2) mudanças de auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      // evita “travada” de setState sincronamente
      setTimeout(() => loadUserData(sess), 0);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRoles([]);
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
