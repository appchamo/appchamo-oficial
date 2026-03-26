import { Star, BadgeCheck, MapPin } from "lucide-react";
import { FeaturedSealStack, sortPublicSealsForDisplay } from "@/components/seals/FeaturedSealStack";
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
  created_at: string | null;
  /** Selos públicos (ordenados: destaque primeiro) */
  seals?: { icon_variant: string }[];
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
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
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

    const timeoutMs = Capacitor.isNativePlatform() ? 12_000 : 9_000;

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
      diagLog("info", "featured", "pros fetch start", { city: userCity, state: userState });

      // ── Passo 1: filtro de localização SERVER-SIDE ──────────────────────────
      // Se o usuário tem cidade/estado definido, buscamos primeiro os user_ids
      // de profissionais que estão nessa localização, para depois buscar apenas eles.
      let locationUserIds: string[] | null = null;

      if (userCity || userState) {
        try {
          let locQuery = supabase
            .from("profiles")
            .select("user_id")
            .limit(200);

          // Usa ilike para ser case-insensitive e aguentar variações de acento
          if (userCity) locQuery = locQuery.ilike("address_city", userCity);
          if (userState) {
            // Aceita tanto sigla quanto nome completo (guardado como sigla ou nome)
            const uf = userState.length === 2 ? userState.toUpperCase() : userState;
            locQuery = locQuery.or(`address_state.ilike.${uf},address_state.ilike.${userState}`);
          }

          const { data: locProfiles } = await locQuery;
          if (locProfiles && locProfiles.length > 0) {
            locationUserIds = locProfiles.map((p: any) => p.user_id);
          } else {
            // Sem profissionais encontrados na cidade — cai no fallback (estado)
            locationUserIds = [];
          }
        } catch {
          diagLog("warn", "featured", "location pre-filter failed, fallback to all");
          locationUserIds = null;
        }
      }

      // ── Passo 2: busca profissionais ──────────────────────────────────────
      // Removido .eq("verified", true): mostra todos os aprovados, não só verificados.
      // O badge "Verificado" ainda aparece no card quando verified === true.
      let prosQuery = supabase
        .from("professionals")
        .select("id, rating, total_services, verified, user_id, category_id, categories(name), profession_id, professions(name), created_at")
        .eq("active", true)
        .eq("profile_status", "approved")
        .neq("availability_status", "unavailable");

      if (locationUserIds && locationUserIds.length > 0) {
        // Filtro server-side por cidade/estado
        prosQuery = prosQuery.in("user_id", locationUserIds);
      }
      // Se locationUserIds === [] (ninguém na cidade), buscamos do estado/geral abaixo
      prosQuery = prosQuery.limit(60);

      const { data: pros, error: prosErr } = await prosQuery;

      // Fallback 1: nenhum pro na cidade → busca do mesmo estado sem filtro de cidade
      let finalPros = pros;
      if ((!finalPros || finalPros.length === 0) && locationUserIds !== null && locationUserIds.length === 0 && userState) {
        diagLog("info", "featured", "city fallback: fetching state-level pros");
        const uf = userState.length === 2 ? userState.toUpperCase() : userState;
        const { data: stateProfiles } = await supabase
          .from("profiles")
          .select("user_id")
          .or(`address_state.ilike.${uf},address_state.ilike.${userState}`)
          .limit(200);
        const stateIds = (stateProfiles || []).map((p: any) => p.user_id);
        if (stateIds.length > 0) {
          const { data: statePros } = await supabase
            .from("professionals")
            .select("id, rating, total_services, verified, user_id, category_id, categories(name), profession_id, professions(name), created_at")
            .eq("active", true)
            .eq("profile_status", "approved")
            .neq("availability_status", "unavailable")
            .in("user_id", stateIds)
            .limit(60);
          finalPros = statePros;
        }
      }

      // Fallback 2: ainda vazio → mostra todos aprovados
      if (!finalPros || finalPros.length === 0) {
        diagLog("info", "featured", "global fallback: no location filter");
        const { data: allPros } = await supabase
          .from("professionals")
          .select("id, rating, total_services, verified, user_id, category_id, categories(name), profession_id, professions(name), created_at")
          .eq("active", true)
          .eq("profile_status", "approved")
          .neq("availability_status", "unavailable")
          .limit(60);
        finalPros = allPros;
      }

      clearTimeout(watchdog);
      if (loadGenRef.current !== gen) return;

      if (prosErr) {
        diagLog("error", "featured", "pros fetch error", { message: prosErr.message });
        hangRetryRef.current += 1;
        loadGenRef.current += 1;
        if (hangRetryRef.current <= 3) setTimeout(() => loadPros(), 1_200);
        else { hangRetryRef.current = 0; setProfessionals([]); setProsLoaded(true); }
        return;
      }

      if (!finalPros || finalPros.length === 0) {
        diagLog("warn", "featured", "no pros after all fallbacks");
        hangRetryRef.current = 0;
        setProfessionals([]);
        setProsLoaded(true);
        return;
      }

      const userIds = finalPros.map((p) => p.user_id);

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

      const withLocation = finalPros.map((p) => {
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
          created_at: (p as any).created_at as string | null,
          _city: loc?.address_city ?? null,
          _state: loc?.address_state ?? null,
        };
      });

      // Critério 1: mais serviços → Critério 2: maior rating → Critério 3: quem se cadastrou primeiro
      withLocation.sort((a, b) => {
        if (b.total_services !== a.total_services) return b.total_services - a.total_services;
        if (b.rating !== a.rating) return b.rating - a.rating;
        const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tA - tB;
      });

      const top10Raw = withLocation.slice(0, 10);
      const proIds = top10Raw.map((p) => p.id);
      const sealsByPro = new Map<string, { icon_variant: string }[]>();

      if (proIds.length > 0) {
        try {
          const { data: sealData } = await supabase.rpc("public_professional_seals" as any, { p_ids: proIds });
          type SealRow = {
            professional_id: string;
            icon_variant: string;
            sort_order: number;
            is_special: boolean;
          };
          const rows = (sealData || []) as SealRow[];
          const grouped = new Map<string, SealRow[]>();
          for (const r of rows) {
            const list = grouped.get(r.professional_id) || [];
            list.push(r);
            grouped.set(r.professional_id, list);
          }
          grouped.forEach((list, pid) => {
            const sorted = sortPublicSealsForDisplay(list);
            sealsByPro.set(
              pid,
              sorted.map((s) => ({ icon_variant: s.icon_variant }))
            );
          });
        } catch (sealErr) {
          diagLog("warn", "featured", "public_professional_seals failed", { e: String(sealErr) });
        }
      }

      const top10 = top10Raw.map(({ _city, _state, ...p }) => ({
        ...p,
        seals: sealsByPro.get(p.id) ?? [],
      }));

      diagLog("info", "featured", "pros computed", { total: finalPros.length, shown: top10.length });
      if (loadGenRef.current !== gen) return;
      hangRetryRef.current = 0;
      setProfessionals(top10);
    } catch (e) {
      clearTimeout(watchdog);
      if (loadGenRef.current === gen) {
        diagLog("error", "featured", "pros load threw", { e: String(e) });
        hangRetryRef.current += 1;
        loadGenRef.current += 1;
        if (hangRetryRef.current <= 3) setTimeout(() => loadPros(), 1_200);
        else { hangRetryRef.current = 0; setProfessionals([]); setProsLoaded(true); }
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
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "professionals" }, () => {
        loadPros();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
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
        <div className="flex gap-3 overflow-x-auto pb-2" data-tab-swipe-ignore>
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
      <Link
        key={pro.id}
        to={`/professional/${pro.id}`}
        className="bg-card rounded-xl border shadow-card p-4 flex flex-col gap-2.5 flex-1 min-w-0 basis-0 overflow-visible active:scale-[0.97] transition-transform"
      >
        {/* Avatar: verificado no canto superior direito; selos compactos sobrepostos embaixo à direita */}
        <div className="relative self-start mb-0.5">
          <div className="w-16 h-16 rounded-full bg-muted flex-shrink-0 flex items-center justify-center text-base font-bold text-muted-foreground overflow-hidden ring-2 ring-border/40">
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
            <div className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-primary rounded-full flex items-center justify-center ring-2 ring-card shadow-sm">
              <BadgeCheck className="w-3 h-3 text-white" />
            </div>
          )}
          {pro.seals && pro.seals.length > 0 && (
            <div className="absolute -right-1 -bottom-1 z-[5] flex items-end justify-end w-[4.5rem] h-[2.5rem] pointer-events-none">
              <FeaturedSealStack seals={pro.seals} placement="avatar" />
            </div>
          )}
        </div>

        <div className="min-w-0">
          <p className="font-bold text-foreground text-sm truncate leading-tight">{pro.full_name}</p>
          <p className="text-sm font-semibold text-primary truncate mt-0.5">{pro.profession_name}</p>
          {pro.verified && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-600 mt-0.5">
              <BadgeCheck className="w-3 h-3" /> Verificado
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Star className="w-3.5 h-3.5 fill-primary text-primary flex-shrink-0" />
          <span className="text-sm font-semibold text-foreground">{Number(pro.rating).toFixed(1)}</span>
          <span className="text-xs text-muted-foreground">· {pro.total_services} serv.</span>
        </div>

        {distanceText && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="w-3 h-3 text-primary flex-shrink-0" />
            <span className="truncate">{distanceText}</span>
          </div>
        )}

        <div className="mt-auto pt-1">
          <div className="w-full text-center text-sm font-semibold py-2.5 rounded-lg bg-primary text-white">
            Contratar
          </div>
        </div>
      </Link>
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
        data-tab-swipe-ignore
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
