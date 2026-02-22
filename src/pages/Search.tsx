import AppLayout from "@/components/AppLayout";
import { Search as SearchIcon, SlidersHorizontal, Star, BadgeCheck, MapPin, Building2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";

const Search = () => {
  const [search, setSearch] = useState("");
  const [pros, setPros] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterCity, setFilterCity] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterVerifiedOnly, setFilterVerifiedOnly] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const { data: cats } = await supabase.from("categories").select("id, name");
      setCategories(cats || []);

      // 1. Busca Profissionais e tenta trazer o perfil e assinatura junto (Join)
      const { data: professionals, error: proError } = await supabase
        .from("professionals")
        .select(`
          *,
          profiles:user_id (full_name, avatar_url, address_city),
          subscriptions:user_id (plan_id)
        `)
        .eq("active", true)
        .eq("profile_status", "approved");

      if (proError) throw proError;

      if (professionals) {
        const formattedPros = professionals.map(p => ({
          ...p,
          // ✅ Garante que se o Join falhar, ele não quebre a exibição
          full_name: (p.profiles as any)?.full_name || "Profissional",
          avatar_url: (p.profiles as any)?.avatar_url || null,
          city: (p.profiles as any)?.address_city || "",
          plan_id: (p.subscriptions as any)?.[0]?.plan_id || "free"
        }));
        setPros(formattedPros);
      }
    } catch (err) {
      console.error("Erro ao carregar profissionais:", err);
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
    const verifiedMatch = !filterVerifiedOnly || p.verified === true;
    return nameMatch && cityMatch && catMatch && verifiedMatch;
  });

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5 pb-24 text-foreground">
        <div className="relative mb-6">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar pelo nome do profissional..."
            className="w-full pl-12 pr-4 py-4 bg-card border-2 rounded-2xl outline-none focus:border-primary/50 transition-all"
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
            <SheetContent side="bottom" className="rounded-t-3xl h-[60vh] overflow-y-auto">
              <SheetHeader><SheetTitle>Filtrar</SheetTitle></SheetHeader>
              <div className="py-6 space-y-6">
                <div>
                  <label className="text-sm font-bold mb-2 block">Cidade</label>
                  <input value={filterCity} onChange={(e) => setFilterCity(e.target.value)} placeholder="Ex: Patrocínio" className="w-full p-3 rounded-xl border bg-background" />
                </div>
                <div>
                  <label className="text-sm font-bold mb-2 block">Categoria</label>
                  <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="w-full p-3 rounded-xl border bg-background">
                    <option value="">Todas</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="flex items-center justify-between p-4 bg-muted/20 rounded-2xl">
                  <span className="text-sm font-bold">Apenas Verificados</span>
                  <Switch checked={filterVerifiedOnly} onCheckedChange={setFilterVerifiedOnly} />
                </div>
                <button onClick={() => {setSearch(""); setFilterCity(""); setFilterCategory(""); setFilterVerifiedOnly(false);}} className="w-full py-3 text-primary font-bold">Limpar Filtros</button>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1,2,3,4].map(i => <div key={i} className="h-28 bg-muted animate-pulse rounded-2xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed rounded-3xl">
            <p className="font-bold text-muted-foreground">Nenhum profissional encontrado</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map((pro) => (
              <Link key={pro.id} to={`/professional/${pro.id}`} className="flex items-center gap-4 bg-card border rounded-2xl p-4 hover:border-primary/30 transition-all group">
                {/* ✅ EXIBIÇÃO DA FOTO CORRIGIDA */}
                <div className="w-14 h-14 rounded-full bg-muted overflow-hidden border-2 border-background shadow-sm flex-shrink-0">
                  {pro.avatar_url ? (
                    <img src={pro.avatar_url} alt={pro.full_name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-bold text-muted-foreground/50">
                      {pro.full_name.charAt(0)}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-bold text-sm truncate group-hover:text-primary transition-colors">{pro.full_name}</p>
                    {pro.verified && <BadgeCheck className="w-4 h-4 text-primary" />}
                    {pro.plan_id === 'business' && <Building2 className="w-3.5 h-3.5 text-orange-500" />}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex items-center gap-1 bg-primary/5 px-2 py-0.5 rounded-full">
                      <Star className="w-3 h-3 fill-primary text-primary" />
                      <span className="text-[10px] font-bold text-primary">{Number(pro.rating).toFixed(1)}</span>
                    </div>
                    {pro.city && <p className="text-[10px] text-muted-foreground truncate flex items-center gap-0.5"><MapPin className="w-3 h-3" /> {pro.city}</p>}
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