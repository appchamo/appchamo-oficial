import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import CategoriesGrid from "@/components/CategoriesGrid";

const Categories = () => {
  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5">
        <Link
          to="/home"
          className="inline-flex items-center gap-2 text-sm font-semibold text-foreground bg-card border border-border/80 hover:border-primary/30 hover:bg-muted/50 px-3 py-2 rounded-xl mb-4 transition-colors shadow-sm"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden />
          Voltar
        </Link>
        <h1 className="text-xl font-bold text-foreground mb-4">Categorias</h1>
        <CategoriesGrid />
      </main>
    </AppLayout>
  );
};

export default Categories;
