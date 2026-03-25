import { Navigate, useParams } from "react-router-dom";

/**
 * Links antigos `/agendar/:proKey` redirecionam para o perfil público.
 * O cliente agenda pelo botão "Agendar serviço" em `/professional/:proKey`.
 */
export default function PublicAgenda() {
  const { proKey } = useParams<{ proKey: string }>();
  if (!proKey) return <Navigate to="/" replace />;
  return <Navigate to={`/professional/${encodeURIComponent(proKey)}`} replace />;
}
