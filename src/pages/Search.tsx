import AppLayout from "@/components/AppLayout";
import { Search as SearchIcon, SlidersHorizontal, Star, BadgeCheck, X, MapPin, Filter, CheckCircle2 } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { fuzzyMatch } from "@/lib/fuzzyMatch";

interface Pro {
  id: string;
  rating: number;
  total_services: number;
  verified: boolean;
  full_name: string;
  avatar_url: string | null;
  category_name: string;
  profession_name: string;
  category_id: string | null;
  user_type: string;
  city: string | null;
  state: string | null;
}

interface Category {
  id: string;
  name: string;
}

const Search = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [pros, setPros] = useState<Pro[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [userCity, setUserCity] = useState<string | null>(null);
  
  // ✅ Controle de abertura do modal adicionado
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  // Filters
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterMinRating, setFilterMinRating] = useState<number>(0);
  const [filterVerified, setFilterVerified] = useState(false);

  useEffect(() => {
    const loadUserCity = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("address_city").eq("user_id", user.id).single();
      if (data?.address_city) setUserCity(data.address_city);
    };
    loadUserCity();
  }, []);

  const loadPros = async () => {
    setLoading(true);
    const [prosRes, catsRes] = await Promise.all([
      supabase
        .from("professionals")
        .select("id, rating, total_services, verified, user_id, availability_status, category_id, profession_id, categories(name), professions:profession_id(name)")
        .eq("active", true)
        .eq("profile_status", "approved")
        .neq("availability_status", "unavailable")
        .order("rating", { ascending: false }),
      supabase.from("categories").select("id, name").eq("active", true).order("name"),
    ]);

    setCategories((catsRes.data || []) as Category[]);

    if (!prosRes.data) {
      setPros([]);
      setLoading(false);
      return;
    }

    const userIds = prosRes.data.map((p) => p.user_id);
    const [profilesRes, fullProfilesRes] = await Promise.all([
      supabase.from("profiles_public" as any).select("user_id, full_name, avatar_url").in("user_id", userIds),
      supabase.from("profiles").select("user_id, address_city, address_state").in("user_id", userIds),
    ]);

    const profileMap = new Map(((profilesRes.data || []) as any[]).map((p) => [p.user_id, p]));
    const locationMap = new Map(((fullProfilesRes.data || []) as any[]).map((p) => [p.user_id, p]));

    const mappedPros = prosRes.data.map((p) => ({
      id: p.id,
      rating: p.rating,
      total_services: p.total_services,
      verified: p.verified,
      full_name: profileMap.get(p.user_id)?.full_name || "Profissional",
      avatar_url: profileMap.get(p.user_id)?.avatar_url || null,
      category_name: (p.categories as any)?.name || "—",
      profession_name: (p.professions as any)?.name || "",
      category_id: p.category_id,
      user_type: "professional",
      city: locationMap.get(p.user_id)?.address_city || null,
      state: locationMap.get(p.user_id)?.address_state || null,
    }));

    if (userCity) {
      mappedPros.sort((a, b) => {
        if (a.city === userCity && b.city !== userCity) return -1;
        if (a.city !== userCity && b.city === userCity) return 1;
        return b.rating - a.rating;
      });
    }

    setPros(mappedPros);
    setLoading(false);
  };

  useEffect(() => { loadPros(); }, [userCity]);

  const filtered = pros.filter((p) => {
    const q = search.trim().toLowerCase();
    if (q) {
      const target = `${p.full_name} ${p.category_name} ${p.profession_name} ${p.city || ""} ${p.state || ""}`.toLowerCase();
      if (!fuzzyMatch(q, target)) return false;
    }
    if (filterCategory && p.category_id !== filterCategory) return false;
    if (filterMinRating > 0 && p.rating < filterMinRating) return false;
    if (filterVerified && !p.verified) return false;
    return true;
  });

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5">
        <div className="relative mb-6">
          <div className="relative group">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar profissional ou serviço..."
              className="w-full pl-12 pr-12 py-4 bg-card border-2 border-muted rounded-2xl text-sm outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all shadow-sm"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded-full transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-bold text-foreground">
            {search ? `Resultados para "${search}"` : "Todos os Profissionais"}
          </h1>
          
          <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
            <SheetTrigger asChild>
              <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-card hover:bg-muted transition-colors text-xs font-semibold">
                <SlidersHorizontal className="w-3.5 h-3.5" /> Filtros
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-3xl h-[65vh] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Filtrar Profissionais</SheetTitle>
              </SheetHeader>
              <div className="py-6 space-y-6">
                <div>
                  <label className="text-sm font-bold mb-3 block">Categoria</label>
                  <select 
                    value={filterCategory} 
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="w-full p-3 rounded-xl border bg-background text-sm"
                  >
                    <option value="">Todas as categorias</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-bold mb-3 block">Avaliação mínima: {filterMinRating} estrelas</label>
                  <Slider value={[filterMinRating]} onValueChange={([v]) => setFilterMinRating(v)} max={5} step={1} />
                </div>

                <div className="flex items-center justify-between p-4 bg-muted/20 rounded-2xl border border-transparent">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                    <span className="text-sm font-bold text-foreground">Apenas Verificados</span>
                  </div>
                  <Switch 
                    checked={filterVerified} 
                    onCheckedChange={setFilterVerified} 
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4">
                  <button 
                    onClick={() => { setFilterCategory(""); setFilterMinRating(0); setFilterVerified(false); }}
                    className="py-3 text-sm font-semibold text-muted-foreground bg-muted/50 rounded-xl"
                  >
                    Limpar
                  </button>
                  {/* ✅ BOTÃO APLICAR ADICIONADO: FECHA O MODAL */}
                  <button 
                    onClick={() => setIsSheetOpen(false)}
                    className="py-3 text-sm font-bold text-white bg-primary rounded-xl shadow-lg shadow-primary/20"
                  >
                    Aplicar
                  </button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[1,2,3,4].map(i => <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-muted/30 rounded-2xl border-2 border-dashed">
            <SearchIcon className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">Nenhum profissional encontrado.</p>
            <button onClick={() => {setSearch(""); setFilterCategory(""); setFilterVerified(false);}} className="text-xs text-primary font-bold mt-2">Ver todos os profissionais</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map((pro) => {
              const initials = pro.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
              return (
                <Link
                  key={pro.id}
                  to={`/professional/${pro.id}`}
                  className="flex items-center gap-3 bg-card border rounded-2xl p-4 hover:border-primary/30 hover:shadow-md transition-all group"
                >
                  <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground overflow-hidden border-2 border-background shadow-sm">
                    {pro.avatar_url ? <img src={pro.avatar_url} className="w-full h-full object-cover" /> : initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="font-bold text-sm text-foreground truncate group-hover:text-primary transition-colors">{pro.full_name}</p>
                      {pro.verified && <BadgeCheck className="w-4 h-4 text-primary flex-shrink-0" />}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{pro.category_name} · {pro.profession_name}</p>
                    <div className="flex items-center justify-between mt-1">
                      <div className="flex items-center gap-1">
                        <Star className="w-3.5 h-3.5 fill-primary text-primary" />
                        <span className="text-xs font-bold">{Number(pro.rating).toFixed(1)}</span>
                        <span className="text-[10px] text-muted-foreground">({pro.total_services})</span>
                      </div>
                      {pro.city && (
                        <p className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <MapPin className="w-3 h-3" /> {pro.city}
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </AppLayout>
  );
};

export default Search;