import AppLayout from "@/components/AppLayout";
import { Search as SearchIcon, SlidersHorizontal, Star, BadgeCheck, MapPin, CheckCircle2, ChevronDown } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useCallback, useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeLocation, normalizeStateToUF } from "@/lib/locationUtils";
import { fetchCitiesByState } from "@/lib/brazilLocations";
import { SEARCH_ALIASES, isPrimaryMatch } from "@/lib/searchAliases";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

function searchMatchesPro(q: string, target: string, cat: string, prof: string): boolean {
  if (target.includes(q)) return true;
  const aliasKeys = Object.keys(SEARCH_ALIASES).filter((key) => q.includes(norm(key)) || norm(key).includes(q));
  for (const key of aliasKeys) {
    for (const term of SEARCH_ALIASES[key]) {
      if (cat.includes(term) || prof.includes(term) || target.includes(term)) return true;
    }
  }
  return false;
}
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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
  user_type: string;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  distance?: number;
}

interface Category {
  id: string;
  name: string;
}

interface Profession {
  id: string;
  name: string;
}

// Fallback: lista de estados do Brasil em ordem alfabética (IBGE pode falhar no app por rede/CORS)
const ESTADOS_BR_FALLBACK: { sigla: string; nome: string }[] = [
  { sigla: "AC", nome: "Acre" }, { sigla: "AL", nome: "Alagoas" }, { sigla: "AP", nome: "Amapá" },
  { sigla: "AM", nome: "Amazonas" }, { sigla: "BA", nome: "Bahia" }, { sigla: "CE", nome: "Ceará" },
  { sigla: "DF", nome: "Distrito Federal" }, { sigla: "ES", nome: "Espírito Santo" }, { sigla: "GO", nome: "Goiás" },
  { sigla: "MA", nome: "Maranhão" }, { sigla: "MT", nome: "Mato Grosso" }, { sigla: "MS", nome: "Mato Grosso do Sul" },
  { sigla: "MG", nome: "Minas Gerais" }, { sigla: "PA", nome: "Pará" }, { sigla: "PB", nome: "Paraíba" },
  { sigla: "PR", nome: "Paraná" }, { sigla: "PE", nome: "Pernambuco" }, { sigla: "PI", nome: "Piauí" },
  { sigla: "RJ", nome: "Rio de Janeiro" }, { sigla: "RN", nome: "Rio Grande do Norte" }, { sigla: "RS", nome: "Rio Grande do Sul" },
  { sigla: "RO", nome: "Rondônia" }, { sigla: "RR", nome: "Roraima" }, { sigla: "SC", nome: "Santa Catarina" },
  { sigla: "SP", nome: "São Paulo" }, { sigla: "SE", nome: "Sergipe" }, { sigla: "TO", nome: "Tocantins" },
].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

const Search = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [pros, setPros] = useState<Pro[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [userCity, setUserCity] = useState<string | null>(null);
  const [userState, setUserState] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const [userCoords, setUserCoords] = useState<{lat: number, lng: number} | null>(null);

  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterProfession, setFilterProfession] = useState<string>("");
  const [professions, setProfessions] = useState<Profession[]>([]);
  const [filterMinRating, setFilterMinRating] = useState<number>(0);
  const [filterVerified, setFilterVerified] = useState(false);
  
  const [filterState, setFilterState] = useState<string>("");
  const [statesList, setStatesList] = useState<{ sigla: string; nome: string }[]>(ESTADOS_BR_FALLBACK);
  const [filterCity, setFilterCity] = useState<string>("");
  const [allCities, setAllCities] = useState<string[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);
  const [showStateList, setShowStateList] = useState(false);

  const PAGE_SIZE = 7;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    const fetchStates = async () => {
      try {
        const res = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome');
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setStatesList(data.map((s: any) => ({ sigla: s.sigla, nome: s.nome })));
        }
      } catch {
        // Mantém ESTADOS_BR_FALLBACK já definido no useState
      }
    };
    fetchStates();
  }, []);

  const loadCitiesForState = useCallback((uf: string) => {
    if (!uf || uf.length !== 2) {
      setAllCities([]);
      setLoadingCities(false);
      return;
    }
    setLoadingCities(true);
    setAllCities([]);
    fetchCitiesByState(uf)
      .then((names) => setAllCities(names))
      .catch(() => setAllCities([]))
      .finally(() => setLoadingCities(false));
  }, []);

  useEffect(() => {
    if (!filterState) {
      setAllCities([]);
      setLoadingCities(false);
      return;
    }
    loadCitiesForState(filterState);
  }, [filterState, loadCitiesForState]);

  const loadUserLocation = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      setUserCoords({ lat: -18.9431, lng: -46.9922 });
      return;
    }
    
    const { data } = await supabase.from("profiles").select("address_city, address_state, latitude, longitude").eq("user_id", user.id).single();
    
    if (data?.address_state) {
      setUserState(data.address_state);
      setFilterState((prev) => prev || data.address_state); 
    }

    if (data?.address_city) {
      setUserCity(data.address_city);
      setFilterCity((prev) => prev || data.address_city); 
    }
    
    if (data?.latitude && data?.longitude) {
      setUserCoords({ lat: data.latitude, lng: data.longitude });
    } else {
      setUserCoords({ lat: -18.9431, lng: -46.9922 });
    }
  };

  useEffect(() => {
    const loadProfessions = async () => {
      if (!filterCategory) {
        setProfessions([]);
        setFilterProfession("");
        return;
      }
      const { data } = await supabase.from("professions").select("id, name").eq("category_id", filterCategory).eq("active", true).order("name");
      setProfessions(data || []);
    };
    loadProfessions();
  }, [filterCategory]);

  // 🔥 OTIMIZAÇÃO: Busca Profissionais e Categorias de forma isolada e hiper-rápida
  const loadPros = async () => {
    setLoading(true);
    const [prosRes, catsRes] = await Promise.all([
      supabase
        .from("professionals")
        .select("id, rating, total_services, verified, user_id, availability_status, category_id, profession_id, categories(name), professions:profession_id(name)")
        .eq("active", true)
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
      supabase
        .from("profiles_public" as any)
        .select("user_id, full_name, avatar_url")
        .in("user_id", userIds),
      supabase.from("profiles").select("user_id, address_city, address_state, latitude, longitude").in("user_id", userIds),
    ]);

    const profileMap = new Map(((profilesRes.data || []) as any[]).map((p) => [p.user_id, p]));
    const locationMap = new Map(((fullProfilesRes.data || []) as any[]).map((p) => [p.user_id, p]));

    const mappedPros = prosRes.data.map((p) => {
      const loc = locationMap.get(p.user_id);

      return {
        id: p.id,
        rating: p.rating,
        total_services: p.total_services,
        verified: p.verified,
        full_name: profileMap.get(p.user_id)?.full_name || "Profissional",
        avatar_url: profileMap.get(p.user_id)?.avatar_url || null,
        category_name: (p.categories as any)?.name || "—",
        profession_name: (p.professions as any)?.name || "",
        category_id: p.category_id,
        profession_id: p.profession_id,
        user_type: "professional",
        city: loc?.address_city || null,
        state: loc?.address_state || null,
        latitude: loc?.latitude || null,
        longitude: loc?.longitude || null,
      };
    });

    setPros(mappedPros);
    setLoading(false);
  };

  // 🔥 OTIMIZAÇÃO: Inicia as duas buscas em paralelo (não espera uma acabar para começar a outra)
  useEffect(() => { 
    loadUserLocation();
    loadPros(); 
  }, []); // <--- Array vazio faz rodar só uma vez e instantaneamente!

  // 🔥 OTIMIZAÇÃO: Calcula distância no front-end em milissegundos sem precisar recarregar o banco
  const filteredAndSorted = useMemo(() => {
    // 1. Calcula distâncias (se tiver a localização do usuário)
    const prosWithDistance = pros.map(p => {
      let distance = undefined;
      if (userCoords && p.latitude && p.longitude) {
        const R = 6371; 
        const dLat = (p.latitude - userCoords.lat) * Math.PI / 180;
        const dLon = (p.longitude - userCoords.lng) * Math.PI / 180;
        const a = 
          Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(userCoords.lat * Math.PI / 180) * Math.cos(p.latitude * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        distance = R * c;
      }
      return { ...p, distance };
    });

    // 2. Aplica os filtros (busca com sinônimos: eletricista, aula de ingles → escola de idiomas, etc.)
    let result = prosWithDistance.filter((p) => {
      const q = norm(search.trim());
      if (q) {
        const target = norm(`${p.full_name} ${p.category_name} ${p.profession_name} ${p.city || ""} ${p.state || ""}`);
        const cat = norm(p.category_name);
        const prof = norm(p.profession_name);
        if (!searchMatchesPro(q, target, cat, prof)) return false;
      }
      
      if (filterState) {
        const pStateNorm = normalizeStateToUF(p.state);
        const fStateNorm = normalizeStateToUF(filterState);
        if (pStateNorm !== fStateNorm) return false;
      }

      if (filterCity) {
        const pCity = normalizeLocation(p.city);
        const fCity = normalizeLocation(filterCity);
        // Só filtra fora quem tem cidade cadastrada e é diferente da cidade filtrada.
        // Profissional sem cidade (pCity vazio) não é filtrado — endereço pode estar incompleto.
        if (pCity && pCity !== fCity) return false;
      }

      if (filterCategory && p.category_id !== filterCategory) return false;
      if (filterProfession && p.profession_id !== filterProfession) return false;
      if (filterMinRating > 0 && p.rating < filterMinRating) return false;
      if (filterVerified && !p.verified) return false;
      
      return true;
    });

    // 3. Ordena: 1) significado mais buscado, 2) verificados, 3) rating, 4) distância (se tiver coords)
    const q = search.trim();
    result.sort((a, b) => {
      const aPrimary = isPrimaryMatch(q, a.category_name, a.profession_name);
      const bPrimary = isPrimaryMatch(q, b.category_name, b.profession_name);
      if (aPrimary !== bPrimary) return aPrimary ? -1 : 1;
      if (a.verified !== b.verified) return a.verified ? -1 : 1;
      if (b.rating !== a.rating) return b.rating - a.rating;
      if (userCoords && a.distance !== undefined && b.distance !== undefined) return (a.distance || 999) - (b.distance || 999);
      return 0;
    });

    return result;
  }, [pros, search, filterState, filterCity, filterCategory, filterProfession, filterMinRating, filterVerified, userCoords]);

  // Reset paginação quando filtros ou busca mudam
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, filterState, filterCity, filterCategory, filterProfession, filterMinRating, filterVerified]);

  const prosToShow = filteredAndSorted.slice(0, visibleCount);
  const hasMore = visibleCount < filteredAndSorted.length;

  const stateLabel = filterState ? statesList.find((s) => s.sigla === filterState)?.nome + " (" + filterState + ")" : "Selecione o Estado";

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5 pb-24 text-foreground">
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
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-bold text-foreground">Explorar</h1>
          
          <Sheet open={isSheetOpen} onOpenChange={(open) => { setIsSheetOpen(open); if (!open) setShowStateList(false); }}>
            <SheetTrigger asChild>
              <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-card hover:bg-muted transition-colors text-xs font-semibold">
                <SlidersHorizontal className="w-3.5 h-3.5" /> Filtros
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-3xl h-[85vh] overflow-y-auto">
              <SheetHeader><SheetTitle>Filtrar</SheetTitle></SheetHeader>
              <div className="py-6 space-y-6">
                
                <div className="relative">
                  <label className="text-sm font-bold flex items-center gap-2 mb-3">
                    <MapPin className="w-4 h-4 text-primary" /> Estado
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowStateList((v) => !v)}
                    className="w-full p-3 rounded-xl border bg-background text-sm text-left flex items-center justify-between gap-2 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  >
                    <span className={filterState ? "text-foreground" : "text-muted-foreground"}>{stateLabel}</span>
                    <ChevronDown className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform ${showStateList ? "rotate-180" : ""}`} />
                  </button>
                  {showStateList && (
                    <ul className="absolute z-50 w-full mt-1 bg-card border rounded-xl shadow-lg max-h-56 overflow-y-auto">
                      <li
                        onClick={() => { setFilterState(""); setFilterCity(""); setShowStateList(false); }}
                        className="px-4 py-3 text-sm text-muted-foreground hover:bg-muted cursor-pointer border-b active:bg-muted"
                      >
                        Selecione o Estado
                      </li>
                      {statesList.map((s) => (
                        <li
                          key={s.sigla}
                          onClick={() => {
                            setFilterState(s.sigla);
                            setFilterCity("");
                            setShowStateList(false);
                          }}
                          className="px-4 py-3 text-sm font-medium hover:bg-muted cursor-pointer border-b last:border-0 active:bg-muted"
                        >
                          {s.nome} ({s.sigla})
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {filterState && (
                  <div className="animate-in fade-in slide-in-from-top-1">
                    <label className="text-sm font-bold flex items-center gap-2 mb-3">
                      <MapPin className="w-4 h-4 text-primary" /> Cidade
                    </label>
                    {loadingCities ? (
                      <div className="w-full p-3 rounded-xl border bg-muted/30 text-muted-foreground text-sm">Carregando cidades...</div>
                    ) : allCities.length === 0 ? (
                      <div className="flex flex-col gap-2">
                        <p className="text-sm text-muted-foreground">Não foi possível carregar as cidades.</p>
                        <button type="button" onClick={() => loadCitiesForState(filterState)} className="w-full p-3 rounded-xl border border-primary bg-primary/10 text-primary text-sm font-medium">
                          Tentar novamente
                        </button>
                      </div>
                    ) : (
                      <select
                        value={filterCity}
                        onChange={(e) => setFilterCity(e.target.value)}
                        className="w-full p-3 rounded-xl border bg-background text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                      >
                        <option value="">Todas as cidades</option>
                        {allCities.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                <div>
                  <label className="text-sm font-bold mb-3 block">Categoria</label>
                  <select autoFocus={false} value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="w-full p-3 rounded-xl border bg-background text-sm">
                    <option value="">Todas</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                {filterCategory && (
                  <div className="animate-in fade-in slide-in-from-top-1">
                    <label className="text-sm font-bold mb-3 block">Profissão</label>
                    <select value={filterProfession} onChange={(e) => setFilterProfession(e.target.value)} className="w-full p-3 rounded-xl border bg-background text-sm">
                      <option value="">Qualquer profissão</option>
                      {professions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                )}

                <div>
                  <label className="text-sm font-bold mb-3 block">Avaliação mínima</label>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button key={star} onClick={() => setFilterMinRating(star === filterMinRating ? 0 : star)} className="p-1 transition-transform active:scale-90">
                        <Star className={`w-8 h-8 ${filterMinRating >= star ? "fill-primary text-primary" : "text-muted-foreground/30"}`} />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-muted/20 rounded-2xl border border-transparent">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                    <span className="text-sm font-bold text-foreground">Apenas Verificados</span>
                  </div>
                  <Switch checked={filterVerified} onCheckedChange={setFilterVerified} />
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4">
                  <button onClick={() => { 
                    setFilterCategory(""); 
                    setFilterProfession(""); 
                    setFilterMinRating(0); 
                    setFilterVerified(false); 
                    setFilterState(userState || ""); 
                    setFilterCity(userCity || ""); 
                    setShowStateList(false);
                  }} className="py-3 text-sm font-semibold text-muted-foreground bg-muted/50 rounded-xl">Limpar</button>
                  <button onClick={() => setIsSheetOpen(false)} className="py-3 text-sm font-bold text-white bg-primary rounded-xl">Aplicar</button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[1,2,3,4].map(i => <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />)}
          </div>
        ) : (
          <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {prosToShow.map((pro) => (
              <Link key={pro.id} to={`/professional/${pro.id}`} className="flex items-center gap-3 bg-card border rounded-2xl p-4 hover:border-primary/30 transition-all group">
                <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground overflow-hidden border-2 border-background shadow-sm">
                  {pro.avatar_url ? <img src={pro.avatar_url} className="w-full h-full object-cover" /> : pro.full_name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 text-foreground">
                    <p className="font-bold text-sm truncate group-hover:text-primary transition-colors">{pro.full_name}</p>
                    {pro.verified && <BadgeCheck className="w-4 h-4 text-primary" />}
                  </div>
                  <p className="text-xs text-muted-foreground truncate font-medium">{pro.category_name} · {pro.profession_name}</p>
                  <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 fill-primary text-primary" />
                      <span className="text-xs font-bold text-foreground">{Number(pro.rating).toFixed(1)}</span>
                    </div>
                    {userCoords && pro.distance !== undefined && (
                      <p className="text-[10px] text-primary font-bold bg-primary/5 px-2 py-0.5 rounded-full">
                        {pro.distance < 1 ? 'Menos de 1km' : `${Math.round(pro.distance)} km`}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
          {hasMore && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="px-6 py-3 rounded-xl border-2 border-primary text-primary font-semibold text-sm hover:bg-primary/10 transition-colors"
              >
                Ver mais
              </button>
            </div>
          )}
          </>
        )}
      </main>
    </AppLayout>
  );
};

export default Search;