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
  carousel_group: string | null;
}

interface Props {
  position: string;
}

// Componente interno para um único item de carrossel (ou banner único)
const BannerGroup = ({ banners, isMobile }: { banners: Banner[]; isMobile: boolean }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isMultiple = banners.length > 1;

  const goToSlide = useCallback((index: number) => {
    if (!scrollRef.current) return;
    const i = Math.max(0, Math.min(index, banners.length - 1));
    setActiveIndex(i);
    scrollRef.current.scrollTo({ left: i * scrollRef.current.clientWidth, behavior: "smooth" });
  }, [banners.length]);

  // Auto-avança só quando tem múltiplos banners
  useEffect(() => {
    if (!isMultiple) return;
    const t = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % banners.length);
    }, BANNER_CAROUSEL_MS);
    return () => clearInterval(t);
  }, [isMultiple, banners.length]);

  // Sincroniza scroll com activeIndex
  useEffect(() => {
    if (!scrollRef.current || !isMultiple) return;
    scrollRef.current.scrollTo({ left: activeIndex * scrollRef.current.clientWidth, behavior: "smooth" });
  }, [activeIndex, isMultiple]);

  // Detecta scroll manual (touch) e atualiza o indicador
  const handleScroll = useCallback(() => {
    if (!scrollRef.current || !isMultiple) return;
    const idx = Math.round(scrollRef.current.scrollLeft / scrollRef.current.clientWidth);
    setActiveIndex(idx);
  }, [isMultiple]);

  return (
    <section className="w-full mt-[3%] mb-[3%]">
      <div
        ref={scrollRef}
        className="flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory scrollbar-hide"
        style={{ scrollBehavior: "smooth" }}
        onScroll={handleScroll}
      >
        {banners.map((b) => {
          const displayImage = (isMobile && b.image_url_mobile) ? b.image_url_mobile : b.image_url;
          return (
            <a
              key={b.id}
              href={b.link_url && b.link_url !== "#" ? b.link_url : undefined}
              target={b.link_url && b.link_url !== "#" ? "_blank" : undefined}
              rel="noopener noreferrer"
              className="flex-[0_0_100%] min-w-0 w-full snap-start block rounded-2xl overflow-hidden shadow-sm border"
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

      {/* Pontinhos — só aparecem quando há múltiplos banners no grupo */}
      {isMultiple && (
        <div className="flex justify-center gap-1.5 mt-2">
          {banners.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goToSlide(i)}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                i === activeIndex ? "bg-primary w-4" : "bg-muted-foreground/30"
              }`}
              aria-label={`Banner ${i + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
};

// Componente principal — agrupa banners por carousel_group
const HomeBanners = ({ position }: Props) => {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [isMobile, setIsMobile] = useState(false);

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

  if (banners.length === 0) return null;

  // Agrupa banners pelo carousel_group.
  // Banners sem grupo aparecem individualmente (sem pontinhos).
  // Banners com o mesmo carousel_group aparecem juntos (com pontinhos se > 1).
  const groups: Banner[][] = [];
  const seenGroups = new Set<string>();

  banners.forEach((b) => {
    if (!b.carousel_group) {
      // Banner individual — sem carrossel
      groups.push([b]);
    } else if (!seenGroups.has(b.carousel_group)) {
      seenGroups.add(b.carousel_group);
      groups.push(banners.filter((x) => x.carousel_group === b.carousel_group));
    }
  });

  return (
    <>
      {groups.map((group) => (
        <BannerGroup key={group[0].id} banners={group} isMobile={isMobile} />
      ))}
    </>
  );
};

export default HomeBanners;
