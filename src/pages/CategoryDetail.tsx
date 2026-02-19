import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Star, BadgeCheck, MapPin, ChevronRight } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Profession {
  id: string;
  name: string;
  proCount: number;
}

interface Pro {
  id: string;
  rating: number;
  total_services: number;
  verified: boolean;
  full_name: string;
  avatar_url: string | null;
  user_type: string;
  city: string | null;
  state: string | null;
}

const CategoryDetail = () => {
  const { id: slug } = useParams();
  const [categoryName, setCategoryName] = useState("Categoria");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [professions, setProfessions] = useState<Profession[]>([]);
  const [selectedProfession, setSelectedProfession] = useState<Profession | null>(null);
  const [pros, setPros] = useState<Pro[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPros, setLoadingPros] = useState(false);

  // Load category + professions
  useEffect(() => {
    const load = async () => {
      const { data: cat } = await supabase.from("categories").select("id, name").eq("slug", slug!).single();
      if (!cat) { setLoading(false); return; }
      setCategoryName(cat.name);
      setCategoryId(cat.id);

      // Fetch professions for this category
      const { data: profs } = await supabase
        .from("professions")
        .select("id, name")
        .eq("category_id", cat.id)
        .eq("active", true)
        .order("sort_order");

      if (!profs || profs.length === 0) {
        // No professions — load pros directly by category
        setProfessions([]);
        await loadProsByCategory(cat.id);
        return;
      }

      // Count professionals per profession
      const { data: allPros } = await supabase
        .from("professionals")
        .select("id, profession_id")
        .eq("category_id", cat.id)
        .eq("active", true)
        .eq("profile_status", "approved")
        .neq("availability_status", "unavailable");

      const countMap = new Map<string, number>();
      (allPros || []).forEach(p => {
        if (p.profession_id) countMap.set(p.profession_id, (countMap.get(p.profession_id) || 0) + 1);
      });

      setProfessions(profs.map(pr => ({
        ...pr,
        proCount: countMap.get(pr.id) || 0,
      })));
      setLoading(false);
    };
    if (slug) load();
  }, [slug]);

  const loadProsByCategory = async (catId: string) => {
    setLoadingPros(true);
    const { data } = await supabase
      .from("professionals")
      .select("id, rating, total_services, verified, user_id, availability_status")
      .eq("category_id", catId)
      .eq("active", true)
      .eq("profile_status", "approved")
      .neq("availability_status", "unavailable")
      .order("rating", { ascending: false });

    if (!data || data.length === 0) { setPros([]); setLoading(false); setLoadingPros(false); return; }
    await enrichPros(data);
    setLoading(false);
    setLoadingPros(false);
  };

  const loadProsByProfession = async (profession: Profession) => {
    setSelectedProfession(profession);
    setLoadingPros(true);
    const { data } = await supabase
      .from("professionals")
      .select("id, rating, total_services, verified, user_id, availability_status")
      .eq("profession_id", profession.id)
      .eq("active", true)
      .eq("profile_status", "approved")
      .neq("availability_status", "unavailable")
      .order("rating", { ascending: false });

    if (!data || data.length === 0) { setPros([]); setLoadingPros(false); return; }
    await enrichPros(data);
    setLoadingPros(false);
  };

  const enrichPros = async (data: any[]) => {
    const userIds = data.map(p => p.user_id);
    const [profilesRes, locationsRes] = await Promise.all([
      supabase.from("profiles_public" as any).select("user_id, full_name, avatar_url").in("user_id", userIds),
      supabase.from("profiles").select("user_id, address_city, address_state").in("user_id", userIds),
    ]);
    const profileMap = new Map(((profilesRes.data || []) as any[]).map(p => [p.user_id, p]));
    const locationMap = new Map((locationsRes.data || []).map(p => [p.user_id, p]));
    setPros(data.map(p => ({
      id: p.id,
      rating: p.rating,
      total_services: p.total_services,
      verified: p.verified,
      full_name: profileMap.get(p.user_id)?.full_name || "Profissional",
      avatar_url: profileMap.get(p.user_id)?.avatar_url || null,
      user_type: profileMap.get(p.user_id)?.user_type || "professional",
      city: locationMap.get(p.user_id)?.address_city || null,
      state: locationMap.get(p.user_id)?.address_state || null,
    })));
  };

  const goBack = () => {
    if (selectedProfession) {
      setSelectedProfession(null);
      setPros([]);
    }
  };

  return (
    <AppLayout>
      <main className="max-w-screen-lg mx-auto px-4 py-5">
        {selectedProfession ? (
          <button onClick={goBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4" /> {categoryName}
          </button>
        ) : (
          <Link to="/categories" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Link>
        )}

        <h1 className="text-xl font-bold text-foreground mb-4">
          {selectedProfession ? selectedProfession.name : categoryName}
        </h1>

        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div>
        ) : !selectedProfession && professions.length > 0 ? (
          /* Show professions grid */
          <div className="flex flex-col gap-2">
            {professions.map((prof) => (
              <button
                key={prof.id}
                onClick={() => loadProsByProfession(prof)}
                className="flex items-center justify-between bg-card border rounded-xl p-4 hover:border-primary/30 hover:shadow-card transition-all text-left"
              >
                <div>
                  <p className="font-semibold text-sm text-foreground">{prof.name}</p>
                  <p className="text-xs text-muted-foreground">{prof.proCount} profissional(is)</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        ) : loadingPros ? (
          <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" /></div>
        ) : pros.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Nenhum profissional encontrado</div>
        ) : (
          <div className="flex flex-col gap-3">
            {pros.map((pro) => {
              const initials = pro.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
              return (
                <Link key={pro.id} to={`/professional/${pro.id}`}
                  className="flex items-center gap-3 bg-card border rounded-xl p-4 hover:border-primary/30 hover:shadow-card transition-all">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground overflow-hidden">
                    {pro.avatar_url ? <img src={pro.avatar_url} alt={pro.full_name} className="w-full h-full object-cover" /> : initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="font-semibold text-sm text-foreground">{pro.full_name}</p>
                      {pro.verified && <BadgeCheck className="w-4 h-4 text-primary flex-shrink-0" />}
                    </div>
                    {(pro.city || pro.state) && (
                      <p className="text-[11px] text-muted-foreground flex items-center gap-0.5 mt-0.5">
                        <MapPin className="w-3 h-3" /> {[pro.city, pro.state].filter(Boolean).join(", ")}
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

export default CategoryDetail;
