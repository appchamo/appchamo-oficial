import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Star, BadgeCheck, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fuzzyMatch, normalize } from "@/lib/fuzzyMatch";

interface SearchResult {
  id: string;
  type: "professional" | "category" | "profession";
  label: string;
  sublabel: string;
  avatar_url?: string | null;
  rating?: number;
  verified?: boolean;
  link: string;
}

interface HomeSearchBarProps {
  section?: { title?: string; subtitle?: string };
}

const HomeSearchBar = ({ section }: HomeSearchBarProps) => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [allItems, setAllItems] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const placeholder = section?.title || "Buscar profissional ou serviço...";
  const hint = section?.subtitle || "Ex: eletricista, encanador, designer...";

  useEffect(() => {
    const load = async () => {
      const [prosRes, catsRes, profsRes] = await Promise.all([
        supabase
          .from("professionals")
          .select("id, rating, verified, user_id, categories(name)")
          .eq("active", true)
          .eq("profile_status", "approved")
          .order("rating", { ascending: false }),
        supabase.from("categories").select("id, name, slug").eq("active", true).order("sort_order"),
        supabase.from("professions").select("id, name, category_id, categories:category_id(name, slug)").eq("active", true),
      ]);

      const items: SearchResult[] = [];

      // Categories
      (catsRes.data || []).forEach(c => {
        items.push({ id: c.id, type: "category", label: c.name, sublabel: "Categoria", link: `/category/${c.slug}` });
      });

      // Professions
      (profsRes.data || []).forEach((p: any) => {
        const catSlug = p.categories?.slug;
        items.push({
          id: p.id, type: "profession", label: p.name,
          sublabel: p.categories?.name || "Profissão",
          link: catSlug ? `/category/${catSlug}` : "/categories",
        });
      });

      // Professionals
      const pros = prosRes.data || [];
      if (pros.length > 0) {
        const userIds = pros.map(p => p.user_id);
        const { data: profiles } = await supabase
          .from("profiles_public")
          .select("user_id, full_name, avatar_url")
          .in("user_id", userIds);
        const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
        pros.forEach(p => {
          items.push({
            id: p.id, type: "professional",
            label: profileMap.get(p.user_id)?.full_name || "Profissional",
            sublabel: (p.categories as any)?.name || "—",
            avatar_url: profileMap.get(p.user_id)?.avatar_url || null,
            rating: p.rating, verified: p.verified,
            link: `/professional/${p.id}`,
          });
        });
      }

      setAllItems(items);
    };
    load();
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowResults(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = searchQuery.trim()
    ? allItems.filter(item => fuzzyMatch(searchQuery.trim(), `${item.label} ${item.sublabel}`))
    : [];

  // Sort: categories first, then professions, then professionals
  const sorted = filtered.sort((a, b) => {
    const order = { category: 0, profession: 1, professional: 2 };
    return (order[a.type] || 2) - (order[b.type] || 2);
  });

  const handleSearchSubmit = () => {
    setShowResults(false);
    navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
  };

  return (
    <div ref={searchRef} className="relative">
      <div className="flex items-center gap-3 border-2 border-primary/20 rounded-2xl px-4 py-3.5 bg-card hover:border-primary/40 transition-all shadow-sm">
        <div onClick={handleSearchSubmit}
          className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center cursor-pointer hover:bg-primary/20 transition-colors">
          <Search className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <input type="text" value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setShowResults(true); }}
            onFocus={() => searchQuery.trim() && setShowResults(true)}
            onKeyDown={(e) => e.key === "Enter" && handleSearchSubmit()}
            placeholder={placeholder}
            className="w-full bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground" />
          <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>
        </div>
        {searchQuery && (
          <button onClick={() => { setSearchQuery(""); setShowResults(false); }} className="p-1">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {showResults && searchQuery.trim() && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-card border-2 border-primary/20 rounded-2xl shadow-lg z-30 max-h-80 overflow-y-auto">
          {sorted.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Nenhum resultado para "{searchQuery}"
            </div>
          ) : (
            <div className="p-2 flex flex-col gap-1">
              {sorted.slice(0, 8).map((item) => {
                const typeLabel = item.type === "category" ? "📂" : item.type === "profession" ? "🔧" : "";
                const initials = item.label.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
                return (
                  <Link key={`${item.type}-${item.id}`} to={item.link}
                    onClick={() => setShowResults(false)}
                    className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-accent transition-colors">
                    {item.type === "professional" ? (
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground overflow-hidden flex-shrink-0">
                        {item.avatar_url ? <img src={item.avatar_url} alt={item.label} className="w-full h-full object-cover" /> : initials}
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-base flex-shrink-0">
                        {typeLabel}
                      </div>
                    )}
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
