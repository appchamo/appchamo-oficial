import { Star, BadgeCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

const ITEMS_PER_PAGE = 2;
const AUTO_ADVANCE_MS = 6000;

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

interface FeaturedProfessionalsProps {
  section?: { title?: string };
}

const getAvatarUrl = (avatarUrl?: string | null) => {
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith("http")) return avatarUrl;
  return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/uploads/${avatarUrl}`;
};

const FeaturedProfessionals = ({ section }: FeaturedProfessionalsProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activePage, setActivePage] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [professionals, setProfessionals] = useState<Pro[]>([]);
  const fromCloneToReset = useRef(false);

  const pages = useMemo(() => {
    const p: Pro[][] = [];
    for (let i = 0; i < professionals.length; i += ITEMS_PER_PAGE) p.push(professionals.slice(i, i + ITEMS_PER_PAGE));
    return p;
  }, [professionals]);

  const displayPages = useMemo(() => {
    if (pages.length <= 1) return pages;
    return [...pages, pages[0]];
  }, [pages]);
  const totalDisplayPages = displayPages.length;
  const totalPages = pages.length;

  const loadPros = useCallback(async () => {
    const { data: pros } = await supabase
      .from("professionals")
      // ✅ Removido o plan_type que não existe na tabela
      .select("id, rating, total_services, verified, user_id, category_id, categories(name)") 
      .eq("active", true)
      .eq("profile_status", "approved")
      .neq("availability_status", "unavailable")
      // 🔥 TRAVA: Como não temos plan_type aqui, usamos o verified para filtrar quem pagou VIP/Empresarial
      .eq("verified", true) 
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
    return () => { supabase.removeChannel(channel); };
  }, [loadPros]);

  const scrollToPage = useCallback((pageIndex: number) => {
    if (!scrollRef.current || totalPages === 0) return;
    const page = Math.max(0, Math.min(pageIndex, totalPages - 1));
    setActivePage(page);
    const left = page * scrollRef.current.clientWidth;
    scrollRef.current.scrollTo({ left, behavior: "smooth" });
  }, [totalPages]);

  useEffect(() => {
    if (isPaused || totalDisplayPages <= 1) return;
    const interval = setInterval(() => {
      setActivePage((p) => {
        const next = (p + 1) % totalDisplayPages;
        if (p === totalDisplayPages - 1 && next === 0) fromCloneToReset.current = true;
        return next;
      });
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(interval);
  }, [isPaused, totalDisplayPages]);

  useEffect(() => {
    if (!scrollRef.current || totalDisplayPages === 0) return;
    const left = activePage * scrollRef.current.clientWidth;
    const behavior = activePage === 0 && fromCloneToReset.current ? "auto" : "smooth";
    if (fromCloneToReset.current) fromCloneToReset.current = false;
    scrollRef.current.scrollTo({ left, behavior });
  }, [activePage, totalDisplayPages]);

  if (professionals.length === 0) return null;

  const renderCard = (pro: Pro) => {
    const initials = pro.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
    const avatarSrc = getAvatarUrl(pro.avatar_url);
    return (
      <div
        key={pro.id}
        className="bg-card rounded-xl border shadow-card p-4 flex flex-col gap-3 flex-1 min-w-0"
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-muted flex-shrink-0 flex items-center justify-center text-sm font-bold text-muted-foreground overflow-hidden">
            {avatarSrc ? (
              <img src={avatarSrc} alt={pro.full_name} className="w-full h-full object-cover rounded-full" />
            ) : (
              initials
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <p className="font-semibold text-sm text-foreground truncate">{pro.full_name}</p>
              {pro.verified && <BadgeCheck className="w-4 h-4 text-primary flex-shrink-0" />}
            </div>
            <p className="text-xs text-muted-foreground truncate">{pro.category_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Star className="w-3.5 h-3.5 fill-primary text-primary" />
          <span className="text-sm font-semibold text-foreground">{Number(pro.rating).toFixed(1)}</span>
          <span className="text-xs text-muted-foreground">· {pro.total_services} serviços</span>
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
  };

  return (
    <section className="w-full min-w-0">
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="font-semibold text-foreground">
          {section?.title ?? "Profissionais em destaque"}
        </h3>
        <Link to="/search" className="text-xs font-medium text-primary hover:underline">
          Ver todos
        </Link>
      </div>

      <div
        ref={scrollRef}
        className="flex overflow-x-auto overflow-y-hidden pb-2 scrollbar-hide snap-x snap-mandatory scroll-smooth"
        style={{ scrollBehavior: "smooth" }}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}
      >
        {displayPages.map((pagePros, pageIndex) => (
          <div
            key={pageIndex}
            className="flex gap-3 flex-[0_0_100%] min-w-0 shrink-0 snap-start px-0.5"
          >
            {pagePros.map((pro) => renderCard(pro))}
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-1.5 mt-2">
          {pages.map((_, i) => (
            <button
              key={i}
              onClick={() => scrollToPage(i)}
              className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${
                i === activePage % totalPages ? "bg-primary" : "bg-muted-foreground/30"
              }`}
              aria-label={`Página ${i + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
};

export default FeaturedProfessionals;