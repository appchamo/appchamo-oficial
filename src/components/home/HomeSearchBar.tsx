import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Star, BadgeCheck, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { sameCityState } from "@/lib/locationUtils";
import { SEARCH_ALIASES, isPrimaryMatch } from "@/lib/searchAliases";

/** Normaliza para busca: minúsculo, sem acentos */
const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

interface SearchResult {
  id: string;
  type: "professional";
  label: string;
  sublabel: string;
  avatar_url?: string | null;
  rating?: number;
  verified?: boolean;
  link: string;
  /** Para matching por categoria/profissão */
  category_name: string;
  profession_name: string;
}

interface HomeSearchBarProps {
  section?: { title?: string; subtitle?: string };
}

/** Verifica se a query dá match no profissional (nome, categoria, profissão ou sinônimos) */
function professionalMatchesQuery(query: string, pro: SearchResult): boolean {
  const q = norm(query);
  if (!q) return false;
  const name = norm(pro.label);
  const cat = norm(pro.category_name);
  const prof = norm(pro.profession_name);
  const fullText = `${name} ${cat} ${prof}`;
  if (fullText.includes(q)) return true;
  const aliasKeys = Object.keys(SEARCH_ALIASES).filter((key) => q.includes(norm(key)) || norm(key).includes(q));
  for (const key of aliasKeys) {
    const terms = SEARCH_ALIASES[key];
    for (const term of terms) {
      if (cat.includes(term) || prof.includes(term) || fullText.includes(term)) return true;
    }
  }
  return false;
}

const HomeSearchBar = ({ section }: HomeSearchBarProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [professionals, setProfessionals] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const placeholder = "O que você procura hoje?";
  const hint = section?.subtitle?.trim() || "Eletricista, beleza, aulas, reparos…";

  useEffect(() => {
    const load = async () => {
      let userCity: string | null = null;
      let userState: string | null = null;
      if (user) {
        const { data } = await supabase.from("profiles").select("address_city, address_state").eq("user_id", user.id).single();
        if (data?.address_city) userCity = data.address_city;
        if (data?.address_state) userState = data.address_state;
      }

      const prosRes = await supabase
        .from("professionals")
        .select("id, rating, verified, user_id, categories(name), professions:profession_id(name)")
        .eq("active", true)
        .eq("profile_status", "approved")
        .order("rating", { ascending: false });

      const pros = prosRes.data || [];
      if (pros.length === 0) {
        setProfessionals([]);
        return;
      }

      const userIds = pros.map((p) => p.user_id);
      const [profilesPublic, profilesLocation] = await Promise.all([
        supabase
          .from("profiles_public")
          .select("user_id, full_name, avatar_url")
          .in("user_id", userIds),
        supabase.from("profiles").select("user_id, address_city, address_state").in("user_id", userIds),
      ]);
      const profileMap = new Map((profilesPublic.data || []).map((p) => [p.user_id, p]));
      const locationMap = new Map((profilesLocation.data || []).map((p) => [p.user_id, p]));
      const prosToShow = (userCity || userState)
        ? pros.filter((p) =>
            sameCityState(
              userCity,
              userState,
              locationMap.get(p.user_id)?.address_city ?? null,
              locationMap.get(p.user_id)?.address_state ?? null
            )
          )
        : pros;

      const items: SearchResult[] = prosToShow.map((p) => {
        const categoryName = (p.categories as any)?.name || "";
        const professionName = (p.professions as any)?.name || "";
        return {
          id: p.id,
          type: "professional" as const,
          label: profileMap.get(p.user_id)?.full_name || "Profissional",
          sublabel: [categoryName, professionName].filter(Boolean).join(" · ") || "—",
          avatar_url: profileMap.get(p.user_id)?.avatar_url || null,
          rating: p.rating,
          verified: p.verified,
          link: `/professional/${p.id}`,
          category_name: categoryName,
          profession_name: professionName,
        };
      });

      setProfessionals(items);
    };
    load();
  }, [user?.id]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowResults(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = searchQuery.trim()
    ? professionals.filter((item) => professionalMatchesQuery(searchQuery.trim(), item))
    : [];

  // Ordenar: 1) significado mais buscado (ex.: pintor de casa, estética beleza), 2) verificados, 3) maior rating
  const query = searchQuery.trim();
  const sorted = [...filtered].sort((a, b) => {
    const aPrimary = isPrimaryMatch(query, a.category_name, a.profession_name);
    const bPrimary = isPrimaryMatch(query, b.category_name, b.profession_name);
    if (aPrimary !== bPrimary) return aPrimary ? -1 : 1;
    if (a.verified !== b.verified) return a.verified ? -1 : 1;
    return (b.rating ?? 0) - (a.rating ?? 0);
  });

  const handleSearchSubmit = () => {
    setShowResults(false);
    navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
  };

  return (
    <div ref={searchRef} className="relative">
      <div className="rounded-2xl border-2 border-primary/25 bg-card shadow-md transition-all hover:border-primary/40 focus-within:border-primary/55 focus-within:shadow-lg focus-within:ring-4 focus-within:ring-primary/15">
        <div className="flex items-center gap-0.5 pl-2 pr-2 py-3 sm:py-3.5">
          <button
            type="button"
            aria-label="Ir para busca"
            onClick={handleSearchSubmit}
            className="shrink-0 p-2.5 rounded-xl bg-primary/12 text-primary hover:bg-primary/18 active:scale-95 transition-colors"
          >
            <Search className="w-5 h-5" strokeWidth={2.5} />
          </button>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowResults(true);
            }}
            onFocus={() => searchQuery.trim() && setShowResults(true)}
            onKeyDown={(e) => e.key === "Enter" && handleSearchSubmit()}
            placeholder={placeholder}
            className="flex-1 min-w-0 bg-transparent text-[15px] sm:text-base leading-tight outline-none text-foreground placeholder:text-muted-foreground placeholder:font-normal"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setShowResults(false);
              }}
              className="shrink-0 p-2 rounded-full hover:bg-muted/70 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Limpar busca"
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-2 px-1 leading-snug">{hint}</p>

      {showResults && searchQuery.trim() && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-card border-2 border-primary/20 rounded-2xl shadow-lg z-30 max-h-80 overflow-y-auto">
          {sorted.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Nenhum profissional encontrado para &quot;{searchQuery}&quot;
            </div>
          ) : (
            <div className="p-2 flex flex-col gap-1">
              {sorted.slice(0, 8).map((item) => {
                const initials = item.label.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
                return (
                  <Link
                    key={item.id}
                    to={item.link}
                    onClick={() => setShowResults(false)}
                    className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-accent transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground overflow-hidden flex-shrink-0">
                      {item.avatar_url ? (
                        <img src={item.avatar_url} alt={item.label} className="w-full h-full object-cover" />
                      ) : (
                        initials
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <p className="text-sm font-medium text-foreground truncate">{item.label}</p>
                        {item.verified && <BadgeCheck className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground">{item.sublabel}</p>
                    </div>
                    {item.rating !== undefined && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Star className="w-3 h-3 fill-primary text-primary" />
                        <span className="text-xs font-medium">{Number(item.rating).toFixed(1)}</span>
                      </div>
                    )}
                  </Link>
                );
              })}
              {sorted.length > 8 && (
                <button onClick={handleSearchSubmit} className="text-xs text-primary font-medium text-center py-2 hover:underline">
                  Ver todos os {sorted.length} resultados →
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default HomeSearchBar;
