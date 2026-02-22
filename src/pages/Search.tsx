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

  // ✅ Filtros 100% Manuais (Iniciam resetados)
  const [filterCategory, setFilterCategory] = useState("");
  const [filterProfession, setFilterProfession] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [filterRadius, setFilterRadius] = useState(150); // Padrão máximo para ver tudo
  const [filterMinRating, setFilterMinRating] = useState(0);
  const [filterVerifiedOnly, setFilterVerifiedOnly] = useState(false);
  const [filterCompaniesOnly, setFilterCompaniesOnly] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      // 1. Carrega categorias para o select
      const { data: cats } = await supabase.from("categories").select("*").eq("active", true).order("name");
      setCategories(cats || []);
      
      // 2. Carrega todos os profissionais aprovados
      loadPros();
    };
    loadData();
  }, []);

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
    // ✅ Busca direta e sem filtros de localização automáticos
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

  const normalize = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  const filtered = pros.filter(p => {
    // Filtro de Texto (Nome/Categoria)
    if (search && !normalize(p.full_name + p.category_name).includes(normalize(search))) return false;
    
    // Filtro de Categoria/Profissão
    if (filterCategory && p.category_id !== filterCategory) return false;
    if (filterProfession && p.profession_id !== filterProfession) return false;
    
    // ✅ Filtro de Cidade (SÓ ativa se você digitar algo manualmente)
    if (filterCity.trim() !== "") {
      if (!p.city || !normalize(p.city).includes(normalize(filterCity))) return false;
    }

    // Filtros de Status
    if (filterMinRating > 0 && p.rating < filterMinRating) return false;
    if (filterVerifiedOnly && !p.verified) return false;
    if (filterCompaniesOnly && p.plan_id !== "business") return false;
    
    return true;
  });

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5 pb-24">
        <div className="relative mb-6">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou serviço..."
            className="w-full pl-12 pr-4 py-4 bg-card border-2 rounded-2xl outline-none focus:border-primary/50 shadow-sm"
          />
        </div>

        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-bold">Explorar Profissionais</h1>
          <Sheet>
            <SheetTrigger asChild>
              <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-card border text-sm font-semibold hover:bg-muted transition-all">
                <SlidersHorizontal className="w-4 h-4" /> Filtros
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-3xl h-[85vh] overflow-y-auto">
              <SheetHeader><SheetTitle>Refinar Busca</SheetTitle></SheetHeader>
              <div className="py-6 space-y-6 text-foreground">
                
                <div className="space-y-3">
                  <label className="text-sm font-bold flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" /> Onde você precisa?</label>
                  <input 
                    value={filterCity} onChange={(e) => setFilterCity(e.target.value)}
                    placeholder="Digite a cidade..." className="w-full p-3 rounded-xl border bg-background text-sm" 
                  />
                  <div className="flex justify-between text-xs font-bold text-muted-foreground">
                    <span>Distância (Raio)</span>
                    <span>{filterRadius}km</span>
                  </div>
                  <Slider value={[filterRadius]} onValueChange={([v]) => setFilterRadius(v)} min={1} max={150} step={1} />
                </div>

                <div className="grid grid-cols-1 gap-4 text-foreground">
                  <div>
                    <label className="text-sm font-bold mb-2 block">Categoria</label>
                    <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="w-full p-3 rounded-xl border bg-background text-sm text-foreground">
                      <option value="">Todas as categorias</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-bold mb-3 block">Estrelas (Mínimo)</label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button 
                        key={star} onClick={() => setFilterMinRating(star)}
                        className={`flex-1 py-3 rounded-xl border transition-all ${filterMinRating >= star ? "bg-primary/10 border-primary text-primary" : "bg-card"}`}
                      >
                        <Star className={`w-5 h-5 mx-auto ${filterMinRating >= star ? "fill-primary" : ""}`} />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-muted/20 rounded-2xl">
                    <span className="text-sm font-bold">Selo de Verificado</span>
                    <Switch checked={filterVerifiedOnly} onCheckedChange={setFilterVerifiedOnly} />
                  </div>
                  <div className="flex items-center justify-between p-4 bg-muted/20 rounded-2xl">
                    <span className="text-sm font-bold">Perfil de Empresa</span>
                    <Switch checked={filterCompaniesOnly} onCheckedChange={setFilterCompaniesOnly} />
                  </div>
                </div>

                <button 
                   onClick={() => { setFilterCity(""); setSearch(""); setFilterCategory(""); setFilterMinRating(0); setFilterVerifiedOnly(false); setFilterCompaniesOnly(false); }} 
                   className="w-full py-4 text-sm font-bold text-primary bg-primary/5 rounded-2xl"
                >
                  Limpar todos os filtros
                </button>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
             {[1,2,3,4,5,6].map(i => <div key={i} className="h-28 bg-muted animate-pulse rounded-2xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 bg-muted/10 rounded-3xl border-2 border-dashed">
            <SearchIcon className="w-12 h-12 mx-auto mb-3 text-muted-foreground/20" />
            <p className="font-bold text-muted-foreground">Nenhum profissional na lista</p>
            <button onClick={() => setFilterCity("")} className="text-xs text-primary font-bold mt-2">Clique aqui para ver todos</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map((pro) => (
              <Link key={pro.id} to={`/professional/${pro.id}`} className="flex items-center gap-4 bg-card border rounded-2xl p-4 hover:shadow-md transition-all group">
                <div className="w-14 h-14 rounded-full bg-muted overflow-hidden border-2 border-background shadow-sm flex-shrink-0">
                  {pro.avatar_url ? <img src={pro.avatar_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-bold text-muted-foreground">{pro.full_name[0]}</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="font-bold text-sm truncate group-hover:text-primary transition-colors">{pro.full_name}</p>
                    {pro.verified && <BadgeCheck className="w-4 h-4 text-primary" />}
                    {pro.plan_id === 'business' && <Building2 className="w-3.5 h-3.5 text-orange-500" />}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{pro.category_name}</p>
                  <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center gap-1 bg-primary/10 px-2 py-0.5 rounded-full">
                      <Star className="w-3 h-3 fill-primary text-primary" />
                      <span className="text-[10px] font-bold text-primary">{Number(pro.rating).toFixed(1)}</span>
                    </div>
                    {pro.city && <p className="text-[10px] text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3 text-primary/40" /> {pro.city}</p>}
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