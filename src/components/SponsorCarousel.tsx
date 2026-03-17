import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeLocation } from "@/lib/locationUtils";

const ITEMS_PER_PAGE = 4;
const AUTO_ADVANCE_MS = 6000;

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
}

const SponsorCarousel = ({ section }: SponsorCarouselProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activePage, setActivePage] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [allSponsors, setAllSponsors] = useState<Sponsor[]>([]);
  const [userState, setUserState] = useState<string | null>(null);
  const [userCity, setUserCity] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const sponsors = useMemo(() => {
    return allSponsors.filter((s) => sponsorMatchesLocation(s, userState, userCity));
  }, [allSponsors, userState, userCity]);

  const pages = useMemo(() => {
    const p: Sponsor[][] = [];
    for (let i = 0; i < sponsors.length; i += ITEMS_PER_PAGE) p.push(sponsors.slice(i, i + ITEMS_PER_PAGE));
    return p;
  }, [sponsors]);

  // Inclui uma cópia da primeira página no final para sempre avançar (sem “voltar”)
  const displayPages = useMemo(() => {
    if (pages.length <= 1) return pages;
    return [...pages, pages[0]];
  }, [pages]);
  const totalDisplayPages = displayPages.length;
  const totalPages = pages.length; // para os dots

  const fromCloneToReset = useRef(false);
  const retryCountRef = useRef(0);
  const cancelledRef = useRef(false);

  useEffect(() => {
    setLoaded(false);
    setSponsors([]);
    retryCountRef.current = 0;
    cancelledRef.current = false;

    const fetchSponsors = () => {
      supabase
        .from("sponsors")
        .select("id, name, niche, link_url, logo_url, location_scope, location_state, location_city")
        .eq("active", true)
        .order("sort_order")
        .then(({ data, error }) => {
          if (cancelledRef.current) return;
          if (error) {
            if (retryCountRef.current < 2) {
              retryCountRef.current += 1;
              const delay = retryCountRef.current === 1 ? 800 : 2000;
              setTimeout(fetchSponsors, delay);
              return;
            }
            setLoaded(true);
            return;
          }
          if (data && data.length > 0) {
            setAllSponsors(data as Sponsor[]);
          }
          setLoaded(true);
        })
        .catch(() => {
          if (cancelledRef.current) return;
          if (retryCountRef.current < 2) {
            retryCountRef.current += 1;
            const delay = retryCountRef.current === 1 ? 800 : 2000;
            setTimeout(fetchSponsors, delay);
            return;
          }
          setLoaded(true);
        });
    };

    const t = setTimeout(fetchSponsors, 400);
    return () => { cancelledRef.current = true; clearTimeout(t); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || cancelled) return;
      supabase
        .from("profiles")
        .select("address_state, address_city")
        .eq("user_id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (!cancelled && data) {
            setUserState(data.address_state || null);
            setUserCity(data.address_city || null);
          }
        });
    });
    return () => { cancelled = true; };
  }, []);

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

  const handleClick = (sponsor: Sponsor) => {
    window.open(sponsor.link_url, "_blank");
    supabase.auth.getUser().then(({ data: { user } }) => {
      supabase.from("sponsor_clicks").insert({ sponsor_id: sponsor.id, user_id: user?.id || null }).then(() => {});
      supabase.rpc("increment_sponsor_clicks" as any, { _sponsor_id: sponsor.id }).then(() => {});
    });
  };

  if (!loaded) {
    return (
      <section>
        <h3 className="font-semibold text-sm text-muted-foreground mb-2 px-1">{section?.title ?? "Patrocinadores"}</h3>
        <div className="flex gap-3 overflow-hidden">
          {[1, 2, 3, 4].map((i) => (
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
    <section>
      <h3 className="font-semibold text-sm text-muted-foreground mb-2 px-1">{title}</h3>
      <div
        ref={scrollRef}
        className="flex overflow-x-auto overflow-y-hidden pb-2 scrollbar-hide border-0 shadow-none snap-x snap-mandatory scroll-smooth"
        style={{ scrollBehavior: "smooth" }}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}
      >
        {displayPages.map((pageSponsors, pageIndex) => (
          <div
            key={pageIndex}
            className="flex gap-[14px] flex-[0_0_100%] min-w-0 shrink-0 snap-start justify-evenly items-stretch px-0.5"
          >
            {pageSponsors.map((sponsor) => (
              <button
                key={sponsor.id}
                onClick={() => handleClick(sponsor)}
                className="flex-1 min-w-0 flex flex-col gap-1.5 items-center justify-start py-[4px] px-0 group"
              >
                <div className="w-[65px] h-[65px] rounded-full ring-2 ring-primary group-hover:ring-primary/70 transition-all flex items-center justify-center overflow-hidden shrink-0">
                  <div className="w-full h-full rounded-full bg-muted flex items-center justify-center overflow-hidden">
                    {sponsor.logo_url ? (
                      <img src={sponsor.logo_url} alt={sponsor.name} className="w-full h-full object-cover rounded-full" />
                    ) : (
                      <span className="text-xs font-bold text-muted-foreground leading-none">{sponsor.name.slice(0, 2).toUpperCase()}</span>
                    )}
                  </div>
                </div>
                <span className="text-[11px] font-medium text-foreground truncate w-full text-center">{sponsor.name}</span>
                <span className="text-[9px] text-muted-foreground -mt-1">{subtitle}</span>
              </button>
            ))}
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
  );
};

export default SponsorCarousel;