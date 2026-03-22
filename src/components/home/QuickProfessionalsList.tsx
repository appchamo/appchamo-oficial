import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ChevronRight } from "lucide-react";

interface QuickPro {
  id: string;
  full_name: string;
  profession_name: string;
  avatar_url: string | null;
}

const QuickProfessionalsList = () => {
  const [pros, setPros] = useState<QuickPro[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("professionals")
        .select("id, user_id, professions:profession_id(name), categories(name)")
        .eq("active", true)
        .eq("profile_status", "approved")
        .neq("availability_status", "unavailable")
        .order("rating", { ascending: false })
        .limit(10);

      if (!data || data.length === 0) { setLoaded(true); return; }

      const userIds = data.map((p: any) => p.user_id);
      const { data: profiles } = await supabase
        .from("profiles_public" as any)
        .select("user_id, full_name, avatar_url")
        .in("user_id", userIds);

      const profileMap = new Map(
        ((profiles || []) as any[]).map((p) => [p.user_id, p])
      );

      // Ordem aleatória a cada carregamento
      for (let i = data.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [data[i], data[j]] = [data[j], data[i]];
      }
      const list: QuickPro[] = data.slice(0, 5).map((p: any) => ({
        id: p.id,
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
        {pros.map((pro, i) => {
          const initials = pro.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
          const avatarUrl = pro.avatar_url?.startsWith("http")
            ? pro.avatar_url
            : pro.avatar_url
            ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/uploads/${pro.avatar_url}`
            : null;

          return (
            <Link
              key={pro.id}
              to={`/professional/${pro.id}`}
              className={`flex items-center gap-3 px-4 py-3 active:bg-muted/50 transition-colors ${
                i < pros.length - 1 ? "border-b border-border/60" : ""
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary overflow-hidden shrink-0">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={pro.full_name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
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
          );
        })}
      </div>
    </section>
  );
};

export default QuickProfessionalsList;
