import { Star, BadgeCheck, MapPin } from "lucide-react";
import { sortPublicSealsForDisplay } from "@/components/seals/FeaturedSealStack";
import { ProfessionalSealIcon } from "@/components/seals/ProfessionalSealIcon";
import { Link } from "react-router-dom";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  getHomeLocationCache,
  matchesFeaturedRegion,
  normalizeStateToUF,
  writeHomeLocationCacheOnly,
} from "@/lib/locationUtils";
import { diagLog, hardReloadOnce } from "@/lib/diag";
import { Capacitor } from "@capacitor/core";
import { useProProfileImpression } from "@/hooks/useProProfileImpression";
import { cn } from "@/lib/utils";
import { isSponsorClientAccount } from "@/lib/sponsorVisibility";

const ITEMS_PER_PAGE = 2;
const AUTO_ADVANCE_MS = 6000;
/** Limite de linhas no PostgREST antes dos filtros em memória (verificado + região). */
const FEATURED_FETCH_LIMIT = 320;
/** Quantos cards no máximo no carrossel (antes era 10). */
const FEATURED_SHOW_CAP = 36;
/** Se a lista regional vier menor que isto, funde profissionais de todo o mesmo estado. */
const MIN_MERGE_STATE_POOL = 28;

const featuredProSelect =
  "id, rating, total_services, verified, user_id, category_id, categories(name), profession_id, professions(name), created_at";

function baseFeaturedProsQuery() {
  return supabase
    .from("professionals")
    .select(featuredProSelect)
    .eq("active", true)
    .eq("profile_status", "approved")
    .neq("availability_status", "unavailable")
    .order("verified", { ascending: false })
    .order("rating", { ascending: false });
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
  address_city: string | null;
  address_state: string | null;
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

/**
 * Melhor selo na frente; 2º e 3º atrás, lado a lado, ~50% sobrepostos entre si.
 * Selos além do 3º viram +N ao lado.
 */
function FeaturedSealStrip({ seals }: { seals: { icon_variant: string }[] }) {
  const best = seals[0];
  if (!best) return null;
  const backA = seals[1];
  const backB = seals[2];
  const extra = Math.max(0, seals.length - 3);
  return (
    <div
      className="flex items-center justify-end gap-2 min-w-0 flex-1 pl-3"
      aria-hidden
    >
      <div className="relative h-11 w-[3.25rem] sm:w-[3.5rem] shrink-0">
        {(backA || backB) && (
          <div className="absolute right-[1.65rem] top-1/2 z-0 flex flex-row items-center -translate-y-1/2">
            {backA && (
              <div className="relative shrink-0 opacity-90">
                <ProfessionalSealIcon variant={backA.icon_variant} size={18} earned flat />
              </div>
            )}
            {backB && (
              <div className={cn("relative shrink-0 opacity-90", backA && "-ml-[9px]")}>
                <ProfessionalSealIcon variant={backB.icon_variant} size={18} earned flat />
              </div>
            )}
          </div>
        )}
        <div className="absolute right-0 top-1/2 z-[2] -translate-y-1/2">
          <ProfessionalSealIcon variant={best.icon_variant} size={28} earned flat />
        </div>
      </div>
      {extra > 0 && (
        <span className="shrink-0 text-[11px] font-bold tabular-nums tracking-tight text-muted-foreground">
          +{extra}
        </span>
      )}
    </div>
  );
}

function FeaturedProCard({ pro }: { pro: Pro }) {
  const impressionRef = useProProfileImpression(pro.user_id);
  const initials = pro.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const avatarSrc = getAvatarUrl(pro.avatar_url);
  const cityLine =
    pro.address_city || pro.address_state
      ? [pro.address_city, pro.address_state].filter(Boolean).join(", ")
      : null;
  return (
    <div ref={impressionRef} className="flex-1 min-w-0 basis-0 min-h-0 flex">
      <Link
        to={`/professional/${pro.id}`}
        className="bg-card rounded-xl lg:rounded-2xl border shadow-card p-4 lg:p-5 flex flex-col gap-2.5 lg:gap-3 flex-1 min-w-0 overflow-hidden active:scale-[0.97] transition-transform"
      >
        {/* Foto + selos ao lado (melhor selo maior); texto abaixo da foto */}
        <div className="flex gap-4 lg:gap-5 items-start w-full min-w-0">
          <div className="relative shrink-0 self-start">
            <div className="w-16 h-16 lg:w-[72px] lg:h-[72px] rounded-full bg-muted flex items-center justify-center text-base font-bold text-muted-foreground overflow-hidden ring-2 ring-border/40">
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
          </div>
          {pro.seals && pro.seals.length > 0 ? (
            <FeaturedSealStrip seals={pro.seals} />
          ) : (
            <div className="flex-1 min-w-0" />
          )}
        </div>

        <div className="min-w-0 -mt-0.5">
          <p className="font-bold text-foreground text-sm lg:text-base truncate leading-tight">{pro.full_name}</p>
          <p className="text-sm lg:text-[15px] font-semibold text-primary truncate mt-0.5">{pro.profession_name}</p>
          {pro.verified && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-600 mt-0.5">
              <BadgeCheck className="w-3 h-3 shrink-0" /> Verificado
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Star className="w-3.5 h-3.5 fill-primary text-primary flex-shrink-0" />
          <span className="text-sm font-semibold text-foreground">{Number(pro.rating).toFixed(1)}</span>
          <span className="text-xs text-muted-foreground">· {pro.total_services} serv.</span>
        </div>

        {cityLine && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="w-3 h-3 text-primary flex-shrink-0" />
            <span className="truncate">{cityLine}</span>
          </div>
        )}

        <div className="mt-auto pt-1">
          <div className="w-full text-center text-sm font-semibold py-2.5 rounded-lg bg-primary text-white">
            Contratar
          </div>
        </div>
      </Link>
    </div>
  );
}

const FeaturedProfessionals = ({ section }: FeaturedProfessionalsProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activePage, setActivePage] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [professionals, setProfessionals] = useState<Pro[]>([]);
  const [prosLoaded, setProsLoaded] = useState(false);

  // Init from localStorage immediately — avoids waiting for DB before first render
  const cachedLoc = useMemo(() => getHomeLocationCache(), []);
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
      .select("address_city, address_state")
      .eq("user_id", user.id)
      .single();
    if (!data) return;
    const city = data.address_city ?? null;
    const state = data.address_state ?? null;
    writeHomeLocationCacheOnly(city, state);
    setUserCity(city);
    setUserState(state);
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

      // ── Passo 1: user_ids em profiles que batem com a região do cliente ─────
      // Com cidade definida: só essa cidade (normalizada), sem fallback para estado/país
      // (evita mostrar SP quando o cliente escolheu Patrocínio e não há match na query exata).
      let locationUserIds: string[] | null = null;
      const cityTrim = (userCity || "").trim();
      const hasCityFilter = cityTrim.length > 0;

      const escapeIlike = (s: string) => s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");

      if (hasCityFilter || userState) {
        try {
          if (hasCityFilter) {
            const pattern = `%${escapeIlike(cityTrim)}%`;
            const { data: cand } = await supabase
              .from("profiles")
              .select("user_id, address_city, address_state")
              .ilike("address_city", pattern)
              .limit(500);
            const matched = (cand || []).filter((row) =>
              matchesFeaturedRegion(cityTrim, userState, row.address_city, row.address_state),
            );
            locationUserIds = matched.map((p) => p.user_id);
            diagLog("info", "featured", "location city filter", {
              city: cityTrim,
              candidates: cand?.length ?? 0,
              matched: locationUserIds.length,
            });
          } else if (userState) {
            const uf = userState.length === 2 ? userState.toUpperCase() : userState;
            const { data: cand } = await supabase
              .from("profiles")
              .select("user_id, address_city, address_state")
              .or(`address_state.ilike.${uf},address_state.ilike.${userState}`)
              .limit(500);
            const matched = (cand || []).filter((row) =>
              matchesFeaturedRegion(null, userState, row.address_city, row.address_state),
            );
            locationUserIds = matched.map((p) => p.user_id);
            diagLog("info", "featured", "location state filter", { matched: locationUserIds.length });
          }
        } catch {
          diagLog("warn", "featured", "location pre-filter failed");
          locationUserIds = hasCityFilter ? [] : null;
        }
      }

      // Cidade não encontrou nenhum perfil, mas há UF: amplia para todo o estado (evita destaque vazio).
      if (hasCityFilter && locationUserIds !== null && locationUserIds.length === 0 && userState) {
        try {
          const uf = userState.length === 2 ? userState.toUpperCase() : userState;
          const { data: cand } = await supabase
            .from("profiles")
            .select("user_id, address_city, address_state")
            .or(`address_state.ilike.${uf},address_state.ilike.${userState}`)
            .limit(800);
          const matched = (cand || []).filter((row) =>
            matchesFeaturedRegion(null, userState, row.address_city, row.address_state),
          );
          locationUserIds = matched.map((p) => p.user_id);
          diagLog("info", "featured", "city had 0 profiles — widened to state", { matched: locationUserIds.length });
        } catch {
          locationUserIds = [];
        }
      }

      // ── Passo 2: profissionais ─────────────────────────────────────────────
      let finalPros: any[] | null = null;
      let prosErr: { message: string } | null = null;

      if (hasCityFilter && locationUserIds !== null && locationUserIds.length === 0 && !userState) {
        diagLog("info", "featured", "strict city, no state fallback — empty regional ids");
        finalPros = [];
      } else {
        let prosQuery = baseFeaturedProsQuery();

        if (locationUserIds !== null) {
          if (locationUserIds.length > 0) {
            prosQuery = prosQuery.in("user_id", locationUserIds);
          } else {
            finalPros = [];
          }
        }

        if (finalPros === null) {
          const { data: pros, error: qErr } = await prosQuery.limit(FEATURED_FETCH_LIMIT);
          if (qErr) prosErr = qErr;
          else finalPros = pros || [];
        }
      }

      // Poucos na região: incluir verificados (e demais) de todo o estado do utilizador.
      if (!prosErr && finalPros && userState && finalPros.length < MIN_MERGE_STATE_POOL) {
        try {
          const uf = userState.length === 2 ? userState.toUpperCase() : userState;
          const { data: stCand } = await supabase
            .from("profiles")
            .select("user_id, address_city, address_state")
            .or(`address_state.ilike.${uf},address_state.ilike.${userState}`)
            .limit(1200);
          const stMatched = (stCand || []).filter((row) =>
            matchesFeaturedRegion(null, userState, row.address_city, row.address_state),
          );
          const stIds = stMatched.map((p) => p.user_id);
          if (stIds.length > 0) {
            const { data: morePros, error: mErr } = await baseFeaturedProsQuery()
              .in("user_id", stIds)
              .limit(FEATURED_FETCH_LIMIT);
            if (!mErr && morePros?.length) {
              const byId = new Map(finalPros.map((p: any) => [p.id, p]));
              for (const p of morePros) byId.set(p.id, p);
              finalPros = [...byId.values()];
              diagLog("info", "featured", "merged state pool", { total: finalPros.length });
            }
          }
        } catch {
          /* ignore */
        }
      }

      // Sem nenhum resultado regional: lista global (prioriza verificado + rating na query).
      if (!prosErr && finalPros && finalPros.length === 0) {
        diagLog("info", "featured", "empty regional — global list");
        const { data: allPros, error: gErr } = await baseFeaturedProsQuery().limit(FEATURED_FETCH_LIMIT);
        if (gErr) prosErr = gErr;
        else finalPros = allPros || [];
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
            supabase.from("profiles").select("user_id, address_city, address_state, user_type").in("user_id", userIds),
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
        ((locationsRes.data || []) as { user_id: string; address_city: string | null; address_state: string | null; user_type?: string | null }[]).map((p) => [p.user_id, p])
      );

      const finalProsNoSponsor = finalPros.filter(
        (p) => !isSponsorClientAccount(locationMap.get(p.user_id)?.user_type),
      );

      const userUF = normalizeStateToUF(userState);

      const mappedBase = finalProsNoSponsor.map((p) => {
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
          address_city: loc?.address_city ?? null,
          address_state: loc?.address_state ?? null,
          created_at: (p as any).created_at as string | null,
        };
      });

      const strictInRegion = (p: (typeof mappedBase)[0]) =>
        matchesFeaturedRegion(userCity, userState, p.address_city, p.address_state);

      const tierStrict = mappedBase.filter(strictInRegion);
      const idsStrict = new Set(tierStrict.map((p) => p.id));

      const tierStateVerified = mappedBase.filter(
        (p) =>
          !idsStrict.has(p.id) &&
          p.verified &&
          !!userUF &&
          normalizeStateToUF(p.address_state) === userUF,
      );

      let combined = [...tierStrict, ...tierStateVerified];
      const inCombined = new Set(combined.map((p) => p.id));

      if (combined.length < 12) {
        const extraVerified = mappedBase
          .filter((p) => p.verified && !inCombined.has(p.id))
          .sort((a, b) => b.rating - a.rating || b.total_services - a.total_services);
        for (const p of extraVerified) {
          if (combined.length >= FEATURED_SHOW_CAP) break;
          combined.push(p);
          inCombined.add(p.id);
        }
      }

      combined.sort((a, b) => {
        const aS = strictInRegion(a) ? 0 : 1;
        const bS = strictInRegion(b) ? 0 : 1;
        if (aS !== bS) return aS - bS;
        if (a.verified !== b.verified) return a.verified ? -1 : 1;
        if (b.total_services !== a.total_services) return b.total_services - a.total_services;
        if (b.rating !== a.rating) return b.rating - a.rating;
        const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tA - tB;
      });

      const top10Raw = combined.slice(0, FEATURED_SHOW_CAP);
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

      const top10 = top10Raw.map((p) => ({
        ...p,
        seals: sealsByPro.get(p.id) ?? [],
      }));

      diagLog("info", "featured", "pros computed", { total: finalPros.length, shown: top10.length, cap: FEATURED_SHOW_CAP });
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

  const pages = useMemo(() => {
    const p: Pro[][] = [];
    for (let i = 0; i < professionals.length; i += ITEMS_PER_PAGE)
      p.push(professionals.slice(i, i + ITEMS_PER_PAGE));
    return p;
  }, [professionals]);

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
    const onLoc = (e: Event) => {
      const d = (e as CustomEvent<{ city: string | null; state: string | null }>).detail;
      if (!d) return;
      setUserCity(d.city ?? null);
      setUserState(d.state ?? null);
    };
    window.addEventListener("chamo_home_location_updated", onLoc);
    return () => window.removeEventListener("chamo_home_location_updated", onLoc);
  }, []);

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
        <h3 className="font-semibold lg:text-lg text-foreground mb-3 lg:mb-4 px-1">{section?.title ?? "Profissionais em destaque"}</h3>
        <div className="flex gap-3 lg:gap-4 overflow-x-auto pb-2" data-tab-swipe-ignore>
          {[1, 2].map((i) => (
            <div key={i} className="flex-shrink-0 w-[140px] lg:w-[168px] rounded-2xl border bg-card p-3 lg:p-4 space-y-2">
              <div className="w-14 h-14 rounded-full bg-muted animate-pulse mx-auto" />
              <div className="h-3 w-20 rounded bg-muted animate-pulse mx-auto" />
              <div className="h-3 w-16 rounded bg-muted animate-pulse mx-auto" />
            </div>
          ))}
        </div>
      </section>
    );
  }
  if (professionals.length === 0) return null;

  return (
    <section className="w-full min-w-0">
      <div className="flex items-center justify-between mb-3 lg:mb-4 px-1">
        <h3 className="font-semibold lg:text-lg text-foreground">{section?.title ?? "Profissionais em destaque"}</h3>
        <Link to="/search" className="text-xs lg:text-sm font-medium text-primary hover:underline">Ver todos</Link>
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
            className="flex gap-3 lg:gap-5 flex-[0_0_100%] min-w-0 shrink-0 snap-start px-2 lg:px-4 box-border"
            style={{ scrollSnapStop: "always" }}
          >
            {pagePros.map((pro) => (
              <FeaturedProCard key={pro.id} pro={pro} />
            ))}
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
