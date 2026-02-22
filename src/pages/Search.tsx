import AppLayout from "@/components/AppLayout";
import { Search as SearchIcon, SlidersHorizontal, Star, BadgeCheck, X, MapPin, Building2, CheckCircle2 } from "lucide-react";
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
      // ✅ BUSCA CIDADE DO PERFIL MAS NÃO TRAVA A LISTA
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from("profiles").select("address_city").eq("user_id", user.id).maybeSingle();
        if (profile?.address_city) setFilterCity(profile.address_city);
      }
      
      const { data: cats } = await supabase.from("categories").select("*").eq("active", true).order("name");
      setCategories(cats || []);
      loadPros();
    };
    init();
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

  const filtered = pros.filter(p => {
    // Busca por texto (nome ou categoria)
    if (search && !fuzzyMatch(search.toLowerCase(), `${p.full_name} ${p.category_name}`.toLowerCase())) return false;
    
    // Filtro por Categoria e Profissão
    if (filterCategory && p.category_id !== filterCategory) return false;
    if (filterProfession && p.profession_id !== filterProfession) return false;
    
    // ✅ FILTRO DE CIDADE FLEXÍVEL (Se campo estiver vazio, ignora o filtro)
    if (filterCity && p.city && !fuzzyMatch(filterCity.toLowerCase(), p.city.toLowerCase())) return false;
    
    // Outros Filtros
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
            placeholder="Buscar profissional ou serviço..."
            className="w-full pl-12 pr-4 py-4 bg-card border-2 rounded-2xl outline-none focus:border-primary/50 shadow-sm transition-all"
          />
        </div>

        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-bold">Profissionais disponíveis</h1>
          <Sheet>
            <SheetTrigger asChild>
              <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-card border text-sm font-semibold hover:bg-muted transition-colors">
                <SlidersHorizontal className="w-4 h-4" /> Filtros
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-3xl h-[85vh] overflow-y-auto">
              <SheetHeader><SheetTitle>Filtrar Profissionais</SheetTitle></SheetHeader>
              <div className="py-6 space-y-6">
                
                <div className="space-y-3">
                  <label className="text-sm font-bold flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" /> Localização</label>
                  <div className="relative">
                    <input 
                      value={filterCity} onChange={(e) => setFilterCity(e.target.value)}
                      placeholder="Sua cidade (ex: Patrocínio)" className="w-full p-3 rounded-xl border bg-background text-sm" 
                    />
                    {filterCity && <button onClick={() => setFilterCity("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="w-4 h-4" /></button>}
                  </div>
                  <div className="flex justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    <span>Distância máxima</span>
                    <span>{filterRadius}km</span>
                  </div>
                  <Slider value={[filterRadius]} onValueChange={([v]) => setFilterRadius(v)} min={1} max={150} step={1} />
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="text-sm font-bold mb-2 block">Categoria</label>
                    <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="w-full p-3 rounded-xl border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20">
                      <option value="">Todas as categorias</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  {filterCategory && (
                    <div className="animate-in fade-in slide-in-from-top-1">
                      <label className="text-sm font-bold mb-2 block">Profissão específica</label>
                      <select value={filterProfession} onChange={(e) => setFilterProfession(e.target.value)} className="w-full p-3 rounded-xl border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20">
                        <option value="">Qualquer profissão</option>
                        {professions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-sm font-bold mb-3 block">Mínimo de estrelas</label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button 
                        key={star} onClick={() => setFilterMinRating(star === filterMinRating ? 0 : star)}
                        className={`flex-1 py-3 rounded-xl border transition-all ${filterMinRating >= star ? "bg-primary/10 border-primary text-primary shadow-sm" : "bg-card text-muted-foreground"}`}
                      >
                        <div className="flex flex-col items-center gap-1">
                          <Star className={`w-5 h-5 ${filterMinRating >= star ? "fill-primary" : ""}`} />
                          <span className="text-[10px] font-bold">{star}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between p-4 bg-muted/20 rounded-2xl border border-transparent hover:border-muted-foreground/10 transition-all">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-primary" />
                      <span className="text-sm font-bold">Profissionais Verificados</span>
                    </div>
                    <Switch checked={filterVerifiedOnly} onCheckedChange={setFilterVerifiedOnly} />
                  </div>
                  <div className="flex items-center justify-between p-4 bg-muted/20 rounded-2xl border border-transparent hover:border-muted-foreground/10 transition-all">
                    <div className="flex items-center gap-3">
                      <Building2 className="w-5 h-5 text-primary" />
                      <span className="text-sm font-bold">Somente Empresas</span>
                    </div>
                    <Switch checked={filterCompaniesOnly} onCheckedChange={setFilterCompaniesOnly} />
                  </div>
                </div>

                <button 
                  onClick={() => { setFilterCategory(""); setFilterMinRating(0); setFilterVerifiedOnly(false); setFilterCompaniesOnly(false); setFilterCity(""); }} 
                  className="w-full py-3 text-xs font-bold text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest"
                >
                  Limpar todos os filtros
                </button>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1,2,3,4,5,6].map(i => <div key={i} className="h-[100px] bg-muted animate-pulse rounded-2xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
              <SearchIcon className="w-8 h-8 text-muted-foreground/40" />
            </div>
            <div className="space-y-1">
              <p className="font-bold text-foreground">Nenhum resultado encontrado</p>
              <p className="text-xs text-muted-foreground px-10">Tente ajustar seus filtros ou limpar a localização para ver todos os profissionais.</p>
            </div>
            <button onClick={() => { setFilterCity(""); setSearch(""); }} className="text-xs font-bold text-primary underline underline-offset-4">Ver todos os profissionais</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map((pro) => (
              <Link key={pro.id} to={`/professional/${pro.id}`} className="flex items-center gap-4 bg-card border rounded-2xl p-4 hover:border-primary/30 hover:shadow-sm transition-all group">
                <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center overflow-hidden border-2 border-background shadow-sm flex-shrink-0">
                  {pro.avatar_url ? <img src={pro.avatar_url} className="w-full h-full object-cover" /> : <span className="font-bold text-muted-foreground/50">{pro.full_name[0]}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-bold text-sm truncate group-hover:text-primary transition-colors">{pro.full_name}</p>
                    {pro.verified && <BadgeCheck className="w-4 h-4 text-primary" />}
                    {pro.plan_id === 'business' && <Building2 className="w-3.5 h-3.5 text-orange-500" />}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate font-medium">{pro.category_name} {pro.profession_name && `· ${pro.profession_name}`}</p>
                  <div className="flex items-center justify-between mt-1.5">
                    <div className="flex items-center gap-1 bg-primary/5 px-2 py-0.5 rounded-full">
                      <Star className="w-3 h-3 fill-primary text-primary" />
                      <span className="text-[10px] font-bold text-primary">{Number(pro.rating).toFixed(1)}</span>
                    </div>
                    {pro.city && <p className="text-[10px] text-muted-foreground flex items-center gap-1 font-medium"><MapPin className="w-3 h-3 text-primary/60" /> {pro.city}</p>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background/90 to-transparent pointer-events-none">
         <div className="max-w-screen-lg mx-auto h-16" />
      </div>
    </AppLayout>
  );
};

export default Search;