import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLinkedSponsor } from "@/hooks/useLinkedSponsor";
import { supabase } from "@/integrations/supabase/client";
import {
  getHomeLocationCache,
  normalizeLocation,
  writeHomeLocationCacheOnly,
} from "@/lib/locationUtils";
import { diagLog, hardReloadOnce } from "@/lib/diag";
import { Capacitor } from "@capacitor/core";
import SponsorStoryViewer, { SponsorStory } from "./SponsorStoryViewer";

function getSponsorLogoUrl(logoUrl: string | null): string | null {
  if (!logoUrl) return null;
  return logoUrl;
}

const DEFAULT_ITEMS_PER_PAGE = 4;
const AUTO_ADVANCE_MS = 6000;
/** Degradê nas bordas do scroll horizontal (evita “corte seco” do logo). */
const EDGE_MASK =
  "linear-gradient(to right, transparent 0%, black 28px, black calc(100% - 28px), transparent 100%)";

interface Sponsor {
  id: string;
  name: string;
  niche: string | null;
  link_url: string;
  logo_url: string | null;
  location_scope: string | null;
  location_state: string | null;
  location_city: string | null;
}

function sponsorMatchesLocation(
  s: Sponsor,
  userState: string | null,
  userCity: string | null
): boolean {
  const scope = s.location_scope || "nationwide";
  if (scope === "nationwide") return true;
  if (!userState) return false;
  const sponsorState = (s.location_state || "").trim().toUpperCase();
  const uState = (userState || "").trim().toUpperCase();
  if (sponsorState !== uState) return false;
  if (scope === "state") return true;
  if (scope === "city") {
    const sponsorCity = normalizeLocation(s.location_city || "");
    const uCity = normalizeLocation(userCity || "");
    return !!sponsorCity && !!uCity && sponsorCity === uCity;
  }
  return false;
}

interface SponsorCarouselProps {
  section?: { title?: string; subtitle?: string };
  /** Por página no carrossel (ex.: 4 itens por “página” ao deslizar). */
  itemsPerPage?: number;
  /** Este patrocinador aparece sempre primeiro (ex.: conta patrocinador na Home). */
  pinnedSponsorId?: string | null;
  /** Máscara em degradê nas bordas esquerda/direita. */
  edgeFade?: boolean;
}

const SponsorCarousel = ({
  section,
  itemsPerPage = DEFAULT_ITEMS_PER_PAGE,
  pinnedSponsorId = null,
  edgeFade = true,
}: SponsorCarouselProps) => {
  const { user } = useAuth();
  const { sponsor: viewerOwnerSponsor } = useLinkedSponsor(user?.id);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activePage, setActivePage] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [allSponsors, setAllSponsors] = useState<Sponsor[]>([]);
  // Init from cache immediately to avoid extra DB round-trip
  const cachedLoc = useMemo(() => getHomeLocationCache(), []);
  const [userState, setUserState] = useState<string | null>(cachedLoc?.state ?? null);
  const [userCity, setUserCity] = useState<string | null>(cachedLoc?.city ?? null);
  const [loaded, setLoaded] = useState(false);
  const [activeStories, setActiveStories] = useState<Record<string, SponsorStory[]>>({});
  const [viewerStories, setViewerStories] = useState<SponsorStory[] | null>(null);
  const [viewerStartIndex, setViewerStartIndex] = useState(0);

  const sponsors = useMemo(() => {
    const filtered = allSponsors.filter((s) => sponsorMatchesLocation(s, userState, userCity));
    if (pinnedSponsorId) {
      const pin = filtered.find((s) => s.id === pinnedSponsorId);
      const rest = filtered.filter((s) => s.id !== pinnedSponsorId);
      for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
      }
      return pin ? [pin, ...rest] : rest;
    }
    for (let i = filtered.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [filtered[i], filtered[j]] = [filtered[j], filtered[i]];
    }
    return filtered;
  }, [allSponsors, userState, userCity, pinnedSponsorId]);

  const pages = useMemo(() => {
    const p: Sponsor[][] = [];
    const step = Math.max(1, itemsPerPage);
    for (let i = 0; i < sponsors.length; i += step) p.push(sponsors.slice(i, i + step));
    return p;
  }, [sponsors, itemsPerPage]);

  // Inclui uma cópia da primeira página no final para sempre avançar (sem “voltar”)
  const displayPages = useMemo(() => {
    if (pages.length <= 1) return pages;
    return [...pages, pages[0]];
  }, [pages]);
  const totalDisplayPages = displayPages.length;
  const totalPages = pages.length; // para os dots

  const fromCloneToReset = useRef(false);
  const isScrollFromUser = useRef(false);
  const retryCountRef = useRef(0);
  const cancelledRef = useRef(false);
  const sponsorHangRetryRef = useRef(0);

  useEffect(() => {
    setLoaded(false);
    setAllSponsors([]);
    retryCountRef.current = 0;
    sponsorHangRetryRef.current = 0;
    cancelledRef.current = false;

    const fetchSponsors = (withLocation = true) => {
      const select = withLocation
        ? "id, name, niche, link_url, logo_url, location_scope, location_state, location_city"
        : "id, name, niche, link_url, logo_url";
      diagLog("info", "sponsors", "fetch start", { withLocation });
      let aborted = false;
      const timeoutMs = Capacitor.isNativePlatform() ? 22_000 : 12_000;
      const watchdog = setTimeout(() => {
        if (cancelledRef.current || aborted) return;
        aborted = true;
        diagLog("warn", "sponsors", "fetch timeout — nova tentativa", { ms: timeoutMs, withLocation });
        hardReloadOnce(`sponsors_timeout_${withLocation ? "withLocation" : "noLocation"}`);
        sponsorHangRetryRef.current += 1;
        if (sponsorHangRetryRef.current <= 6) {
          setTimeout(() => fetchSponsors(withLocation), 1_600);
        } else {
          sponsorHangRetryRef.current = 0;
          setLoaded(true);
        }
      }, timeoutMs);
      supabase
        .from("sponsors")
        .select(select)
        .eq("active", true)
        .order("sort_order")
        .then(({ data, error }) => {
          if (cancelledRef.current) return;
          if (aborted) return;
          aborted = true;
          clearTimeout(watchdog);
          sponsorHangRetryRef.current = 0;
          if (error) {
            diagLog("error", "sponsors", "fetch error", { withLocation, message: error.message, code: (error as any).code, details: (error as any).details, hint: (error as any).hint });
            if (withLocation) {
              fetchSponsors(false);
              return;
            }
            if (retryCountRef.current < 2) {
              retryCountRef.current += 1;
              const delay = retryCountRef.current === 1 ? 800 : 2000;
              setTimeout(() => fetchSponsors(false), delay);
              return;
            }
            setLoaded(true);
            return;
          }
          diagLog("info", "sponsors", "fetch ok", { count: data?.length ?? 0, withLocation });
          if (data && data.length > 0) {
            const list = (data as any[]).map((r) => ({
              id: r.id,
              name: r.name,
              niche: r.niche,
              link_url: r.link_url,
              logo_url: r.logo_url,
              location_scope: r.location_scope ?? "nationwide",
              location_state: r.location_state ?? null,
              location_city: r.location_city ?? null,
            }));
            setAllSponsors(list as Sponsor[]);
          }
          setLoaded(true);
        })
        .catch((e) => {
          if (cancelledRef.current) return;
          if (aborted) return;
          aborted = true;
          clearTimeout(watchdog);
          diagLog("error", "sponsors", "fetch threw", { withLocation, error: String(e) });
          if (withLocation) {
            fetchSponsors(false);
            return;
          }
          if (retryCountRef.current < 2) {
            retryCountRef.current += 1;
            const delay = retryCountRef.current === 1 ? 800 : 2000;
            setTimeout(() => fetchSponsors(false), delay);
            return;
          }
          setLoaded(true);
        });
    };

    fetchSponsors();
    return () => { cancelledRef.current = true; };
  }, []);

  const fetchActiveStories = useCallback(() => {
    if (allSponsors.length === 0) return;
    const ids = allSponsors.map((s) => s.id);
    void supabase
      .from("sponsor_stories")
      .select("id, sponsor_id, photo_url, caption, link_url, link_button_label, expires_at")
      .in("sponsor_id", ids)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (!data) return;
        const byId: Record<string, any[]> = {};
        for (const story of data as any[]) {
          const sp = allSponsors.find((s) => s.id === story.sponsor_id);
          if (!sp) continue;
          if (!byId[story.sponsor_id]) byId[story.sponsor_id] = [];
          byId[story.sponsor_id].push({
            id: story.id,
            sponsor_id: story.sponsor_id,
            sponsor_name: sp.name,
            sponsor_logo: sp.logo_url,
            photo_url: story.photo_url,
            caption: story.caption,
            link_url: story.link_url,
            link_button_label: story.link_button_label ?? null,
            sponsor_link: sp.link_url,
          });
        }
        setActiveStories(byId);
      });
  }, [allSponsors]);

  useEffect(() => {
    if (!loaded || allSponsors.length === 0) return;
    fetchActiveStories();
  }, [loaded, allSponsors, fetchActiveStories]);

  // Refresh location in background and update cache
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user || cancelled) return;
        const res = await supabase
          .from("profiles")
          .select("address_state, address_city")
          .eq("user_id", user.id)
          .maybeSingle();
        if (cancelled || !res?.data) return;
        const city = res.data.address_city || null;
        const state = res.data.address_state || null;
        diagLog("info", "sponsors", "user location refreshed", { state, city });
        writeHomeLocationCacheOnly(city, state);
        setUserState(state);
        setUserCity(city);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

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

  const scrollToPage = useCallback((pageIndex: number) => {
    if (!scrollRef.current || totalPages === 0) return;
    const page = Math.max(0, Math.min(pageIndex, totalPages - 1));
    isScrollFromUser.current = false;
    setActivePage(page);
    const left = page * scrollRef.current.clientWidth;
    scrollRef.current.scrollTo({ left, behavior: "smooth" });
  }, [totalPages]);

  const syncPageFromScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || totalDisplayPages === 0) return;
    const width = el.clientWidth;
    const scrollLeft = el.scrollLeft;
    const pageIndex = Math.round(scrollLeft / width);
    const clamped = Math.max(0, Math.min(pageIndex, totalDisplayPages - 1));
    isScrollFromUser.current = true;
    setActivePage(clamped);
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
    if (isScrollFromUser.current) {
      isScrollFromUser.current = false;
      return;
    }
    const left = activePage * scrollRef.current.clientWidth;
    const behavior = activePage === 0 && fromCloneToReset.current ? "auto" : "smooth";
    if (fromCloneToReset.current) fromCloneToReset.current = false;
    scrollRef.current.scrollTo({ left, behavior });
  }, [activePage, totalDisplayPages]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || totalDisplayPages <= 1) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        syncPageFromScroll();
        raf = 0;
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [totalDisplayPages, syncPageFromScroll]);

  const handleClick = (sponsor: Sponsor) => {
    const stories = activeStories[sponsor.id];
    if (stories && stories.length > 0) {
      // Monta lista plana de TODAS as stories de TODOS os patrocinadores (na ordem de exibição)
      // para permitir navegação entre patrocinadores dentro do viewer
      const allFlat = allSponsors.flatMap((sp) => activeStories[sp.id] || []);
      const startIndex = allFlat.findIndex((s) => s.sponsor_id === sponsor.id);
      setViewerStories(allFlat);
      setViewerStartIndex(startIndex >= 0 ? startIndex : 0);
    } else {
      const raw = (sponsor.link_url || "").trim();
      if (raw && raw !== "#") {
        const href = raw.includes("://") ? raw : `https://${raw}`;
        try {
          // eslint-disable-next-line no-new
          new URL(href);
          window.open(href, "_blank");
        } catch {
          /* link inválido no painel — ainda contabiliza o toque abaixo */
        }
      }
      supabase.auth.getSession().then(({ data: { session } }) => {
        const uid = session?.user?.id || null;
        supabase.from("sponsor_clicks").insert({ sponsor_id: sponsor.id, user_id: uid }).then(() => {});
        supabase.rpc("increment_sponsor_clicks" as any, { _sponsor_id: sponsor.id }).then(() => {});
      });
    }
  };

  if (!loaded) {
    const n = Math.min(Math.max(itemsPerPage, 4), 8);
    return (
      <section>
        <h3 className="font-semibold text-sm lg:text-base text-muted-foreground mb-2 lg:mb-3 px-1">{section?.title ?? "Patrocinadores"}</h3>
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: n }, (_, i) => (
            <div key={i} className="w-[65px] h-[65px] rounded-full bg-muted animate-pulse shrink-0" />
          ))}
        </div>
      </section>
    );
  }
  if (sponsors.length === 0) return null;

  const title = section?.title ?? "Patrocinadores";
  const subtitle = section?.subtitle ?? "Patrocinado";

  return (
    <>
    <section>
      <h3 className="font-semibold text-sm lg:text-base text-muted-foreground mb-2 lg:mb-3 px-1">{title}</h3>
      <div
        ref={scrollRef}
        data-tab-swipe-ignore
        className="flex overflow-x-auto overflow-y-hidden pb-2 scrollbar-hide border-0 shadow-none snap-x snap-mandatory scroll-smooth"
        style={{
          scrollBehavior: "smooth",
          ...(edgeFade
            ? {
                WebkitMaskImage: EDGE_MASK,
                maskImage: EDGE_MASK,
                WebkitMaskSize: "100% 100%",
                maskSize: "100% 100%",
                WebkitMaskRepeat: "no-repeat",
                maskRepeat: "no-repeat",
              }
            : {}),
        }}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}
      >
        {displayPages.map((pageSponsors, pageIndex) => (
          <div
            key={pageIndex}
            className="flex gap-6 lg:gap-10 flex-[0_0_100%] min-w-0 shrink-0 snap-start justify-evenly items-stretch px-2 lg:px-6"
            style={{ scrollSnapStop: "always" }}
          >
            {pageSponsors.map((sponsor) => {
              const hasStory = !!(activeStories[sponsor.id]?.length);
              return (
              <button
                key={sponsor.id}
                onClick={() => handleClick(sponsor)}
                className="flex-1 min-w-0 flex flex-col gap-1.5 items-center justify-start py-[4px] px-0 group"
              >
                <div className={`w-[65px] h-[65px] lg:w-[84px] lg:h-[84px] rounded-full flex items-center justify-center overflow-hidden shrink-0 ${hasStory ? "ring-2 ring-primary ring-offset-2 ring-offset-background lg:ring-offset-4" : "ring-2 ring-muted group-hover:ring-primary/40 transition-all"}`}>
                  <div className="w-full h-full rounded-full bg-muted flex items-center justify-center overflow-hidden">
                    {sponsor.logo_url ? (
                      <img
                        src={getSponsorLogoUrl(sponsor.logo_url)}
                        alt={sponsor.name}
                        className="w-full h-full object-cover rounded-full"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span className="text-xs font-bold text-muted-foreground leading-none">{sponsor.name.slice(0, 2).toUpperCase()}</span>
                    )}
                  </div>
                </div>
                <span className="text-[11px] lg:text-xs font-medium text-foreground truncate w-full text-center max-w-[100px] lg:max-w-[120px]">{sponsor.name}</span>
                <span className={`text-[9px] lg:text-[10px] -mt-1 ${hasStory ? "text-primary font-medium" : "text-muted-foreground"}`}>{hasStory ? "Novidade" : subtitle}</span>
              </button>
              );
            })}
          </div>
        ))}
      </div>
      {totalPages > 1 && (
        <div className="flex justify-center gap-1.5 mt-1">
          {pages.map((_, i) => (
            <button
              key={i}
              onClick={() => scrollToPage(i)}
              className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${i === activePage % totalPages ? "bg-primary" : "bg-muted-foreground/30"}`}
              aria-label={`Página ${i + 1}`}
            />
          ))}
        </div>
      )}
    </section>

    {/* Viewer de novidades */}
    {viewerStories && (
      <SponsorStoryViewer
        stories={viewerStories}
        initialIndex={viewerStartIndex}
        onClose={() => { setViewerStories(null); setViewerStartIndex(0); }}
        ownerSponsorId={viewerOwnerSponsor?.id ?? null}
        onStoryUpdated={(updated) => {
          setViewerStories((prev) => prev?.map((s) => (s.id === updated.id ? updated : s)) ?? null);
          fetchActiveStories();
        }}
        onStoryDeleted={(storyId) => {
          setViewerStories((prev) => {
            if (!prev) return null;
            const next = prev.filter((s) => s.id !== storyId);
            return next.length ? next : null;
          });
          fetchActiveStories();
        }}
      />
    )}
    </>
  );
};

export default SponsorCarousel;