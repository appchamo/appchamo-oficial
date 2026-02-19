import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        <h1 className="mb-2 text-5xl font-extrabold text-gradient">404</h1>
        <p className="mb-4 text-base text-muted-foreground">Página não encontrada</p>
        <Link to="/home" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors">
          Voltar para o Início
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
