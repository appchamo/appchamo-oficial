import AppLayout from "@/components/AppLayout";
import CategoriesGrid from "@/components/CategoriesGrid";

const Categories = () => {
  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5">
        <h1 className="text-xl font-bold text-foreground mb-4">Categorias</h1>
        <CategoriesGrid />
      </main>
    </AppLayout>
  );
};

export default Categories;
