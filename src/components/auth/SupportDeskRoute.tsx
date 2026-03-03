import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const SUPPORT_EMAIL = "suporte@appchamo.com";

export default function SupportDeskRoute({ children }: { children: JSX.Element }) {
  const { session, user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const email = (user?.email || "").toLowerCase().trim();
  if (email !== SUPPORT_EMAIL) {
    return <Navigate to="/home" replace />;
  }

  return children;
}
