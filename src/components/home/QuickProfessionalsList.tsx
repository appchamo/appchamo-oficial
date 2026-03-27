import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ChevronRight } from "lucide-react";
import { useProProfileImpression } from "@/hooks/useProProfileImpression";

interface QuickPro {
  id: string;
  user_id: string;
  full_name: string;
  profession_name: string;
  avatar_url: string | null;
}

function QuickProRow({ pro, isLast }: { pro: QuickPro; isLast: boolean }) {
  const impressionRef = useProProfileImpression(pro.user_id);
  const initials = pro.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const avatarUrl = pro.avatar_url?.startsWith("http")
    ? pro.avatar_url
    : pro.avatar_url
      ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/uploads/${pro.avatar_url}`
      : null;

  return (
    <div ref={impressionRef}>
      <Link
        to={`/professional/${pro.id}`}
        className={`flex items-center gap-3 px-4 py-3 active:bg-muted/50 transition-colors w-full ${
          !isLast ? "border-b border-border/60" : ""
        }`}
      >
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary overflow-hidden shrink-0">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={pro.full_name}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            initials
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{pro.full_name}</p>
          <p className="text-xs font-medium text-primary truncate">{pro.profession_name}</p>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
      </Link>
    </div>
  );
}

const LOCATION_CACHE_KEY = "chamo_user_location_v1";

function getCachedCity(): string | null {
  try {
    const raw = localStorage.getItem(LOCATION_CACHE_KEY);
    if (!raw) return null;
    const { city, ts } = JSON.parse(raw);
    if (Date.now() - ts > 5 * 60 * 1000) return null;
    return city ?? null;
  } catch { return null; }
}

const QuickProfessionalsList = () => {
  const [pros, setPros] = useState<QuickPro[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      // Tenta filtrar por cidade do usuário para relevância local
      const cachedCity = getCachedCity();
      let locationUserIds: string[] | null = null;

      if (cachedCity) {
        const { data: locProfiles } = await supabase
          .from("profiles")
          .select("user_id")
          .ilike("address_city", cachedCity)
          .limit(150);
        if (locProfiles && locProfiles.length > 0) {
          locationUserIds = locProfiles.map((p: any) => p.user_id);
        }
      }

      let query = supabase
        .from("professionals")
        .select("id, user_id, professions:profession_id(name), categories(name)")
        .eq("active", true)
        .eq("profile_status", "approved")
        .neq("availability_status", "unavailable")
        .order("rating", { ascending: false });

      if (locationUserIds && locationUserIds.length > 0) {
        query = query.in("user_id", locationUserIds);
      }
      query = query.limit(20);

      const { data } = await query;

      // Fallback: se não encontrou nenhum na cidade, busca todos
      let finalData = data;
      if (!finalData || finalData.length === 0) {
        const { data: fallback } = await supabase
          .from("professionals")
          .select("id, user_id, professions:profession_id(name), categories(name)")
          .eq("active", true)
          .eq("profile_status", "approved")
          .neq("availability_status", "unavailable")
          .order("rating", { ascending: false })
          .limit(20);
        finalData = fallback;
      }

      if (!finalData || finalData.length === 0) { setLoaded(true); return; }

      const userIds = finalData.map((p: any) => p.user_id);
      const { data: profiles } = await supabase
        .from("profiles_public" as any)
        .select("user_id, full_name, avatar_url")
        .in("user_id", userIds);

      const profileMap = new Map(
        ((profiles || []) as any[]).map((p) => [p.user_id, p])
      );

      // Ordem aleatória a cada carregamento
      for (let i = finalData.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [finalData[i], finalData[j]] = [finalData[j], finalData[i]];
      }
      const list: QuickPro[] = finalData.slice(0, 5).map((p: any) => ({
        id: p.id,
        user_id: p.user_id,
        full_name: profileMap.get(p.user_id)?.full_name || "Profissional",
        profession_name: (p.professions as any)?.name || (p.categories as any)?.name || "—",
        avatar_url: profileMap.get(p.user_id)?.avatar_url || null,
      }));

      setPros(list);
      setLoaded(true);
    };
    load();
  }, []);

  if (!loaded || pros.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="font-semibold text-foreground">Profissionais próximos</h3>
        <Link to="/search" className="flex items-center gap-0.5 text-xs font-semibold text-primary hover:underline">
          Ver todos <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="bg-card border rounded-2xl overflow-hidden shadow-sm">
        {pros.map((pro, i) => (
          <QuickProRow key={pro.id} pro={pro} isLast={i === pros.length - 1} />
        ))}
      </div>
    </section>
  );
};

export default QuickProfessionalsList;
