import AppLayout from "@/components/AppLayout";
import { Search as SearchIcon, SlidersHorizontal, Star, BadgeCheck, X, MapPin, Building2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

const Search = () => {
  const [search, setSearch] = useState("");
  const [pros, setPros] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros Manuais
  const [filterCity, setFilterCity] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterMinRating, setFilterMinRating] = useState(0);
  const [filterVerifiedOnly, setFilterVerifiedOnly] = useState(false);
  const [filterRadius, setFilterRadius] = useState(150);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      // 1. Busca Categorias
      const { data: cats } = await supabase.from("categories").select("id, name");
      setCategories(cats || []);

      // 2. Busca Profissionais (Simplificado para não dar erro de relação)
      const { data: professionals, error: proError } = await supabase
        .from("professionals")
        .select("*")
        .eq("active", true)
        .eq("profile_status", "approved");

      if (proError) throw proError;

      if (professionals && professionals.length > 0) {
        const userIds = professionals.map(p => p.user_id);
        
        // 3. Busca Perfis vinculados
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name, avatar_url, address_city")
          .in("user_id", userIds);

        // 4. Busca Assinaturas para saber quem é Empresa
        const { data: subs } = await supabase
          .from("subscriptions")
          .select("user_id, plan_id")
          .in("user_id", userIds);

        const profileMap = new Map(profiles?.map(p => [p.user_id, p]));
        const subMap = new Map(subs?.map(s => [s.user_id, s.plan_id]));

        // Monta a lista final
        const combined = professionals.map(p => {
          const profile = profileMap.get(p.user_id);
          return {
            ...p,
            full_name: profile?.full_name || "Profissional",
            avatar_url: profile?.avatar_url || null,
            city: profile?.address_city || "",
            plan_id: subMap.get(p.user_id) || "free"
          };
        });

        setPros(combined);
      }
    } catch (err) {
      console.error("Erro ao carregar:", err);
    } finally {
      setLoading(false);
    }
  };

  const normalize = (str: string) => 
    str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";

  const filtered = pros.filter(p => {
    const nameMatch = normalize(p.full_name).includes(normalize(search));
    const cityMatch = filterCity === "" || normalize(p.city).includes(normalize(filterCity));
    const catMatch = filterCategory === "" || p.category_id === filterCategory;
    const rateMatch = p.rating >= filterMinRating;
    const verifiedMatch = !filterVerifiedOnly || p.verified === true;

    return nameMatch && cityMatch && catMatch && rateMatch && verifiedMatch;
  });

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5 pb-24 text-foreground">
        {/* BARRA DE PESQUISA */}
        <div className="relative mb-6">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquise pelo nome..."
            className="w-full pl-12 pr-4 py-4 bg-card border-2 rounded-2xl outline-none focus:border-primary/50"
          />
        </div>

        {/* HEADER E FILTROS */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-bold">Explorar</h1>
          <Sheet>
            <SheetTrigger asChild>
              <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-card border text-sm font-semibold">
                <SlidersHorizontal className="w-4 h-4" /> Filtros
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-3xl h-[70vh] overflow-y-auto">
              <SheetHeader><SheetTitle>Filtros Manuais</SheetTitle></SheetHeader>
              <div className="py-6 space-y-6">
                <div>
                  <label className="text-sm font-bold mb-2 block">Cidade</label>
                  <input 
                    value={filterCity} onChange={(e) => setFilterCity(e.target.value)}
                    placeholder="Ex: Patrocínio" className="w-full p-3 rounded-xl border bg-background" 
                  />
                </div>
                <div>
                  <label className="text-sm font-bold mb-2 block">Categoria</label>
                  <select 
                    value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
                    className="w-full p-3 rounded-xl border bg-background"
                  >
                    <option value="">Todas</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="flex items-center justify-between p-4 bg-muted/20 rounded-2xl">
                  <span className="text-sm font-bold">Apenas Verificados</span>
                  <Switch checked={filterVerifiedOnly} onCheckedChange={setFilterVerifiedOnly} />
                </div>
                <button 
                  onClick={() => {setSearch(""); setFilterCity(""); setFilterCategory(""); setFilterVerifiedOnly(false);}}
                  className="w-full py-3 text-primary font-bold"
                >
                  Limpar Tudo
                </button>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* LISTAGEM */}
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-2xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed rounded-3xl">
            <p className="font-bold text-muted-foreground">Nenhum profissional encontrado</p>
            <button onClick={loadInitialData} className="text-primary text-xs font-bold underline mt-2">Recarregar lista</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map((pro) => (
              <Link key={pro.id} to={`/professional/${pro.id}`} className="flex items-center gap-4 bg-card border rounded-2xl p-4">
                <div className="w-14 h-14 rounded-full bg-muted overflow-hidden border flex-shrink-0">
                  {pro.avatar_url ? <img src={pro.avatar_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-bold">{pro.full_name[0]}</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="font-bold text-sm truncate">{pro.full_name}</p>
                    {pro.verified && <BadgeCheck className="w-4 h-4 text-primary" />}
                    {pro.plan_id === 'business' && <Building2 className="w-3.5 h-3.5 text-orange-500" />}
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <Star className="w-3 h-3 fill-primary text-primary" />
                    <span className="text-[10px] font-bold">{Number(pro.rating).toFixed(1)}</span>
                    {pro.city && <span className="text-[10px] text-muted-foreground ml-2">| {pro.city}</span>}
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