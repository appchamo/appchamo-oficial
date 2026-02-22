import AppLayout from "@/components/AppLayout";
import { Search as SearchIcon, SlidersHorizontal, Star, BadgeCheck, Building2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const Search = () => {
  const [search, setSearch] = useState("");
  const [pros, setPros] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros Básicos
  const [filterCategory, setFilterCategory] = useState("");
  const [filterMinRating, setFilterMinRating] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Busca Categorias
      const { data: cats } = await supabase.from("categories").select("id, name");
      setCategories(cats || []);

      // 2. Busca Profissionais com Joins para Nome e Foto
      const { data: professionals } = await supabase
        .from("professionals")
        .select(`
          *,
          profiles:user_id (full_name, avatar_url, address_city),
          subscriptions:user_id (plan_id)
        `)
        .eq("active", true)
        .eq("profile_status", "approved");

      if (professionals) {
        setPros(professionals.map(p => ({
          ...p,
          full_name: (p.profiles as any)?.full_name || "Profissional",
          avatar_url: (p.profiles as any)?.avatar_url || null,
          city: (p.profiles as any)?.address_city || "",
          plan_id: (p.subscriptions as any)?.[0]?.plan_id || "free"
        })));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Lógica de Filtro Simples
  const filtered = pros.filter(p => {
    const nameMatch = p.full_name.toLowerCase().includes(search.toLowerCase());
    const catMatch = filterCategory === "" || p.category_id === filterCategory;
    const rateMatch = p.rating >= filterMinRating;
    return nameMatch && catMatch && rateMatch;
  });

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5 pb-24 text-foreground">
        {/* BUSCA */}
        <div className="relative mb-6">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar profissional..."
            className="w-full pl-12 pr-4 py-4 bg-card border-2 rounded-2xl outline-none"
          />
        </div>

        {/* FILTROS */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-bold">Todos os Profissionais</h1>
          <Sheet>
            <SheetTrigger asChild>
              <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-card border text-sm font-semibold">
                <SlidersHorizontal className="w-4 h-4" /> Filtros
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-3xl h-[50vh]">
              <SheetHeader><SheetTitle>Filtros</SheetTitle></SheetHeader>
              <div className="py-6 space-y-6">
                <div>
                  <label className="text-sm font-bold mb-2 block">Categoria</label>
                  <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="w-full p-3 rounded-xl border bg-background">
                    <option value="">Todas</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-bold mb-2 block">Avaliação Mínima</label>
                  <div className="flex gap-2">
                    {[1,2,3,4,5].map(star => (
                      <button key={star} onClick={() => setFilterMinRating(star)} className={`flex-1 py-2 rounded-lg border ${filterMinRating >= star ? 'bg-primary/10 border-primary' : ''}`}>
                        <Star className={`w-4 h-4 mx-auto ${filterMinRating >= star ? 'fill-primary text-primary' : ''}`} />
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={() => {setFilterCategory(""); setFilterMinRating(0);}} className="w-full py-3 text-primary font-bold">Limpar</button>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* LISTA */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1,2,3,4].map(i => <div key={i} className="h-28 bg-muted animate-pulse rounded-2xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map((pro) => (
              <Link key={pro.id} to={`/professional/${pro.id}`} className="flex items-center gap-4 bg-card border rounded-2xl p-4">
                <div className="w-14 h-14 rounded-full bg-muted overflow-hidden border-2 border-background flex-shrink-0">
                  {pro.avatar_url ? <img src={pro.avatar_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-bold text-muted-foreground">{pro.full_name[0]}</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="font-bold text-sm truncate">{pro.full_name}</p>
                    {pro.verified && <BadgeCheck className="w-4 h-4 text-primary" />}
                    {pro.plan_id === 'business' && <Building2 className="w-3.5 h-3.5 text-orange-500" />}
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <Star className="w-3 h-3 fill-primary text-primary" />
                    <span className="text-[10px] font-bold text-primary">{Number(pro.rating).toFixed(1)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </AppLayout>
  );
};

export default Search;