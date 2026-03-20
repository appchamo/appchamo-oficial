import { Star, BadgeCheck, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sameCityState } from "@/lib/locationUtils";
import { diagLog, hardReloadOnce } from "@/lib/diag";
import { Capacitor } from "@capacitor/core";

const ITEMS_PER_PAGE = 2;
const AUTO_ADVANCE_MS = 6000;

// Location cache — shared between Sponsors & Featured for a single DB read per session
const LOCATION_CACHE_KEY = "chamo_user_location_v1";
const LOCATION_CACHE_TTL_MS = 5 * 60 * 1000;

function getCachedLocation(): { city: string | null; state: string | null } | null {
  try {
    const raw = localStorage.getItem(LOCATION_CACHE_KEY);
    if (!raw) return null;
    const { city, state, ts } = JSON.parse(raw);
    if (Date.now() - ts > LOCATION_CACHE_TTL_MS) return null;
    return { city: city ?? null, state: state ?? null };
  } catch { return null; }
}

function setCachedLocation(city: string | null, state: string | null) {
  try {
    localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify({ city, state, ts: Date.now() }));
  } catch { /* ignore */ }
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
  const base = import.meta.env.VITE_SUPABASE_URL as string;
  if (avatarUrl.startsWith("http")) {
    // Já é URL completa — se for do nosso storage, converte para render com compressão
    if (avatarUrl.includes("/storage/v1/object/public/")) {
      return avatarUrl.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/") + "?width=120&quality=60";
    }
    return avatarUrl;
  }
  return `${base}/storage/v1/render/image/public/uploads/${avatarUrl}?width=120&quality=60`;
};

const FeaturedProfessionals = ({ section }: FeaturedProfessionalsProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activePage, setActivePage] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [professionals, setProfessionals] = useState<Pro[]>([]);
  const [prosLoaded, setProsLoaded] = useState(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Init from localStorage immediately — avoids waiting for DB before first render
  const cachedLoc = useMemo(() => getCachedLocation(), []);
  const [userCity, setUserCity] = useState<string | null>(cachedLoc?.city ?? null);
  const [userState, setUserState] = useState<string | null>(cachedLoc?.state ?? null);

  const fromCloneToReset = useRef(false);
  const isScrollFromUser = useRef(false);
  const loadGenRef = useRef(0);
  const hangRetryRef = useRef(0);

  // Fetch fresh location in background and update cache
  const refreshUserLocation = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("latitude, longitude, address_city, address_state")
      .eq("user_id", user.id)
      .single();
    if (!data) return;
    const city = data.address_city ?? null;
    const state = data.address_state ?? null;
    setCachedLocation(city, state);
    setUserCity(city);
    setUserState(state);
    if (data.latitude != null && data.longitude != null) {
      setUserCoords({ lat: data.latitude, lng: data.longitude });
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {}
      );
    }
  }, []);

  const loadPros = useCallback(async () => {
    loadGenRef.current += 1;
    const gen = loadGenRef.current;
    setProsLoaded(false);

    const timeoutMs = Capacitor.isNativePlatform() ? 10_000 : 8_000;

    const watchdog = setTimeout(() => {
      if (loadGenRef.current !== gen) return;
      diagLog("warn", "featured", "pros fetch timeout", { ms: timeoutMs });
      hardReloadOnce("featured_pros_timeout");
      hangRetryRef.current += 1;
      loadGenRef.current += 1;
      if (hangRetryRef.current <= 3) {
        setTimeout(() => loadPros(), 1_200);
      } else {
        hangRetryRef.current = 0;
        setProfessionals([]);
        setProsLoaded(true);
      }
    }, timeoutMs);

    try {
      diagLog("info", "featured", "pros fetch start");
      if (Capacitor.isNativePlatform()) {
        try {
          const graceUntil = parseInt(sessionStorage.getItem("chamo_hang_reload_grace_until") || "0", 10);
          const postOAuthWarmup = Date.now() < graceUntil;
          const oauthJustLanded = sessionStorage.getItem("chamo_oauth_just_landed") === "1";
          if (
            (postOAuthWarmup || oauthJustLanded) &&
            sessionStorage.getItem("chamo_featured_reload_after_oauth") !== "1"
          ) {
            sessionStorage.setItem("chamo_featured_reload_after_oauth", "1");
            clearTimeout(watchdog);
            diagLog("info", "featured", "reload completo pós-OAuth");
            window.location.reload();
            return;
          }
        } catch { /* ignore */ }
      }

      const { data: pros, error: prosErr } = await supabase
        .from("professionals")
        .select("id, rating, total_services, verified, user_id, category_id, categories(name), profession_id, professions(name)")
        .eq("active", true)
        .eq("profile_status", "approved")
        .neq("availability_status", "unavailable")
        .eq("verified", true)
        .order("rating", { ascending: false })
        .limit(20); // reduzido de 80 → 20

      clearTimeout(watchdog);
      if (loadGenRef.current !== gen) return;

      if (prosErr) {
        diagLog("error", "featured", "pros fetch error", { message: prosErr.message });
        hangRetryRef.current += 1;
        loadGenRef.current += 1;
        if (hangRetryRef.current <= 3) {
          setTimeout(() => loadPros(), 1_200);
        } else {
          hangRetryRef.current = 0;
          setProfessionals([]);
          setProsLoaded(true);
        }
        return;
      }

      if (!pros || pros.length === 0) {
        diagLog("warn", "featured", "no pros returned");
        hangRetryRef.current = 0;
        setProfessionals([]);
        setProsLoaded(true);
        return;
      }

      const userIds = pros.map((p) => p.user_id);

      let profilesRes: { data: unknown[] | null; error: unknown };
      let locationsRes: { data: unknown[] | null; error: unknown };
      try {
        const pair = await Promise.race([
          Promise.all([
            supabase.from("profiles_public" as any).select("user_id, full_name, avatar_url").in("user_id", userIds),
            supabase.from("profiles").select("user_id, latitude, longitude, address_city, address_state").in("user_id", userIds),
          ]),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("featured_secondary_timeout")), 8_000)),
        ]);
        [profilesRes, locationsRes] = pair;
      } catch {
        diagLog("warn", "featured", "secondary queries timeout");
        profilesRes = { data: [], error: null };
        locationsRes = { data: [], error: null };
      }

      if (loadGenRef.current !== gen) return;

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

      diagLog("info", "featured", "pros computed", { total: pros.length, filtered: filtered.length, shown: top10.length });
      if (loadGenRef.current !== gen) return;
      hangRetryRef.current = 0;
      setProfessionals(top10);
    } catch (e) {
      clearTimeout(watchdog);
      if (loadGenRef.current === gen) {
        diagLog("error", "featured", "pros load threw", { e: String(e) });
        hangRetryRef.current += 1;
        loadGenRef.current += 1;
        if (hangRetryRef.current <= 3) {
          setTimeout(() => loadPros(), 1_200);
        } else {
          hangRetryRef.current = 0;
          setProfessionals([]);
          setProsLoaded(true);
        }
      }
    } finally {
      if (loadGenRef.current === gen) setProsLoaded(true);
    }
  }, [userCity, userState]);

  const professionalsWithDistance = useMemo(() => {
    if (!userCoords) return professionals;
    return professionals.map((p) => ({
      ...p,
      distance_km:
        p.latitude != null && p.longitude != null
          ? haversineKm(userCoords.lat, userCoords.lng, p.latitude, p.longitude)
          : null,
    }));
  }, [professionals, userCoords]);

  const pages = useMemo(() => {
    const p: Pro[][] = [];
    for (let i = 0; i < professionalsWithDistance.length; i += ITEMS_PER_PAGE)
      p.push(professionalsWithDistance.slice(i, i + ITEMS_PER_PAGE));
    return p;
  }, [professionalsWithDistance]);

  const displayPages = useMemo(() => {
    if (pages.length <= 1) return pages;
    return [...pages, pages[0]];
  }, [pages]);
  const totalDisplayPages = displayPages.length;
  const totalPages = pages.length;

  useEffect(() => {
    refreshUserLocation();
  }, [refreshUserLocation]);

  useEffect(() => {
    loadPros();
  }, [loadPros]);

  useEffect(() => {
    const channel = supabase
      .channel("featured-pro-updates")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "professionals" }, () => { loadPros(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadPros]);

  const scrollToPage = useCallback((pageIndex: number) => {
    if (!scrollRef.current || totalPages === 0) return;
    const page = Math.max(0, Math.min(pageIndex, totalPages - 1));
    isScrollFromUser.current = false;
    setActivePage(page);
    scrollRef.current.scrollTo({ left: page * scrollRef.current.clientWidth, behavior: "smooth" });
  }, [totalPages]);

  const syncPageFromScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || totalDisplayPages === 0) return;
    const pageIndex = Math.round(el.scrollLeft / el.clientWidth);
    isScrollFromUser.current = true;
    setActivePage(Math.max(0, Math.min(pageIndex, totalDisplayPages - 1)));
  }, [totalDisplayPages]);

  useEffect(() => {
    if (isPaused || totalDisplayPages <= 1) return;
    const interval = setInterval(() => {
      isScrollFromUser.current = false;
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
    if (isScrollFromUser.current) { isScrollFromUser.current = false; return; }
    const behavior = activePage === 0 && fromCloneToReset.current ? "auto" : "smooth";
    if (fromCloneToReset.current) fromCloneToReset.current = false;
    scrollRef.current.scrollTo({ left: activePage * scrollRef.current.clientWidth, behavior });
  }, [activePage, totalDisplayPages]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || totalDisplayPages <= 1) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { syncPageFromScroll(); raf = 0; });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => { el.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [totalDisplayPages, syncPageFromScroll]);

  if (!prosLoaded) {
    return (
      <section>
        <h3 className="font-semibold text-foreground mb-3 px-1">{section?.title ?? "Profissionais em destaque"}</h3>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {[1, 2].map((i) => (
            <div key={i} className="flex-shrink-0 w-[140px] rounded-2xl border bg-card p-3 space-y-2">
              <div className="w-14 h-14 rounded-full bg-muted animate-pulse mx-auto" />
              <div className="h-3 w-20 rounded bg-muted animate-pulse mx-auto" />
              <div className="h-3 w-16 rounded bg-muted animate-pulse mx-auto" />
            </div>
          ))}
        </div>
      </section>
    );
  }
  if (professionalsWithDistance.length === 0) return null;

  const renderCard = (pro: Pro) => {
    const initials = pro.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
    const avatarSrc = getAvatarUrl(pro.avatar_url);
    const distanceText =
      pro.distance_km != null
        ? pro.distance_km < 1 ? "Menos de 1 km" : `${Math.round(pro.distance_km)} km de você`
        : null;
    return (
      <div
        key={pro.id}
        className="bg-card rounded-xl border shadow-card p-4 flex flex-col gap-3 flex-1 min-w-0 basis-0 overflow-hidden"
      >
        <div className="flex flex-col gap-1 min-w-0">
          <div className="w-14 h-14 rounded-full bg-muted flex-shrink-0 flex items-center justify-center text-sm font-bold text-muted-foreground overflow-hidden self-start">
            {avatarSrc ? (
              <img
                src={avatarSrc}
                alt={pro.full_name}
                className="w-full h-full object-cover rounded-full"
                loading="lazy"
                decoding="async"
              />
            ) : (
              initials
            )}
          </div>
          {pro.verified && (
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-[10px] font-semibold text-foreground truncate">Verificado</span>
              <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                <BadgeCheck className="w-2.5 h-2.5 text-primary-foreground" />
              </div>
            </div>
          )}
        </div>

        <p className="font-bold text-foreground text-sm truncate">{pro.full_name}</p>
        <p className="text-xs text-muted-foreground truncate -mt-2">{pro.profession_name}</p>

        <div className="flex items-center gap-1">
          <Star className="w-4 h-4 fill-primary text-primary flex-shrink-0" />
          <span className="text-sm font-semibold text-foreground">{Number(pro.rating).toFixed(1)}</span>
          <span className="text-xs text-muted-foreground">· {pro.total_services} serviços</span>
        </div>

        {distanceText && (
          <div className="flex items-center gap-1.5 text-sm text-foreground">
            <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
            <span>{distanceText}</span>
          </div>
        )}

        <div className="flex flex-col gap-2 mt-auto">
          <Link
            to={`/professional/${pro.id}`}
            className="w-full text-center text-sm font-medium py-2.5 rounded-lg border border-primary text-primary hover:bg-accent transition-colors"
          >
            Ver perfil
          </Link>
          <Link
            to={`/professional/${pro.id}`}
            className="w-full text-center text-sm font-medium py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
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
        <h3 className="font-semibold text-foreground">{section?.title ?? "Profissionais em destaque"}</h3>
        <Link to="/search" className="text-xs font-medium text-primary hover:underline">Ver todos</Link>
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
            className="flex gap-3 flex-[0_0_100%] min-w-0 shrink-0 snap-start px-2 box-border"
            style={{ scrollSnapStop: "always" }}
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
