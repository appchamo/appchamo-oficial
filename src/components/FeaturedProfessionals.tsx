import { Star, BadgeCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Pro {
  id: string;
  rating: number;
  total_services: number;
  verified: boolean;
  user_id: string;
  category_name: string;
  full_name: string;
  avatar_url: string | null;
}

/**
 * 🔥 FUNÇÃO QUE CORRIGE O AVATAR
 */
const getAvatarUrl = (avatarUrl?: string | null) => {
  if (!avatarUrl) return null;

  // Se já for URL completa (modelo antigo)
  if (avatarUrl.startsWith("http")) {
    return avatarUrl;
  }

  // Modelo novo (path salvo no banco)
  return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/uploads/${avatarUrl}`;
};

const FeaturedProfessionals = () => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [professionals, setProfessionals] = useState<Pro[]>([]);
  const cardWidth = 216;

  const loadPros = useCallback(async () => {
    const { data: pros } = await supabase
      .from("professionals")
      .select("id, rating, total_services, verified, user_id, category_id, categories(name)")
      .eq("active", true)
      .eq("profile_status", "approved")
      .neq("availability_status", "unavailable")
      .order("rating", { ascending: false })
      .limit(10);

    if (!pros || pros.length === 0) { 
      setProfessionals([]); 
      return; 
    }

    const userIds = pros.map((p) => p.user_id);

    const { data: profiles } = await supabase
      .from("profiles_public" as any)
      .select("user_id, full_name, avatar_url")
      .in("user_id", userIds) as { 
        data: { user_id: string; full_name: string; avatar_url: string | null }[] | null 
      };

    const profileMap = new Map(
      (profiles || []).map((p) => [p.user_id, p])
    );

    setProfessionals(
      pros.map((p) => ({
        id: p.id,
        rating: p.rating,
        total_services: p.total_services,
        verified: p.verified,
        user_id: p.user_id,
        category_name: (p.categories as any)?.name || "—",
        full_name: profileMap.get(p.user_id)?.full_name || "Profissional",
        avatar_url: profileMap.get(p.user_id)?.avatar_url || null,
      }))
    );
  }, []);

  useEffect(() => { 
    loadPros(); 
  }, [loadPros]);

  useEffect(() => {
    const channel = supabase
      .channel("featured-pro-updates")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "professionals" },
        () => { loadPros(); }
      )
      .subscribe();

    return () => { 
      supabase.removeChannel(channel); 
    };
  }, [loadPros]);

  const scrollTo = useCallback((index: number) => {
    if (!scrollRef.current || professionals.length === 0) return;

    const wrappedIndex = index % professionals.length;
    setActiveIndex(wrappedIndex);

    scrollRef.current.scrollTo({
      left: wrappedIndex * cardWidth,
      behavior: "smooth"
    });
  }, [professionals.length]);

  useEffect(() => {
    if (isPaused || professionals.length === 0) return;

    const interval = setInterval(() => {
      scrollTo(activeIndex + 1);
    }, 2500);

    return () => clearInterval(interval);
  }, [activeIndex, isPaused, scrollTo, professionals.length]);

  if (professionals.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="font-semibold text-foreground">
          Profissionais em destaque
        </h3>
        <Link 
          to="/search" 
          className="text-xs font-medium text-primary hover:underline"
        >
          Ver todos
        </Link>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}
      >
        {professionals.map((pro) => {
          const initials = pro.full_name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();

          const avatarSrc = getAvatarUrl(pro.avatar_url);

          return (
            <div
              key={pro.id}
              className="min-w-[200px] bg-card rounded-xl border shadow-card p-4 flex flex-col gap-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-muted flex-shrink-0 flex items-center justify-center text-sm font-bold text-muted-foreground overflow-hidden">
                  {avatarSrc ? (
                    <img
                      src={avatarSrc}
                      alt={pro.full_name}
                      className="w-full h-full object-cover rounded-full"
                    />
                  ) : (
                    initials
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="font-semibold text-sm text-foreground truncate">
                      {pro.full_name}
                    </p>
                    {pro.verified && (
                      <BadgeCheck className="w-4 h-4 text-primary flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {pro.category_name}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Star className="w-3.5 h-3.5 fill-primary text-primary" />
                <span className="text-sm font-semibold text-foreground">
                  {Number(pro.rating).toFixed(1)}
                </span>
                <span className="text-xs text-muted-foreground">
                  · {pro.total_services} serviços
                </span>
              </div>

              <div className="flex gap-2">
                <Link
                  to={`/professional/${pro.id}`}
                  className="flex-1 text-center text-xs font-medium py-2 rounded-lg border border-primary text-primary hover:bg-accent transition-colors"
                >
                  Ver perfil
                </Link>
                <Link
                  to={`/professional/${pro.id}`}
                  className="flex-1 text-center text-xs font-medium py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Contratar
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {professionals.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-2">
          {professionals.map((_, i) => (
            <button
              key={i}
              onClick={() => scrollTo(i)}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                i === activeIndex
                  ? "bg-primary"
                  : "bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
};

export default FeaturedProfessionals;
