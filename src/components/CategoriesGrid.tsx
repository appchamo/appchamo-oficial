import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { diagLog, hardReloadOnce } from "@/lib/diag";
import { Capacitor } from "@capacitor/core";
import {
  Hammer, Home, Scissors, HeartPulse, Car, Monitor,
  Camera, BriefcaseBusiness, Tractor, Truck, PawPrint, Briefcase,
  Wrench, Paintbrush, Zap, Droplets, ShieldCheck, BookOpen,
  Dumbbell, UtensilsCrossed, Baby, Laptop, Sparkles, Music,
  Leaf, Building2, Cog, Palette,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const iconMap: Record<string, LucideIcon> = {
  Hammer, Home, Scissors, HeartPulse, Car, Monitor,
  Camera, BriefcaseBusiness, Tractor, Truck, PawPrint, Briefcase,
  Wrench, Paintbrush, Zap, Droplets, ShieldCheck, BookOpen,
  Dumbbell, UtensilsCrossed, Baby, Laptop, Sparkles, Music,
  Leaf, Building2, Cog, Palette,
};


interface Category {
  id: string;
  name: string;
  slug: string;
  icon_name: string;
  icon_url: string | null;
}

interface CategoriesGridProps {
  section?: { title?: string };
}

const CategoriesGrid = ({ section }: CategoriesGridProps) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const retryCountRef = useRef(0);
  const cancelledRef = useRef(false);
  const hangRetryRef = useRef(0);
  const [gridCols, setGridCols] = useState(4);

  useEffect(() => {
    const read = () => {
      const w = window.innerWidth;
      if (w >= 1536) setGridCols(8);
      else if (w >= 1280) setGridCols(7);
      else if (w >= 1024) setGridCols(6);
      else if (w >= 640) setGridCols(5);
      else setGridCols(4);
    };
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);

  const visibleCount = gridCols * 2;

  useEffect(() => {
    setLoaded(false);
    setCategories([]);
    retryCountRef.current = 0;
    hangRetryRef.current = 0;
    cancelledRef.current = false;

    const fetchCategories = () => {
      diagLog("info", "categories", "fetch start");
      let aborted = false;
      const timeoutMs = Capacitor.isNativePlatform() ? 22_000 : 12_000;
      const watchdog = setTimeout(() => {
        if (cancelledRef.current || aborted) return;
        aborted = true;
        diagLog("warn", "categories", "fetch timeout — nova tentativa", { ms: timeoutMs });
        hardReloadOnce("categories_timeout");
        hangRetryRef.current += 1;
        if (hangRetryRef.current <= 6) {
          setTimeout(fetchCategories, 1_600);
        } else {
          hangRetryRef.current = 0;
          setLoaded(true);
        }
      }, timeoutMs);
      supabase
        .from("categories")
        .select("id, name, slug, icon_name, icon_url")
        .eq("active", true)
        .order("sort_order")
        .then(({ data, error }) => {
          if (cancelledRef.current) return;
          if (aborted) return;
          aborted = true;
          clearTimeout(watchdog);
          hangRetryRef.current = 0;
          if (error) {
            diagLog("error", "categories", "fetch error", { message: error.message, code: (error as any).code, details: (error as any).details, hint: (error as any).hint });
            if (retryCountRef.current < 2) {
              retryCountRef.current += 1;
              const delay = retryCountRef.current === 1 ? 800 : 2000;
              setTimeout(fetchCategories, delay);
              return;
            }
            setLoaded(true);
            return;
          }
          diagLog("info", "categories", "fetch ok", { count: data?.length ?? 0 });
          if (data && data.length > 0) {
            setCategories(data);
          }
          setLoaded(true);
        })
        .catch((e) => {
          if (cancelledRef.current) return;
          if (aborted) return;
          aborted = true;
          clearTimeout(watchdog);
          diagLog("error", "categories", "fetch threw", { error: String(e) });
          if (retryCountRef.current < 2) {
            retryCountRef.current += 1;
            const delay = retryCountRef.current === 1 ? 800 : 2000;
            setTimeout(fetchCategories, delay);
            return;
          }
          setLoaded(true);
        });
    };

    // Pequeno atraso na 1ª tentativa para a sessão (pós-OAuth) estabilizar no app nativo
    const t = setTimeout(fetchCategories, 400);
    return () => { cancelledRef.current = true; clearTimeout(t); };
  }, []);

  if (!loaded) {
    return (
      <section>
        <h3 className="font-semibold lg:text-lg text-foreground mb-3 lg:mb-4 px-1">{section?.title ?? "Categorias"}</h3>
        <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-3 lg:gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5 lg:gap-2 p-2.5 lg:p-3.5 min-h-[90px] lg:min-h-[104px] rounded-2xl lg:rounded-3xl bg-muted animate-pulse">
              <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-xl bg-muted-foreground/20" />
              <div className="h-3 w-12 lg:w-14 rounded bg-muted-foreground/20" />
            </div>
          ))}
        </div>
      </section>
    );
  }
  if (categories.length === 0) return null;

  const shown = expanded ? categories : categories.slice(0, visibleCount);

  return (
    <section>
      <h3 className="font-semibold lg:text-lg text-foreground mb-3 lg:mb-4 px-1">{section?.title ?? "Categorias"}</h3>
      <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-3 lg:gap-4">
      {shown.map((cat) => {
          const Icon = iconMap[cat.icon_name] || Briefcase;
          return (
            <Link
              key={cat.id}
              to={`/category/${cat.slug}`}
              className="flex flex-col items-center justify-start gap-1.5 lg:gap-2 p-2.5 lg:p-3.5 min-h-[90px] lg:min-h-[104px] rounded-2xl lg:rounded-3xl bg-card border hover:border-primary/40 hover:shadow-lg lg:hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 group overflow-hidden"
            >
              <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-xl lg:rounded-2xl bg-white flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-200">
                {cat.icon_url ? (
                  <img src={cat.icon_url} alt={cat.name} className="w-6 h-6 lg:w-7 lg:h-7 object-contain" />
                ) : (
                  <Icon className="w-5 h-5 lg:w-6 lg:h-6 text-primary" />
                )}
              </div>
              <span className="text-[9px] sm:text-[10px] lg:text-xs font-medium text-foreground text-center leading-tight line-clamp-3 w-full min-h-[2.25rem] lg:min-h-[2.5rem] flex items-center justify-center break-words overflow-hidden px-0.5">
                {cat.name}
              </span>
            </Link>
          );
        })}
      </div>
      {categories.length > visibleCount && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full mt-3 lg:mt-4 py-2.5 lg:py-3 rounded-xl lg:rounded-2xl border text-sm lg:text-base font-medium text-primary hover:bg-accent transition-colors"
        >
          {expanded ? "Ver menos" : "Ver mais"}
        </button>
      )}
    </section>
  );
};

export default CategoriesGrid;
