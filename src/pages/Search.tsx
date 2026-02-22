import AppLayout from "@/components/AppLayout";
import { Search as SearchIcon, SlidersHorizontal, Star, BadgeCheck, X, MapPin, Building2, CheckCircle2 } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

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
  profession_id: string | null;
  plan_id: string | null;
  city: string | null;
  state: string | null;
}

const Search = () => {
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [pros, setPros] = useState<Pro[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [professions, setProfessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [filterCategory, setFilterCategory] = useState("");
  const [filterProfession, setFilterProfession] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [filterRadius, setFilterRadius] = useState(50);
  const [filterMinRating, setFilterMinRating] = useState(0);
  const [filterVerifiedOnly, setFilterVerifiedOnly] = useState(false);
  const [filterCompaniesOnly, setFilterCompaniesOnly] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from("profiles").select("address_city").eq("user_id", user.id).maybeSingle();
        // ✅ Inicializa a cidade, mas deixa o usuário ver tudo se quiser
        if (profile?.address_city) setFilterCity(profile.address_city);
      }
      
      const { data: cats } = await supabase.from("categories").select("*").eq("active", true).order("name");
      setCategories(cats || []);
      loadPros();
    };
    init();
  }, []);

  // Recarrega profissões ao mudar categoria
  useEffect(() => {
    if (filterCategory) {
      supabase.from("professions").select("*").eq("category_id", filterCategory).eq("active", true).then(({ data }) => setProfessions(data || []));
    } else {
      setProfessions([]);
      setFilterProfession("");
    }
  }, [filterCategory]);

  const loadPros = async () => {
    setLoading(true);
    const { data: professionals } = await supabase
      .from("professionals")
      .select("id, rating, total_services, verified, user_id, category_id, profession_id, categories(name), professions:profession_id(name), subscriptions(plan_id)")
      .eq("active", true)
      .eq("profile_status", "approved");

    if (professionals) {
      const userIds = professionals.map(p => p.user_id);
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, avatar_url, address_city, address_state").in("user_id", userIds);
      const profileMap = new Map(profiles?.map(p => [p.user_id, p]));

      setPros(professionals.map(p => {
        const prof = profileMap.get(p.user_id);
        return {
          id: p.id,
          rating: p.rating,
          total_services: p.total_services,
          verified: p.verified,
          full_name: prof?.full_name || "Profissional",
          avatar_url: prof?.avatar_url || null,
          category_name: (p.categories as any)?.name || "",
          profession_name: (p.professions as any)?.name || "",
          category_id: p.category_id,
          profession_id: p.profession_id,
          plan_id: (p.subscriptions as any)?.[0]?.plan_id || "free",
          city: prof?.address_city || null,
          state: prof?.address_state || null,
        };
      }));
    }
    setLoading(false);
  };

  // ✅ FUNÇÃO DE COMPARAÇÃO DE TEXTO ROBUSTA (Ignora acentos e espaços)
  const normalize = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  const filtered = pros.filter(p => {
    if (search && !normalize(p.full_name + p.category_name).includes(normalize(search))) return false;
    if (filterCategory && p.category_id !== filterCategory) return false;
    if (filterProfession && p.profession_id !== filterProfession) return false;
    
    // ✅ CORREÇÃO DO FILTRO DE CIDADE
    if (filterCity) {
      if (!p.city || !normalize(p.city).includes(normalize(filterCity))) return false;
    }

    if (filterMinRating > 0 && p.rating < filterMinRating) return false;
    if (filterVerifiedOnly && !p.verified) return false;
    if (filterCompaniesOnly && p.plan_id !== "business") return false;
    return true;
  });

  // ✅ FUNÇÃO PARA RESETAR TUDO
  const resetFilters = () => {
    setFilterCity("");
    setSearch("");
    setFilterCategory("");
    setFilterProfession("");
    setFilterMinRating(0);
    setFilterVerifiedOnly(false);
    setFilterCompaniesOnly(false);
  };

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5 pb-24">
        <div className="relative mb-6">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar profissional ou serviço..."
            className="w-full pl-12 pr-4 py-4 bg-card border-2 rounded-2xl outline-none focus:border-primary/50 shadow-sm"
          />
        </div>

        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-bold">Profissionais disponíveis</h1>
          <Sheet>
            <SheetTrigger asChild>
              <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-card border text-sm font-semibold">
                <SlidersHorizontal className="w-4 h-4" /> Filtros
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-3xl h-[85vh] overflow-y-auto">
              <SheetHeader><SheetTitle>Filtrar Profissionais</SheetTitle></SheetHeader>
              <div className="py-6 space-y-6">
                
                <div className="space-y-3">
                  <label className="text-sm font-bold flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" /> Localização</label>
                  <input 
                    value={filterCity} onChange={(e) => setFilterCity(e.target.value)}
                    placeholder="Cidade" className="w-full p-3 rounded-xl border bg-background text-sm" 
                  />
                  <div className="flex justify-between text-xs font-medium text-muted-foreground">
                    <span>Raio de alcance</span>
                    <span>{filterRadius}km</span>
                  </div>
                  <Slider value={[filterRadius]} onValueChange={([v]) => setFilterRadius(v)} min={1} max={150} step={1} />
                </div>

                <div>
                  <label className="text-sm font-bold mb-2 block">Categoria</label>
                  <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="w-full p-3 rounded-xl border bg-background text-sm">
                    <option value="">Todas as categorias</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-bold mb-3 block">Avaliação mínima</label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button 
                        key={star} onClick={() => setFilterMinRating(star)}
                        className={`flex-1 py-3 rounded-xl border ${filterMinRating >= star ? "bg-primary/10 border-primary text-primary" : "bg-card"}`}
                      >
                        <Star className={`w-5 h-5 mx-auto ${filterMinRating >= star ? "fill-primary" : ""}`} />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-muted/30 rounded-2xl">
                    <span className="text-sm font-bold">Apenas Verificados</span>
                    <Switch checked={filterVerifiedOnly} onCheckedChange={setFilterVerifiedOnly} />
                  </div>
                  <div className="flex items-center justify-between p-4 bg-muted/30 rounded-2xl">
                    <span className="text-sm font-bold">Somente Empresas</span>
                    <Switch checked={filterCompaniesOnly} onCheckedChange={setFilterCompaniesOnly} />
                  </div>
                </div>

                <button onClick={resetFilters} className="w-full py-3 text-sm font-bold text-primary">Limpar Filtros</button>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1,2,3,4].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-2xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <SearchIcon className="w-12 h-12 text-muted-foreground/30" />
            <p className="font-bold">Nenhum resultado encontrado</p>
            <button onClick={resetFilters} className="text-xs font-bold text-primary underline">Ver todos os profissionais</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map((pro) => (
              <Link key={pro.id} to={`/professional/${pro.id}`} className="flex items-center gap-4 bg-card border rounded-2xl p-4 hover:shadow-sm transition-all">
                <div className="w-14 h-14 rounded-full bg-muted overflow-hidden border-2 border-background shadow-sm">
                  {pro.avatar_url ? <img src={pro.avatar_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-bold">{pro.full_name[0]}</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="font-bold text-sm truncate">{pro.full_name}</p>
                    {pro.verified && <BadgeCheck className="w-4 h-4 text-primary" />}
                    {pro.plan_id === 'business' && <Building2 className="w-3.5 h-3.5 text-orange-500" />}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{pro.category_name}</p>
                  <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center gap-1 bg-primary/10 px-2 py-0.5 rounded-full">
                      <Star className="w-3 h-3 fill-primary text-primary" />
                      <span className="text-[10px] font-bold text-primary">{Number(pro.rating).toFixed(1)}</span>
                    </div>
                    {pro.city && <p className="text-[10px] text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" /> {pro.city}</p>}
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