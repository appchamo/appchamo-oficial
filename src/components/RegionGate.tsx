// Bloqueia o uso do app para usuários fora da região permitida (cidade/raio),
// quando a trava está ativada no admin. Desligado por padrão.
// Staff (admin/suporte) nunca é bloqueado. Quem não concluiu o cadastro também
// não é bloqueado aqui (a trava ocorre na tela de cadastro). Modo estrito:
// usuário concluído sem prova de localização é bloqueado.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fetchRegionGate, checkRegion } from "@/lib/regionGate";
import { MapPin } from "lucide-react";

const STAFF = ["admin@appchamo.com", "suporte@appchamo.com"];

export default function RegionGate() {
  const { user, loading } = useAuth();
  const [blocked, setBlocked] = useState(false);
  const [reason, setReason] = useState("");

  const email = (user?.email || "").toLowerCase().trim();
  const isStaff = STAFF.includes(email);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (loading || !user || isStaff) { setBlocked(false); return; }
      try {
        const cfg = await fetchRegionGate();
        if (!cfg.enabled || !cfg.blockApp) { if (!cancelled) setBlocked(false); return; }
        const { data: prof } = await supabase
          .from("profiles")
          .select("address_city, latitude, longitude, signup_completed_at")
          .eq("user_id", user.id)
          .maybeSingle();
        const p = (prof || {}) as { address_city?: string | null; latitude?: number | null; longitude?: number | null; signup_completed_at?: string | null };
        // Quem ainda não concluiu o cadastro não é bloqueado aqui: a trava de
        // região acontece na própria tela de cadastro (ao informar a cidade).
        if (!p.signup_completed_at) { if (!cancelled) setBlocked(false); return; }
        const check = checkRegion(cfg, { city: p.address_city, lat: p.latitude ?? null, lng: p.longitude ?? null });
        if (!cancelled) { setBlocked(!check.allowed); setReason(check.reason); }
      } catch {
        if (!cancelled) setBlocked(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, loading, isStaff]);

  if (!blocked) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-background flex items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <MapPin className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-xl font-bold text-foreground mb-2">Fora da área de atendimento</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {reason || "O Chamô ainda não está disponível na sua região."}
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
