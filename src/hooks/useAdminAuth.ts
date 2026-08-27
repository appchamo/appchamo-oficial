import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const ADMIN_ROLES = ["super_admin", "finance_admin", "support_admin", "sponsor_admin", "moderator"];

export function useAdminAuth() {
  const navigate = useNavigate();
  const [adminUser, setAdminUser] = useState<{ id: string; email: string; role: string; roles: string[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/login");
        return;
      }
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id);

      const adminRoles = (roles || [])
        .map((r: any) => r.role as string)
        .filter((r) => ADMIN_ROLES.includes(r));

      if (adminRoles.length === 0) {
        await supabase.auth.signOut();
        navigate("/login");
        return;
      }

      // "role" primária pra compatibilidade (super_admin tem prioridade).
      const primary = adminRoles.includes("super_admin") ? "super_admin" : adminRoles[0];

      setAdminUser({
        id: session.user.id,
        email: session.user.email || "",
        role: primary,
        roles: adminRoles,
      });
      setLoading(false);
    };
    check();
  }, [navigate]);

  return { adminUser, loading };
}
