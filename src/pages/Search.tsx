import AppLayout from "@/components/AppLayout";
import { Search as SearchIcon, SlidersHorizontal, Star, BadgeCheck, X, MapPin, Filter } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
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
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [pros, setPros] = useState<Pro[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);

  const [userCity, setUserCity] = useState<string | null>(null);

  // Filters
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterCity, setFilterCity] = useState("");
  const [filterState, setFilterState] = useState("");
  const [filterCountry, setFilterCountry] = useState("");
  const [filterMinRating, setFilterMinRating] = useState<number>(0);
  const [filterVerified, setFilterVerified] = useState(false);
  const [filterRadius, setFilterRadius] = useState<number>(0);

  // 🔥 BUSCA CIDADE DO USUÁRIO LOGADO
  useEffect(() => {
    const loadUserCity = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("profiles")
        .select("address_city")
        .eq("user_id", user.id)
        .single();

      if (data?.address_city) {
        setUserCity(data.address_city);
      }
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

    const professionals = prosRes.data;
    if (!professionals) {
      setPros([]);
      setLoading(false);
      return;
    }

    const userIds = professionals.map((p) => p.user_id);

    const [profilesRes, fullProfilesRes] = await Promise.all([
      supabase.from("profiles_public" as any).select("user_id, full_name, avatar_url").in("user_id", userIds),
      supabase.from("profiles").select("user_id, address_city, address_state").in("user_id", userIds),
    ]);

    const profileMap = new Map(((profilesRes.data || []) as any[]).map((p) => [p.user_id, p]));
    const locationMap = new Map(((fullProfilesRes.data || []) as any[]).map((p) => [p.user_id, p]));

    setPros(
      professionals.map((p) => ({
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
      }))
    );

    setLoading(false);
  };

  useEffect(() => { loadPros(); }, []);

  const filtered = pros.filter((p) => {
    const q = search.trim();
    if (q) {
      const target = `${p.full_name} ${p.category_name} ${p.profession_name} ${p.city || ""} ${p.state || ""}`;
      if (!fuzzyMatch(q, target)) return false;
    }

    if (filterCategory && p.category_id !== filterCategory) return false;

    // 🔥 FILTRO AUTOMÁTICO POR CIDADE DO USUÁRIO
    const cityToUse = filterCity || userCity;

    if (cityToUse && (!p.city || !fuzzyMatch(cityToUse, p.city))) return false;

    if (filterState && (!p.state || !fuzzyMatch(filterState, p.state))) return false;
    if (filterMinRating > 0 && p.rating < filterMinRating) return false;
    if (filterVerified && !p.verified) return false;

    return true;
  });

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5">
        <h1 className="text-xl font-bold text-foreground mb-4">Buscar Profissionais</h1>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Nenhum profissional encontrado na sua cidade.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((pro) => {
              const initials = pro.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

              return (
                <Link
                  key={pro.id}
                  to={`/professional/${pro.id}`}
                  className="flex items-center gap-3 bg-card border rounded-xl p-4 hover:border-primary/30 hover:shadow-card transition-all"
                >
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground overflow-hidden">
                    {pro.avatar_url ? (
                      <img src={pro.avatar_url} alt={pro.full_name} className="w-full h-full object-cover" />
                    ) : (
                      initials
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="font-semibold text-sm text-foreground truncate">{pro.full_name}</p>
                      {pro.verified && <BadgeCheck className="w-4 h-4 text-primary flex-shrink-0" />}
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {pro.category_name}
                      {pro.profession_name ? ` · ${pro.profession_name}` : ""}
                    </p>

                    {(pro.city || pro.state) && (
                      <p className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                        <MapPin className="w-3 h-3" />
                        {[pro.city, pro.state].filter(Boolean).join(", ")}
                      </p>
                    )}

                    <div className="flex items-center gap-2 mt-0.5">
                      <Star className="w-3.5 h-3.5 fill-primary text-primary" />
                      <span className="text-xs font-medium">{Number(pro.rating).toFixed(1)}</span>
                      <span className="text-xs text-muted-foreground">· {pro.total_services} serviços</span>
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
