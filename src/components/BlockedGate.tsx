// Bloqueia totalmente o uso do app para contas marcadas como is_blocked no admin.
// Verifica direto na tabela profiles (fonte da verdade), não só o cache do perfil.
// Staff (admin/suporte) nunca é bloqueado.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Ban } from "lucide-react";

const STAFF = ["admin@appchamo.com", "suporte@appchamo.com"];

export default function BlockedGate() {
  const { user, loading } = useAuth();
  const [blocked, setBlocked] = useState(false);

  const email = (user?.email || "").toLowerCase().trim();
  const isStaff = STAFF.includes(email);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (loading || !user || isStaff) { setBlocked(false); return; }
      try {
        const { data } = await supabase
          .from("profiles")
          .select("is_blocked")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!cancelled) setBlocked(((data as { is_blocked?: boolean } | null)?.is_blocked) === true);
      } catch {
        if (!cancelled) setBlocked(false); // erro nunca tranca (fail-open)
      }
    })();
    return () => { cancelled = true; };
  }, [user, loading, isStaff]);

  if (!blocked) return null;

  return (
    <div className="fixed inset-0 z-[300] bg-background flex items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
          <Ban className="w-8 h-8 text-destructive" />
        </div>
        <h1 className="text-xl font-bold text-foreground mb-2">Conta bloqueada</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Sua conta foi bloqueada por violar os termos de uso do Chamô. Se você acredita que isso é um engano, fale com o suporte.
        </p>
        <button
          type="button"
          onClick={() => { void supabase.auth.signOut(); }}
          className="w-full rounded-xl bg-primary text-primary-foreground font-semibold py-3"
        >
          Sair
        </button>
      </div>
    </div>
  );
}
