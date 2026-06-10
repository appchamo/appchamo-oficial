/**
 * Conteúdo do tab "Perfil".
 * - Profissional/Empresa: abre o próprio perfil público (editável inline).
 * - Cliente/Patrocinador: a tela de conta/configurações de sempre.
 */
import { useAuth } from "@/hooks/useAuth";
import ProfileSettings from "@/pages/Profile";
import ProfessionalProfile from "@/pages/ProfessionalProfile";

export default function ProfileTabRoute() {
  const { profile, loading } = useAuth();
  const isPro = profile?.user_type === "professional" || profile?.user_type === "company";
  // Enquanto o perfil carrega, mostra a tela de conta (evita flicker/decisão errada)
  if (loading) return <ProfileSettings />;
  return isPro ? <ProfessionalProfile ownMode /> : <ProfileSettings />;
}
