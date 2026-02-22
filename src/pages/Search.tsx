import AppLayout from "@/components/AppLayout";
import { Search as SearchIcon, SlidersHorizontal, Star, BadgeCheck, X, MapPin, Filter, CheckCircle2, Navigation } from "lucide-react";
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

const Search = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [pros, setPros] = useState<Pro[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [userCity, setUserCity] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const [userCoords, setUserCoords] = useState<{lat: number, lng: number} | null>(null);
  const [filterRadius, setFilterRadius] = useState<number>(100);

  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterProfession, setFilterProfession] = useState<string>("");
  const [professions, setProfessions] = useState<Profession[]>([]);
  const [filterMinRating, setFilterMinRating] = useState<number>(0);
  const [filterVerified, setFilterVerified] = useState(false);

  // ✅ AJUSTE: Permite calcular distância mesmo sem login (usando Patrocínio como base temporária)
  useEffect(() => {
    const loadUserLocation = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        // Se NÃO estiver logado, assume o centro de Patrocínio para não quebrar a tela de testes
        setUserCoords({ lat: -18.9431, lng: -46.9922 });
        return;
      }
      
      const { data } = await supabase.from("profiles").select("address_city, latitude, longitude").eq("user_id", user.id).single();
      
      if (data?.address_city) setUserCity(data.address_city);
      
      if (data?.latitude && data?.longitude) {
        setUserCoords({ lat: data.latitude, lng: data.longitude });
      } else {
        // Fallback caso o perfil do usuário logado não tenha coordenadas
        setUserCoords({ lat: -18.9431, lng: -46.9922 });
      }
    };
    loadUserLocation();
  }, []);

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
      supabase.from("profiles").select("user_id, address_city, address_state, latitude, longitude").in("user_id", userIds),
    ]);

    const profileMap = new Map(((profilesRes.data || []) as any[]).map((p) => [p.user_id, p]));
    const locationMap = new Map(((fullProfilesRes.data || []) as any[]).map((p) => [p.user_id, p]));

    const mappedPros = prosRes.data.map((p) => {
      const loc = locationMap.get(p.user_id);
      let distance = undefined;

      if (userCoords && loc?.latitude && loc?.longitude) {
        const R = 6371; 
        const dLat = (loc.latitude - userCoords.lat) * Math.PI / 180;
        const dLon = (loc.longitude - userCoords.lng) * Math.PI / 180;
        const a = 
          Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(userCoords.lat * Math.PI / 180) * Math.cos(loc.latitude * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        distance = R * c;
      }

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
        distance: distance
      };
    });

    if (userCoords) {
      mappedPros.sort((a, b) => (a.distance || 999) - (b.distance || 999));
    }

    setPros(mappedPros);
    setLoading(false);
  };

  useEffect(() => { loadPros(); }, [userCoords]);

  const filtered = pros.filter((p) => {
    const q = search.trim().toLowerCase();
    if (q) {
      const target = `${p.full_name} ${p.category_name} ${p.profession_name} ${p.city || ""} ${p.state || ""}`.toLowerCase();
      if (!fuzzyMatch(q, target)) return false;
    }
    if (filterCategory && p.category_id !== filterCategory) return false;
    if (filterProfession && p.profession_id !== filterProfession) return false;
    if (filterMinRating > 0 && p.rating < filterMinRating) return false;
    if (filterVerified && !p.verified) return false;
    
    // Filtra pela distância
    if (p.distance !== undefined && p.distance > filterRadius) return false;
    
    return true;
  });

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
          
          <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
            <SheetTrigger asChild>
              <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-card hover:bg-muted transition-colors text-xs font-semibold">
                <SlidersHorizontal className="w-3.5 h-3.5" /> Filtros
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-3xl h-[85vh] overflow-y-auto">
              <SheetHeader><SheetTitle>Filtrar</SheetTitle></SheetHeader>
              <div className="py-6 space-y-6">
                
                {/* BARRA DE DISTÂNCIA */}
                {userCoords && (
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <label className="text-sm font-bold flex items-center gap-2">
                        <Navigation className="w-4 h-4 text-primary" /> Distância máxima
                      </label>
                      <span className="text-xs font-bold text-primary">{filterRadius} km</span>
                    </div>
                    <Slider 
                      value={[filterRadius]} 
                      onValueChange={([v]) => setFilterRadius(v)} 
                      max={150} 
                      step={5} 
                      className="py-4"
                    />
                    <p className="text-[10px] text-muted-foreground">Mostrando profissionais em até {filterRadius}km de você.</p>
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
                  <button onClick={() => { setFilterCategory(""); setFilterProfession(""); setFilterMinRating(0); setFilterVerified(false); setFilterRadius(100); }} className="py-3 text-sm font-semibold text-muted-foreground bg-muted/50 rounded-xl">Limpar</button>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map((pro) => (
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
                    {/* SÓ MOSTRA A DISTÂNCIA SE TIVER A COORDENADA DO USUÁRIO VÁLIDA */}
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
        )}
      </main>
    </AppLayout>
  );
};

export default Search;