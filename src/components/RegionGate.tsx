// Bloqueia o uso do app para usuários fora da região permitida (cidade/raio),
// quando a trava está ativada no admin. Desligado por padrão.
// Staff (admin/suporte) nunca é bloqueado. Quem não concluiu o cadastro também
// não é bloqueado aqui (a trava ocorre na tela de cadastro). Modo estrito:
// usuário concluído sem prova de localização é bloqueado.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fetchRegionGate, checkRegion } from "@/lib/regionGate";
import { getDeviceLocation } from "@/lib/deviceLocation";
import { MapPin, Loader2 } from "lucide-react";

const STAFF = ["admin@appchamo.com", "suporte@appchamo.com"];

export default function RegionGate() {
  const { user, loading } = useAuth();
  const [blocked, setBlocked] = useState(false);
  const [reason, setReason] = useState("");
  const [checking, setChecking] = useState(false);

  const email = (user?.email || "").toLowerCase().trim();
  const isStaff = STAFF.includes(email);

  const runCheck = useCallback(async () => {
    if (loading || !user || isStaff) { setBlocked(false); return; }
    setChecking(true);
    try {
      const cfg = await fetchRegionGate();
      if (!cfg.enabled || !cfg.blockApp) { setBlocked(false); return; }
      const { data: prof } = await supabase
        .from("profiles")
        .select("address_city, signup_completed_at")
        .eq("user_id", user.id)
        .maybeSingle();
      const p = (prof || {}) as { address_city?: string | null; signup_completed_at?: string | null };
      // Quem ainda não concluiu o cadastro não é bloqueado aqui: a trava de
      // região acontece na própria tela de cadastro (ao exigir o GPS).
      if (!p.signup_completed_at) { setBlocked(false); return; }

      // GPS REAL do aparelho, a cada abertura. Sem permissão -> bloqueia.
      const loc = await getDeviceLocation();
      if (!loc.ok) {
        setReason(loc.error === "denied"
          ? "Ative a permissão de localização para usar o Chamô. Ele está disponível apenas em " + cfg.allowedCities.join(", ") + "."
          : "Não foi possível obter sua localização. Ative o GPS e tente novamente.");
        setBlocked(true);
        return;
      }
      // Salva a posição real (auditoria / fallback) sem travar caso falhe.
      try { await supabase.from("profiles").update({ latitude: loc.lat, longitude: loc.lng }).eq("user_id", user.id); } catch { /* */ }
      // Decisão pela posição real (raio). Cidade entra como cortesia adicional.
      const check = checkRegion(cfg, { city: p.address_city, lat: loc.lat, lng: loc.lng });
      setBlocked(!check.allowed);
      setReason(check.reason);
    } catch {
      // Erro de config/rede nunca trava (fail-open) — evita lockout por bug.
      setBlocked(false);
    } finally {
      setChecking(false);
    }
  }, [user, loading, isStaff]);

  useEffect(() => { void runCheck(); }, [runCheck]);

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
          onClick={() => { void runCheck(); }}
          disabled={checking}
          className="w-full rounded-xl bg-primary text-primary-foreground font-semibold py-3 mb-2 disabled:opacity-60 inline-flex items-center justify-center gap-2"
        >
          {checking ? <><Loader2 className="w-4 h-4 animate-spin" /> Verificando…</> : "Ativei a localização — tentar de novo"}
        </button>
        <button
          type="button"
          onClick={() => { void supabase.auth.signOut(); }}
          className="w-full rounded-xl border border-border text-foreground font-medium py-3"
        >
          Sair
        </button>
      </div>
    </div>
  );
}
