import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export function useAdminAuth() {
  const navigate = useNavigate();
  const [adminUser, setAdminUser] = useState<{ id: string; email: string; role: string } | null>(null);
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

      const adminRole = roles?.find((r: any) =>
        ["super_admin", "finance_admin", "support_admin", "sponsor_admin", "moderator"].includes(r.role)
      );

      if (!adminRole) {
        await supabase.auth.signOut();
        navigate("/login");
        return;
      }

      setAdminUser({
        id: session.user.id,
        email: session.user.email || "",
        role: adminRole.role,
      });
      setLoading(false);
    };
    check();
  }, [navigate]);

  return { adminUser, loading };
}
