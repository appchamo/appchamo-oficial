import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Sponsor {
  id: string;
  name: string;
  niche: string | null;
  link_url: string;
  logo_url: string | null;
}

interface SponsorCarouselProps {
  section?: { title?: string; subtitle?: string };
}

const SponsorCarousel = ({ section }: SponsorCarouselProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const itemWidth = 88;

  useEffect(() => {
    supabase.from("sponsors").select("id, name, niche, link_url, logo_url").eq("active", true).order("sort_order").then(({ data }) => {
      if (data) setSponsors(data);
    });
  }, []);

  const scrollTo = useCallback((index: number) => {
    if (!scrollRef.current || sponsors.length === 0) return;
    const wrappedIndex = index % sponsors.length;
    setActiveIndex(wrappedIndex);
    scrollRef.current.scrollTo({ left: wrappedIndex * itemWidth, behavior: "smooth" });
  }, [sponsors.length]);

  useEffect(() => {
    if (isPaused || sponsors.length === 0) return;
    const interval = setInterval(() => scrollTo(activeIndex + 1), 3000);
    return () => clearInterval(interval);
  }, [activeIndex, isPaused, scrollTo, sponsors.length]);

  const handleClick = (sponsor: Sponsor) => {
    // Open link synchronously (required for iOS Safari)
    window.open(sponsor.link_url, "_blank");
    // Record click asynchronously after - insert into sponsor_clicks AND increment sponsors.clicks
    supabase.auth.getUser().then(({ data: { user } }) => {
      supabase.from("sponsor_clicks").insert({ sponsor_id: sponsor.id, user_id: user?.id || null }).then(() => {});
      supabase.rpc("increment_sponsor_clicks" as any, { _sponsor_id: sponsor.id }).then(() => {});
    });
  };

  if (sponsors.length === 0) return null;

  const title = section?.title ?? "Patrocinadores";
  const subtitle = section?.subtitle ?? "Patrocinado";

  return (
    <section>
      <h3 className="font-semibold text-sm text-muted-foreground mb-3 px-1">{title}</h3>
      <div
        ref={scrollRef}
        className="flex overflow-x-auto pb-2 scrollbar-hide gap-[14px] border-0 shadow-none"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}>

        {sponsors.map((sponsor) =>
        <button
          key={sponsor.id}
          onClick={() => handleClick(sponsor)}
          className="flex-col gap-1.5 min-w-[76px] group mx-0 flex items-center justify-start py-[4px] px-px">

            <div className="w-[65px] h-[65px] rounded-full ring-2 ring-primary group-hover:ring-primary/70 transition-all flex items-center justify-center overflow-hidden">
              <div className="w-full h-full rounded-full bg-muted flex items-center justify-center overflow-hidden">
                {sponsor.logo_url ?
              <img src={sponsor.logo_url} alt={sponsor.name} className="w-full h-full object-cover rounded-full" /> :

              <span className="text-xs font-bold text-muted-foreground leading-none">
                    {sponsor.name.slice(0, 2).toUpperCase()}
                  </span>
              }
              </div>
            </div>
            <span className="text-[11px] font-medium text-foreground truncate max-w-[76px] text-center">
              {sponsor.name}
            </span>
            <span className="text-[9px] text-muted-foreground -mt-1">{subtitle}</span>
          </button>
        )}
      </div>
      <div className="flex justify-center gap-1.5 mt-2">
        {sponsors.map((_, i) =>
        <button
          key={i}
          onClick={() => scrollTo(i)}
          className={`w-1.5 h-1.5 rounded-full transition-colors ${i === activeIndex ? "bg-primary" : "bg-muted-foreground/30"}`} />

        )}
      </div>
    </section>);

};

export default SponsorCarousel;