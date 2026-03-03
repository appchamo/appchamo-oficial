import { Star, BadgeCheck, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sameCityState } from "@/lib/locationUtils";

const ITEMS_PER_PAGE = 2;
const AUTO_ADVANCE_MS = 6000;

function haversineKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

interface Pro {
  id: string;
  rating: number;
  total_services: number;
  verified: boolean;
  user_id: string;
  profession_name: string;
  full_name: string;
  avatar_url: string | null;
  latitude: number | null;
  longitude: number | null;
  distance_km: number | null;
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
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [userCity, setUserCity] = useState<string | null>(null);
  const [userState, setUserState] = useState<string | null>(null);
  const fromCloneToReset = useRef(false);

  const loadUserCoords = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from("profiles")
        .select("latitude, longitude, address_city, address_state")
        .eq("user_id", user.id)
        .single();
      if (data?.address_city) setUserCity(data.address_city);
      if (data?.address_state) setUserState(data.address_state);
      if (data?.latitude != null && data?.longitude != null) {
        setUserCoords({ lat: data.latitude, lng: data.longitude });
        return;
      }
    }
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setUserCoords(null)
      );
    } else {
      setUserCoords(null);
    }
  }, []);

  const loadPros = useCallback(async () => {
    const { data: pros } = await supabase
      .from("professionals")
      .select("id, rating, total_services, verified, user_id, category_id, categories(name), profession_id, professions(name)")
      .eq("active", true)
      .eq("profile_status", "approved")
      .neq("availability_status", "unavailable")
      .eq("verified", true)
      .order("rating", { ascending: false })
      .limit(80);

    if (!pros || pros.length === 0) {
      setProfessionals([]);
      return;
    }

    const userIds = pros.map((p) => p.user_id);

    const [profilesRes, locationsRes] = await Promise.all([
      supabase.from("profiles_public" as any).select("user_id, full_name, avatar_url").in("user_id", userIds),
      supabase.from("profiles").select("user_id, latitude, longitude, address_city, address_state").in("user_id", userIds),
    ]);

    const profileMap = new Map(
      ((profilesRes.data || []) as { user_id: string; full_name: string; avatar_url: string | null }[]).map((p) => [p.user_id, p])
    );
    const locationMap = new Map(
      ((locationsRes.data || []) as { user_id: string; latitude: number | null; longitude: number | null; address_city: string | null; address_state: string | null }[]).map((p) => [p.user_id, p])
    );

    const withLocation = pros.map((p) => {
      const loc = locationMap.get(p.user_id);
      return {
        id: p.id,
        rating: p.rating,
        total_services: p.total_services,
        verified: p.verified,
        user_id: p.user_id,
        profession_name: (p.professions as any)?.name || (p.categories as any)?.name || "—",
        full_name: profileMap.get(p.user_id)?.full_name || "Profissional",
        avatar_url: profileMap.get(p.user_id)?.avatar_url || null,
        latitude: loc?.latitude ?? null,
        longitude: loc?.longitude ?? null,
        distance_km: null as number | null,
        _city: loc?.address_city ?? null,
        _state: loc?.address_state ?? null,
      };
    });

    const filtered = (userCity || userState)
      ? withLocation.filter((p) => sameCityState(userCity, userState, p._city, p._state))
      : withLocation;
    const top10 = filtered.slice(0, 10).map(({ _city, _state, ...p }) => p);

    setProfessionals(top10);
  }, [userCity, userState]);

  const professionalsWithDistance = useMemo(() => {
    if (!userCoords) return professionals;
    return professionals.map((p) => {
      const distance_km =
        p.latitude != null && p.longitude != null
          ? haversineKm(userCoords.lat, userCoords.lng, p.latitude, p.longitude)
          : null;
      return { ...p, distance_km };
    });
  }, [professionals, userCoords]);

  const pages = useMemo(() => {
    const p: Pro[][] = [];
    for (let i = 0; i < professionalsWithDistance.length; i += ITEMS_PER_PAGE) p.push(professionalsWithDistance.slice(i, i + ITEMS_PER_PAGE));
    return p;
  }, [professionalsWithDistance]);

  const displayPages = useMemo(() => {
    if (pages.length <= 1) return pages;
    return [...pages, pages[0]];
  }, [pages]);
  const totalDisplayPages = displayPages.length;
  const totalPages = pages.length;

  useEffect(() => {
    loadUserCoords();
  }, [loadUserCoords]);

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

  if (professionalsWithDistance.length === 0) return null;

  const renderCard = (pro: Pro) => {
    const initials = pro.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
    const avatarSrc = getAvatarUrl(pro.avatar_url);
    const distanceText =
      pro.distance_km != null
        ? pro.distance_km < 1
          ? "Menos de 1 km"
          : `${Math.round(pro.distance_km)} km de você`
        : null;
    return (
      <div
        key={pro.id}
        className="bg-card rounded-xl border shadow-card p-4 flex flex-col gap-3 flex-1 min-w-0"
      >
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-full bg-muted flex-shrink-0 flex items-center justify-center text-sm font-bold text-muted-foreground overflow-hidden">
            {avatarSrc ? (
              <img src={avatarSrc} alt={pro.full_name} className="w-full h-full object-cover rounded-full" />
            ) : (
              initials
            )}
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            {pro.verified && (
              <div className="flex items-center gap-1">
                <span className="text-xs font-semibold text-foreground">Verificado</span>
                <div className="w-5 h-5 rounded-full border-2 border-primary flex items-center justify-center bg-primary/10">
                  <BadgeCheck className="w-3 h-3 text-primary" />
                </div>
              </div>
            )}
            <p className="font-semibold text-sm text-foreground truncate">{pro.full_name}</p>
            <p className="text-xs text-muted-foreground truncate">{pro.profession_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Star className="w-3.5 h-3.5 fill-primary text-primary" />
          <span className="text-sm font-semibold text-foreground">{Number(pro.rating).toFixed(1)}</span>
          <span className="text-xs text-muted-foreground">· {pro.total_services} serviços</span>
        </div>
        {distanceText && (
          <div className="flex items-center gap-1.5 text-xs text-foreground">
            <MapPin className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            <span>{distanceText}</span>
          </div>
        )}
        <div className="flex flex-col gap-2 mt-auto">
          <Link
            to={`/professional/${pro.id}`}
            className="w-full text-center text-xs font-medium py-2.5 rounded-lg border border-primary text-primary hover:bg-accent transition-colors"
          >
            Ver perfil
          </Link>
          <Link
            to={`/professional/${pro.id}`}
            className="w-full text-center text-xs font-medium py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
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