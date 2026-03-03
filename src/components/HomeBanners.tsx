import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const BANNER_CAROUSEL_MS = 5000;

interface Banner {
  id: string;
  title: string;
  image_url: string;
  image_url_mobile?: string;
  link_url: string;
  position: string;
  sort_order: number;
  width: string;
  height: string;
}

interface Props {
  position: string;
}

const HomeBanners = ({ position }: Props) => {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isCarousel = position === "carousel";

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    supabase
      .from("banners" as any)
      .select("*")
      .eq("active", true)
      .eq("position", position)
      .order("sort_order")
      .then(({ data }) => setBanners((data as any[]) || []));
  }, [position]);

  const goToSlide = useCallback((index: number) => {
    if (!scrollRef.current || banners.length === 0) return;
    const i = Math.max(0, Math.min(index, banners.length - 1));
    setActiveIndex(i);
    const left = i * scrollRef.current.clientWidth;
    scrollRef.current.scrollTo({ left, behavior: "smooth" });
  }, [banners.length]);

  useEffect(() => {
    if (!isCarousel || banners.length <= 1) return;
    const t = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % banners.length);
    }, BANNER_CAROUSEL_MS);
    return () => clearInterval(t);
  }, [isCarousel, banners.length]);

  useEffect(() => {
    if (!isCarousel || !scrollRef.current || banners.length === 0) return;
    const left = activeIndex * scrollRef.current.clientWidth;
    scrollRef.current.scrollTo({ left, behavior: "smooth" });
  }, [activeIndex, isCarousel, banners.length]);

  if (banners.length === 0) return null;

  const spacingClass = "mt-[3%] mb-[3%]";

  if (isCarousel) {
    return (
      <section className={`w-full ${spacingClass}`}>
        <div
          ref={scrollRef}
          className="flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory scroll-smooth scrollbar-hide"
          style={{ scrollBehavior: "smooth" }}
          onTouchStart={() => setActiveIndex(activeIndex)}
        >
          {banners.map((b) => {
            const displayImage = (isMobile && b.image_url_mobile) ? b.image_url_mobile : b.image_url;
            return (
              <a
                key={b.id}
                href={b.link_url !== "#" ? b.link_url : undefined}
                target={b.link_url !== "#" ? "_blank" : undefined}
                rel="noopener noreferrer"
                className="flex-[0_0_100%] min-w-0 w-full snap-start block rounded-2xl overflow-hidden shadow-sm border"
                style={{ height: isMobile ? "auto" : "180px" }}
              >
                <img
                  src={displayImage}
                  alt={b.title || "Banner"}
                  className="w-full h-full object-cover min-h-[140px]"
                />
              </a>
            );
          })}
        </div>
        {banners.length > 1 && (
          <div className="flex justify-center gap-1.5 mt-2">
            {banners.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goToSlide(i)}
                className={`w-2 h-2 rounded-full transition-colors duration-300 ${i === activeIndex ? "bg-primary" : "bg-muted-foreground/30"}`}
                aria-label={`Banner ${i + 1}`}
              />
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <div className={`flex flex-col gap-3 ${spacingClass}`}>
      {banners.map((b) => {
        const displayImage = (isMobile && b.image_url_mobile) ? b.image_url_mobile : b.image_url;
        return (
          <a
            key={b.id}
            href={b.link_url !== "#" ? b.link_url : undefined}
            target={b.link_url !== "#" ? "_blank" : undefined}
            rel="noopener noreferrer"
            className="block rounded-2xl overflow-hidden shadow-sm border"
            style={{ width: b.width, height: isMobile ? "auto" : b.height }}
          >
            <img
              src={displayImage}
              alt={b.title || "Banner"}
              className="w-full h-full object-cover"
            />
          </a>
        );
      })}
    </div>
  );
};

export default HomeBanners;