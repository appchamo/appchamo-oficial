import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

/**
 * Trava de verificacao de WhatsApp (obrigatoria).
 * Redireciona para /verificar-whatsapp quem ainda nao confirmou o numero.
 * So vale para contas criadas a partir do lancamento (CUTOFF) — a base antiga nao e forcada.
 */
const CUTOFF = new Date("2026-08-17T00:00:00Z").getTime();

// Rotas onde a trava NAO deve agir (evita loop e nao atrapalha auth/cadastro).
const EXEMPT_PREFIXES = ["/verificar-whatsapp", "/login", "/signup", "/reset-password", "/auth", "/admin"];

const PhoneVerificationGuard = () => {
  const { profile, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading || !profile || isAdmin) return;
    const path = location.pathname || "/";
    if (EXEMPT_PREFIXES.some((p) => path.startsWith(p))) return;

    const isNew = profile.created_at ? new Date(profile.created_at).getTime() >= CUTOFF : false;
    if (!isNew) return; // base antiga: nao forca
    if (profile.phone_verified) return; // ja confirmou

    navigate("/verificar-whatsapp", { replace: true });
  }, [loading, profile, isAdmin, location.pathname, navigate]);

  return null;
};

export default PhoneVerificationGuard;
